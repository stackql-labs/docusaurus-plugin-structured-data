// The plugin next to the JSON-LD Docusaurus's classic theme writes itself
// (nativeStructuredData: 'ignore' | 'reuse'), and image dimensions for pages
// with their own image. Runs over the fixture site in test/fixtures.

const test = require('node:test');
const assert = require('node:assert/strict');
const plugin = require('../src/index');
const { ARTICLE_TYPES } = require('../src/lib');
const { ROUTES, BUILD_TIME, buildSite, readPage, sourcePage } = require('./fixtures/site');
const baseline = require('./fixtures/graphs-1.7.1.json');

// Pages with no date of their own carry the build time; hold it still so
// two builds, and the recorded 1.7.1 output, are comparable.
const freezeClock = (t) => t.mock.timers.enable({ apis: ['Date'], now: Date.parse(BUILD_TIME) });

const typed = (nodes, type) => nodes.filter((n) => n['@type'] === type);
const one = (nodes, type) => {
  const found = typed(nodes, type);
  assert.equal(found.length, 1, `expected one ${type}, found ${found.length}`);
  return found[0];
};
const byId = (nodes, id) => nodes.filter((n) => n['@id'] === id);
// Every node on the page: the theme's blocks and the plugin's graph.
const allNodes = (page) => [...page.native, ...page.graph];
const articles = (nodes) => nodes.filter((n) => ARTICLE_TYPES.includes(n['@type']));
const without = (nodes, ...types) => nodes.filter((n) => !types.includes(n['@type']));

const DOC = '/docs/guides/install';
const POST = '/blog/post';

// ------------------------------------------------------- default ('ignore')

test('default output matches 1.7.1 apart from the size of a page-specific image', async (t) => {
  freezeClock(t);
  const outDir = await buildSite(plugin);

  // The one difference: 1.7.1 stated the default image's size for the
  // blog post's own image.
  const expected = structuredClone(baseline);
  const postImage = one(expected[POST], 'ImageObject');
  assert.equal(postImage.url, 'https://example.com/img/blog/post.png');
  assert.deepEqual([postImage.width, postImage.height], [1200, 630]);
  delete postImage.width;
  delete postImage.height;

  for (const route of ROUTES) {
    const { graph } = await readPage(outDir, route);
    assert.deepEqual(graph, expected[route], route);
    // same nodes in the same order, same keys in the same order
    assert.equal(JSON.stringify(graph), JSON.stringify(expected[route]), route);
  }
});

test("nativeStructuredData: 'ignore' is the default", async (t) => {
  freezeClock(t);
  const unset = await buildSite(plugin);
  const ignore = await buildSite(plugin, { nativeStructuredData: 'ignore' });
  for (const route of ROUTES) {
    assert.equal((await readPage(ignore, route)).html, (await readPage(unset, route)).html, route);
  }
});

test("'ignore' adds a second BreadcrumbList and a second article next to the theme's", async () => {
  const outDir = await buildSite(plugin);
  assert.equal(typed(allNodes(await readPage(outDir, DOC)), 'BreadcrumbList').length, 2);
  assert.deepEqual(articles(allNodes(await readPage(outDir, POST))).map((n) => n['@type']), ['BlogPosting', 'Article']);
});

// ------------------------------------------------------------------ 'reuse'

test("'reuse': a docs page with the theme's BreadcrumbList has exactly one", async (t) => {
  freezeClock(t);
  const reuse = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }), DOC);
  const ignore = await readPage(await buildSite(plugin), DOC);

  const crumbs = typed(allNodes(reuse), 'BreadcrumbList');
  assert.equal(crumbs.length, 1);
  assert.equal(crumbs[0], reuse.native[0], "the one BreadcrumbList is the theme's");
  assert.equal(typed(reuse.graph, 'BreadcrumbList').length, 0);

  // The theme's list has no @id, so the WebPage has nothing to point at.
  const webPage = one(reuse.graph, 'WebPage');
  assert.equal('breadcrumb' in webPage, false);

  // Nothing else changes: TechArticle, its image and the site-wide nodes.
  const { breadcrumb, ...ignoreWebPage } = one(ignore.graph, 'WebPage');
  assert.deepEqual(breadcrumb, { '@id': 'https://example.com/docs/guides/install/#breadcrumb' });
  assert.deepEqual(webPage, ignoreWebPage);
  assert.deepEqual(without(reuse.graph, 'WebPage'), without(ignore.graph, 'WebPage', 'BreadcrumbList'));
  one(reuse.graph, 'TechArticle');
});

test("'reuse': a blog post has one article node, the theme's BlogPosting, tied into the plugin's graph", async (t) => {
  freezeClock(t);
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }), POST);
  const postId = 'https://example.com/blog/post';
  const webPageId = 'https://example.com/blog/post/#webpage';
  const orgId = 'https://example.com/#organization';

  const found = articles(allNodes(page));
  assert.equal(found.length, 1);
  assert.equal(found[0], page.native[0], "the one article is the theme's BlogPosting");
  assert.equal(found[0]['@id'], postId);

  // No Article, primary image or Person from the plugin.
  for (const type of ['Article', 'ImageObject', 'Person']) {
    assert.equal(typed(page.graph, type).length, 0, type);
  }
  assert.equal(page.graph.some((n) => String(n['@id']).endsWith('/#article')), false);

  // WebPage -> BlogPosting, and back: what the BlogPosting lacks is added
  // under its own @id, with no @type, so it is not a second article.
  const webPage = one(page.graph, 'WebPage');
  assert.equal(webPage['@id'], webPageId);
  assert.deepEqual(webPage.mainEntity, { '@id': postId });
  assert.deepEqual(byId(page.graph, postId), [
    {
      '@id': postId,
      mainEntityOfPage: { '@id': webPageId },
      publisher: { '@id': orgId },
      dateModified: '2024-01-15T00:00:00.000Z',
    },
  ]);
  assert.equal(one(page.graph, 'Organization')['@id'], orgId);

  // The theme writes no BreadcrumbList on blog pages: the plugin's stays.
  assert.deepEqual(webPage.breadcrumb, { '@id': 'https://example.com/blog/post/#breadcrumb' });
  assert.equal(typed(allNodes(page), 'BreadcrumbList').length, 1);
  assert.deepEqual(page.graph.map((n) => n['@type']), [
    'WebPage', undefined, 'BreadcrumbList', 'WebSite', 'Organization', 'SoftwareSourceCode',
  ]);
});

test("'reuse': the supplement leaves alone what the theme's article already states", async () => {
  // a BlogPosting as the theme writes it with showLastUpdateTime, plus a publisher
  const src = await sourcePage(POST);
  const html = src.replace(
    '"datePublished":"2024-01-15T00:00:00.000Z",',
    '"datePublished":"2024-01-15T00:00:00.000Z","dateModified":"2024-02-01T00:00:00.000Z","publisher":{"@type":"Organization","name":"Other"},',
  );
  assert.notEqual(html, src);
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }, { [POST]: html }), POST);
  assert.deepEqual(byId(page.graph, 'https://example.com/blog/post'), [
    { '@id': 'https://example.com/blog/post', mainEntityOfPage: { '@id': 'https://example.com/blog/post/#webpage' } },
  ]);
});

test("'reuse': an article with no @id is still not duplicated, but cannot be linked", async () => {
  const src = await sourcePage(POST);
  const html = src.replace('"@type":"BlogPosting","@id":"https://example.com/blog/post",', '"@type":"BlogPosting",');
  assert.notEqual(html, src);
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }, { [POST]: html }), POST);
  assert.deepEqual(articles(allNodes(page)).map((n) => n['@type']), ['BlogPosting']);
  assert.equal('mainEntity' in one(page.graph, 'WebPage'), false);
  assert.deepEqual(page.graph.map((n) => n['@type']), ['WebPage', 'BreadcrumbList', 'WebSite', 'Organization', 'SoftwareSourceCode']);
});

test("'reuse': a BreadcrumbList that has an @id is referenced from the WebPage", async () => {
  const src = await sourcePage(DOC);
  const id = 'https://example.com/docs/guides/install#breadcrumbs';
  const html = src.replace('"@type":"BreadcrumbList",', `"@type":"BreadcrumbList","@id":"${id}",`);
  assert.notEqual(html, src);
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }, { [DOC]: html }), DOC);
  assert.deepEqual(one(page.graph, 'WebPage').breadcrumb, { '@id': id });
  assert.equal(typed(allNodes(page), 'BreadcrumbList').length, 1);
});

test("'reuse': an opt-in FAQPage on a blog post is the reused article's mainEntity", async () => {
  const faq = '<script type="application/json" data-aeo-faq>[{"question":"Is it free?","answer":"Yes."}]</script>';
  const html = (await sourcePage(POST)).replace('</body>', `${faq}</body>`);
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }, { [POST]: html }), POST);
  const faqId = one(page.graph, 'FAQPage')['@id'];
  assert.deepEqual(byId(page.graph, 'https://example.com/blog/post')[0].mainEntity, { '@id': faqId });
  assert.deepEqual(one(page.graph, 'WebPage').mainEntity, { '@id': 'https://example.com/blog/post' });
});

test("'reuse': pages with nothing to reuse are the same in both modes", async (t) => {
  freezeClock(t);
  const reuse = await buildSite(plugin, { nativeStructuredData: 'reuse' });
  const ignore = await buildSite(plugin);
  // the home page has no JSON-LD of its own; the blog list page has a Blog
  // whose nested BlogPostings describe other pages
  for (const route of ['/', '/blog']) {
    assert.equal((await readPage(reuse, route)).html, (await readPage(ignore, route)).html, route);
  }
  const home = await readPage(reuse, '/');
  assert.equal(home.native.length, 0);
  assert.deepEqual(home.graph.map((n) => n['@type']), [
    'WebPage', 'BreadcrumbList', 'WebSite', 'Organization', 'SoftwareSourceCode', 'SoftwareApplication',
  ]);
});

test("'reuse': a JSON-LD block that is not valid JSON is skipped, not fatal", async () => {
  const html = (await sourcePage(DOC)).replace('"@type":"BreadcrumbList",', '"@type":"BreadcrumbList",,');
  const page = await readPage(await buildSite(plugin, { nativeStructuredData: 'reuse' }, { [DOC]: html }), DOC);
  assert.equal(page.nativeTags.length, 1);
  assert.equal(page.native.length, 0, 'the theme block does not parse');
  // with no BreadcrumbList to defer to, the plugin's is emitted and linked
  assert.equal(typed(page.graph, 'BreadcrumbList').length, 1);
  assert.deepEqual(one(page.graph, 'WebPage').breadcrumb, { '@id': 'https://example.com/docs/guides/install/#breadcrumb' });
});

// ------------------------------------------------- the theme's own blocks

test("the theme's JSON-LD blocks are left exactly as written, in both modes", async () => {
  for (const mode of ['ignore', 'reuse']) {
    const outDir = await buildSite(plugin, { nativeStructuredData: mode });
    for (const route of [DOC, POST, '/blog']) {
      const [block] = (await sourcePage(route)).match(/<script data-rh="true" type="application\/ld\+json">[\s\S]*?<\/script>/);
      const page = await readPage(outDir, route);
      assert.ok(page.html.includes(block), `${mode} ${route}: theme block changed`);
      assert.equal(page.nativeTags.length, 1, `${mode} ${route}`);
      // react-helmet owns data-rh tags; the plugin's script must not be one
      assert.equal((page.html.match(/<script type="application\/ld\+json">/g) || []).length, 1, `${mode} ${route}`);
    }
  }
});

// -------------------------------------------------------- image dimensions

test('width and height are stated only for the site default image', async () => {
  const outDir = await buildSite(plugin);
  const docImage = one((await readPage(outDir, DOC)).graph, 'ImageObject');
  assert.equal(docImage.url, 'https://example.com/img/social-card.png');
  assert.deepEqual([docImage.width, docImage.height], [1200, 630]);

  const postImage = one((await readPage(outDir, POST)).graph, 'ImageObject');
  assert.equal(postImage.url, 'https://example.com/img/blog/post.png');
  assert.equal('width' in postImage, false);
  assert.equal('height' in postImage, false);
});

test('a build without featuredImageDimensions passes and states no dimensions', async () => {
  const outDir = await buildSite(plugin, { featuredImageDimensions: undefined });
  for (const route of [DOC, POST]) {
    const image = one((await readPage(outDir, route)).graph, 'ImageObject');
    assert.deepEqual(Object.keys(image), ['@type', 'inLanguage', '@id', 'url', 'contentUrl', 'caption'], route);
  }
});
