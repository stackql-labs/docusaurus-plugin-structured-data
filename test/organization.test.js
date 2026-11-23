// organization['@id']: a site that belongs to a larger property names the
// parent's Organization, and every reference to the organization follows
// it. Runs over the fixture site in test/fixtures. The default output (no
// @id set) is compared against graphs-1.7.1.json in native.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const plugin = require('../src/index');
const { ROUTES, BUILD_TIME, structuredData, context, buildSite, readPage } = require('./fixtures/site');

const freezeClock = (t) => t.mock.timers.enable({ apis: ['Date'], now: Date.parse(BUILD_TIME) });

const SITE_ORG = 'https://example.com/#organization';
const PARENT_ORG = 'https://parent.example.org/#organization';
const DOC = '/docs/guides/install';
const POST = '/blog/post';

// The fixture's organization block with the parent's identity on top.
const parentOrganization = {
  ...structuredData().organization,
  '@id': PARENT_ORG,
  name: 'Parent',
  url: 'https://parent.example.org',
};

const typed = (nodes, type) => nodes.filter((n) => n['@type'] === type);

// Every `publisher` value anywhere in a graph, nested nodes included.
function publishers(value, found = []) {
  if (Array.isArray(value)) {
    value.forEach((v) => publishers(v, found));
  } else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'publisher') found.push(v);
      publishers(v, found);
    }
  }
  return found;
}

test("organization['@id'] set to the default is the same as leaving it unset", async (t) => {
  freezeClock(t);
  const unset = await buildSite(plugin);
  const explicit = await buildSite(plugin, { organization: { ...structuredData().organization, '@id': SITE_ORG } });
  for (const route of ROUTES) {
    assert.equal((await readPage(explicit, route)).html, (await readPage(unset, route)).html, route);
  }
});

for (const mode of ['ignore', 'reuse']) {
  test(`'${mode}': an organization['@id'] on another origin is referenced by every publisher`, async () => {
    const outDir = await buildSite(plugin, { nativeStructuredData: mode, organization: parentOrganization });
    let publisherCount = 0;
    for (const route of ROUTES) {
      const page = await readPage(outDir, route);

      const [org] = typed(page.graph, 'Organization');
      assert.equal(org['@id'], PARENT_ORG, route);
      assert.equal(org.name, 'Parent', route);
      assert.equal(org.url, 'https://parent.example.org', route);
      assert.deepEqual(typed(page.graph, 'WebSite')[0].publisher, { '@id': PARENT_ORG }, route);

      const refs = publishers(page.graph);
      assert.ok(refs.length > 0, `${route}: no publisher in the graph`);
      for (const ref of refs) assert.deepEqual(ref, { '@id': PARENT_ORG }, route);
      publisherCount += refs.length;

      // Not in the plugin's graph, nor anywhere else on the page.
      assert.equal(JSON.stringify(page.graph).includes(SITE_ORG), false, `${route}: graph still names ${SITE_ORG}`);
      assert.equal(page.html.includes(SITE_ORG), false, `${route}: page still names ${SITE_ORG}`);
    }
    // WebSite on all four pages, plus the article publisher on DOC and POST.
    assert.equal(publisherCount, ROUTES.length + 2);
  });
}

test("'ignore': Article and TechArticle publishers follow organization['@id']", async () => {
  const outDir = await buildSite(plugin, { organization: parentOrganization });
  const [techArticle] = typed((await readPage(outDir, DOC)).graph, 'TechArticle');
  const [article] = typed((await readPage(outDir, POST)).graph, 'Article');
  assert.deepEqual(techArticle.publisher, { '@id': PARENT_ORG });
  assert.deepEqual(article.publisher, { '@id': PARENT_ORG });
});

test("'reuse': the native-article supplement's publisher follows organization['@id']", async () => {
  const outDir = await buildSite(plugin, { nativeStructuredData: 'reuse', organization: parentOrganization });
  const page = await readPage(outDir, POST);
  const supplement = page.graph.find((n) => n['@id'] === 'https://example.com/blog/post');
  assert.ok(supplement, 'no supplement node for the BlogPosting');
  assert.equal(supplement['@type'], undefined);
  assert.deepEqual(supplement.publisher, { '@id': PARENT_ORG });
});

test("an organization['@id'] that is not an absolute http(s) IRI fails at config time", () => {
  for (const id of [
    '/#organization',
    '#organization',
    'stackql.io/#organization',
    '//stackql.io/#organization',
    'ftp://stackql.io/#organization',
    'mailto:info@stackql.io',
    'not a url',
    '',
    null,
    42,
    { '@id': 'https://stackql.io/#organization' },
  ]) {
    assert.throws(
      () => plugin(context({ organization: { '@id': id } }), { id: 'default' }),
      /themeConfig\.structuredData\.organization\['@id'\] must be an absolute http\(s\) IRI/,
      JSON.stringify(id),
    );
  }
  for (const id of ['https://stackql.io/#organization', 'http://example.org/#org', undefined]) {
    assert.doesNotThrow(() => plugin(context({ organization: { '@id': id } }), { id: 'default' }), String(id));
  }
});
