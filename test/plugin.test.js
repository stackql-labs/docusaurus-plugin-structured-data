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

const page = '<!doctype html><html><head><title>Intro | Site</title><meta name="description" content="About intro"></head><body><h1>Intro</h1></body></html>';

async function build(ctx, routes) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sd-'));
  for (const route of routes) {
    const rel = route === '/' ? 'index.html' : `${route.replace(/^\//, '')}.html`;
    await fs.mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
    await fs.writeFile(path.join(outDir, rel), page);
  }
  const p = plugin(ctx, { id: 'default' });
  await p.allContentLoaded({ allContent: {}, actions: {} });
  await p.postBuild({ siteConfig: ctx.siteConfig, routesPaths: routes.map((r) => (ctx.siteConfig.baseUrl.replace(/\/$/, '') + r)), outDir });
  return outDir;
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
