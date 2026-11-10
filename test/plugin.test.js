const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const plugin = require('../src/index');

const context = (structuredData) => ({
  siteConfig: {
    url: 'https://example.com',
    baseUrl: '/',
    title: 'Site',
    tagline: 'Tag',
    titleDelimiter: '|',
    themeConfig: { structuredData },
  },
});

test('plugin options are rejected with a pointer to themeConfig', () => {
  assert.throws(() => plugin(context({ authors: {} }), { id: 'default', excludedRoutes: [] }), /configure it under themeConfig.structuredData/);
  assert.doesNotThrow(() => plugin(context({ authors: {} }), { id: 'default' }));
  assert.doesNotThrow(() => plugin(context({ authors: {} })));
});

test('a bad featuredImageDimensions block fails at construction', () => {
  assert.throws(() => plugin(context({ authors: {}, featuredImageDimensions: { width: 100 } })), /featuredImageDimensions must be/);
});

const pageWith = (head = '') =>
  `<!doctype html><html><head><title>Intro | Site</title><meta name="description" content="About intro">${head}</head><body><h1>Intro</h1></body></html>`;
const page = pageWith();
// A blog post as Docusaurus renders its head: og:type article plus the author.
const articlePage = pageWith(
  '<meta property="og:type" content="article">' +
  '<meta property="og:image" content="https://example.com/post.png">' +
  '<meta name="author" content="Jane">' +
  '<meta property="article:author" content="https://example.com/jane">',
);

// A localized build: Docusaurus sets baseUrl to /<locale>/ and
// i18n.currentLocale to a locale other than defaultLocale.
const localeContext = (structuredData, locale, localeConfigs) => {
  const ctx = context(structuredData);
  return {
    siteConfig: { ...ctx.siteConfig, baseUrl: `/${locale}/` },
    i18n: { currentLocale: locale, defaultLocale: 'en', localeConfigs },
  };
};

// `pages` maps a route to its HTML; any other route gets the plain page.
async function build(ctx, routes, pages = {}) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sd-'));
  for (const route of routes) {
    const rel = route === '/' ? 'index.html' : `${route.replace(/^\//, '')}.html`;
    await fs.mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
    await fs.writeFile(path.join(outDir, rel), pages[route] || page);
  }
  const p = plugin(ctx, { id: 'default' });
  await p.allContentLoaded({ allContent: {}, actions: {} });
  await p.postBuild({ siteConfig: ctx.siteConfig, routesPaths: routes.map((r) => (ctx.siteConfig.baseUrl.replace(/\/$/, '') + r)), outDir });
  return outDir;
}

// The JSON-LD graph the plugin wrote into a built page, and a node of it.
async function graph(outDir, rel) {
  const html = await fs.readFile(path.join(outDir, rel), 'utf8');
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, `${rel} has no JSON-LD script`);
  return JSON.parse(match[1])['@graph'];
}

function node(nodes, type) {
  const found = nodes.find((n) => n['@type'] === type);
  assert.ok(found, `no ${type} node in the graph`);
  return found;
}

test('a localized build emits the locale htmlLang as inLanguage and keeps the locale in URLs', async () => {
  const ctx = {
    ...context({ authors: {}, webpage: { inLanguage: 'en-US' } }),
    i18n: {
      currentLocale: 'de',
      defaultLocale: 'en',
      localeConfigs: { en: { htmlLang: 'en' }, de: { htmlLang: 'de' } },
    },
  };
  ctx.siteConfig = { ...ctx.siteConfig, baseUrl: '/de/' };
  const outDir = await build(ctx, ['/intro']);
  const html = await fs.readFile(path.join(outDir, 'intro.html'), 'utf8');
  assert.match(html, /"inLanguage":\s*"de"/);
  assert.doesNotMatch(html, /"inLanguage":\s*"en-US"/);
  assert.match(html, /"url":\s*"https:\/\/example\.com\/de\/intro"/);
  // breadcrumb home is the localized root
  assert.match(html, /"item":\s*"https:\/\/example\.com\/de"/);
});

test('the default locale keeps webpage.inLanguage', async () => {
  const ctx = {
    ...context({ authors: {}, webpage: { inLanguage: 'en-US' } }),
    i18n: { currentLocale: 'en', defaultLocale: 'en', localeConfigs: { en: { htmlLang: 'en' }, de: { htmlLang: 'de' } } },
  };
  const outDir = await build(ctx, ['/intro']);
  const html = await fs.readFile(path.join(outDir, 'intro.html'), 'utf8');
  assert.match(html, /"inLanguage":\s*"en-US"/);
});

test('a localized build uses the locale htmlLang, not the locale key', async () => {
  const ctx = localeContext({ authors: {}, webpage: { inLanguage: 'en-US' } }, 'de', {
    en: { htmlLang: 'en-US' },
    de: { htmlLang: 'de-DE' },
  });
  const outDir = await build(ctx, ['/intro']);
  assert.equal(node(await graph(outDir, 'intro.html'), 'WebPage').inLanguage, 'de-DE');
});

test('a locale with no htmlLang falls back to the locale key', async () => {
  // no localeConfigs at all, no entry for the locale, an entry without htmlLang
  for (const localeConfigs of [undefined, { en: { htmlLang: 'en-US' } }, { fr: {} }]) {
    const ctx = localeContext({ authors: {}, webpage: { inLanguage: 'en-US' } }, 'fr', localeConfigs);
    const outDir = await build(ctx, ['/intro']);
    assert.equal(node(await graph(outDir, 'intro.html'), 'WebPage').inLanguage, 'fr');
  }
});

test('a site without i18n uses webpage.inLanguage, defaulting to en-US', async () => {
  const configured = await build(context({ authors: {}, webpage: { inLanguage: 'en-AU' } }), ['/intro']);
  assert.equal(node(await graph(configured, 'intro.html'), 'WebPage').inLanguage, 'en-AU');

  const unconfigured = await build(context({ authors: {} }), ['/intro']);
  assert.equal(node(await graph(unconfigured, 'intro.html'), 'WebPage').inLanguage, 'en-US');
});

// An Article (blog post with a configured author) and a TechArticle (docs
// page), each with its WebPage and primary image; the Article also carries
// the author's Person image.
const articleSite = (extra = {}) => ({
  authors: {
    Jane: { authorId: '1', url: 'https://example.com/jane', imageUrl: 'https://example.com/jane.png', sameAs: [] },
  },
  featuredImageDimensions: { width: 1200, height: 630 },
  webpage: { inLanguage: 'en-AU' },
  ...extra,
});

async function articleLanguages(ctx) {
  const outDir = await build(ctx, ['/blog/post', '/docs/intro'], { '/blog/post': articlePage });
  const post = await graph(outDir, 'blog/post.html');
  const doc = await graph(outDir, 'docs/intro.html');
  return {
    article: node(post, 'Article').inLanguage,
    articleWebPage: node(post, 'WebPage').inLanguage,
    articleImage: node(post, 'ImageObject').inLanguage,
    authorImage: node(post, 'Person').image.inLanguage,
    techArticle: node(doc, 'TechArticle').inLanguage,
    techArticleWebPage: node(doc, 'WebPage').inLanguage,
    techArticleImage: node(doc, 'ImageObject').inLanguage,
  };
}

const everyNode = (lang) => ({
  article: lang,
  articleWebPage: lang,
  articleImage: lang,
  authorImage: lang,
  techArticle: lang,
  techArticleWebPage: lang,
  techArticleImage: lang,
});

test('Article, TechArticle and their images carry the locale htmlLang in a localized build', async () => {
  // techArticleRoutePrefixes match the full public path, baseUrl included
  const ctx = localeContext(articleSite({ techArticleRoutePrefixes: ['/de/docs/'] }), 'de', {
    en: { htmlLang: 'en-US' },
    de: { htmlLang: 'de-DE' },
  });
  assert.deepEqual(await articleLanguages(ctx), everyNode('de-DE'));
});

test('Article, TechArticle and their images carry webpage.inLanguage on the default locale', async () => {
  const ctx = {
    ...context(articleSite()),
    i18n: { currentLocale: 'en', defaultLocale: 'en', localeConfigs: { en: { htmlLang: 'en-US' }, de: { htmlLang: 'de-DE' } } },
  };
  assert.deepEqual(await articleLanguages(ctx), everyNode('en-AU'));
});

test('softwareSourceCode and softwareApplication defaults are validated at construction', () => {
  assert.throws(() => plugin(context({ authors: {}, softwareSourceCode: { license: 'MIT' } })), /codeRepository/);
  assert.throws(() => plugin(context({ authors: {}, softwareApplication: { applicationCategory: 'Nope' } })), /application category/);
  assert.doesNotThrow(() =>
    plugin(context({
      authors: {},
      softwareSourceCode: { codeRepository: 'https://github.com/x/y' },
      softwareApplication: { applicationCategory: 'DeveloperApplication', isAccessibleForFree: true },
    })),
  );
});
