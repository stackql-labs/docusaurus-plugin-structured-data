// The fixture site: four pages with the <head> Docusaurus 3.9 renders
// (test/fixtures/site/), plus the site config and content metadata that go
// with them. The pages carry the theme's own JSON-LD in
// <script data-rh="true" type="application/ld+json"> blocks:
//
//   /                     JSX home page, no native JSON-LD, default image
//   /docs/guides/install  docs page, native BreadcrumbList, default image
//   /blog                 blog list page, native Blog with nested BlogPostings
//   /blog/post            blog post, native BlogPosting, its own image
//
// graphs-1.7.1.json is what plugin 1.7.1 wrote for this site with the
// config below, with the clock held at BUILD_TIME.

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const SITE_DIR = path.join(__dirname, 'site');
const ROUTES = ['/', '/docs/guides/install', '/blog', '/blog/post'];
const BUILD_TIME = '2025-06-01T00:00:00.000Z';

const structuredData = (extra = {}) => ({
  featuredImageDimensions: { width: 1200, height: 630 },
  authors: {
    'Jane Doe': {
      authorId: '1',
      url: 'https://example.com/jane',
      imageUrl: 'https://example.com/img/jane.png',
      sameAs: ['https://github.com/jane'],
    },
  },
  organization: {
    sameAs: ['https://github.com/example'],
    logo: 'https://example.com/img/logo.png',
  },
  website: { inLanguage: 'en-US' },
  webpage: { inLanguage: 'en-US', datePublished: '2021-07-01' },
  softwareSourceCode: { codeRepository: 'https://github.com/example/product', programmingLanguage: 'Go' },
  softwareApplication: { name: 'Product', applicationCategory: 'DeveloperApplication', isAccessibleForFree: true },
  ...extra,
});

const context = (extra) => ({
  siteConfig: {
    url: 'https://example.com',
    baseUrl: '/',
    title: 'Site',
    tagline: 'Tag',
    titleDelimiter: '|',
    themeConfig: { image: 'img/social-card.png', structuredData: structuredData(extra) },
  },
});

// What the content plugins hand allContentLoaded for these pages.
const allContent = {
  'docusaurus-plugin-content-docs': {
    default: {
      loadedVersions: [
        {
          path: '/docs',
          docs: [{ permalink: '/docs/guides/install', frontMatter: {}, lastUpdatedAt: 1717200000000 }],
        },
      ],
    },
  },
  'docusaurus-plugin-content-blog': {
    default: {
      blogTitle: 'Blog',
      blogTagsListPath: '/blog/tags',
      blogListPaginated: [{ metadata: { permalink: '/blog' } }],
      blogPosts: [{ metadata: { permalink: '/blog/post', frontMatter: {}, date: '2024-01-15T00:00:00.000Z' } }],
    },
  },
};

// Copy the pages to a scratch directory and run the plugin over them.
// `extra` is merged over the structuredData config; `pages` maps a route to
// HTML that replaces its fixture page.
async function buildSite(plugin, extra, pages = {}) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sd-site-'));
  await fs.cp(SITE_DIR, outDir, { recursive: true });
  for (const [route, html] of Object.entries(pages)) {
    await fs.writeFile(path.join(outDir, fileFor(route)), html);
  }
  const ctx = context(extra);
  const p = plugin(ctx, { id: 'default' });
  await p.allContentLoaded({ allContent, actions: {} });
  await p.postBuild({ siteConfig: ctx.siteConfig, routesPaths: ROUTES, outDir });
  return outDir;
}

const fileFor = (route) => (route === '/' ? 'index.html' : `${route.replace(/^\//, '')}.html`);

// Every JSON-LD block of a built page: the theme's own (data-rh) blocks,
// as written (nativeTags) and parsed (native, the ones that are valid
// JSON), and the @graph of the block the plugin added.
async function readPage(outDir, route) {
  const html = await fs.readFile(path.join(outDir, fileFor(route)), 'utf8');
  const native = [];
  const nativeTags = [];
  let graph = null;
  for (const [tag, attrs, body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!attrs.includes('application/ld+json')) continue;
    if (attrs.includes('data-rh')) {
      nativeTags.push(tag);
      try {
        native.push(JSON.parse(body));
      } catch {
        // a block the theme (or a page author) got wrong; nothing to parse
      }
    } else {
      graph = JSON.parse(body)['@graph'];
    }
  }
  return { html, native, nativeTags, graph };
}

async function sourcePage(route) {
  return fs.readFile(path.join(SITE_DIR, fileFor(route)), 'utf8');
}

module.exports = { ROUTES, BUILD_TIME, structuredData, context, allContent, buildSite, readPage, sourcePage };
