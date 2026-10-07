const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../src/lib');

const URL = 'https://example.com/docs/intro';

test('buildFaqNode emits one Question per entry with stable ids', () => {
  const node = lib.buildFaqNode([
    { question: 'What?', answer: 'This.' },
    { question: 'Why?', answer: 'Because.' },
  ], URL);
  assert.equal(node['@type'], 'FAQPage');
  assert.equal(node['@id'], `${URL}/#faq`);
  assert.equal(node.mainEntity.length, 2);
  assert.deepEqual(node.mainEntity[1], {
    '@type': 'Question',
    '@id': `${URL}/#faq-q-1`,
    name: 'Why?',
    acceptedAnswer: { '@type': 'Answer', text: 'Because.' },
  });
});

test('validateFaq rejects malformed payloads', () => {
  assert.throws(() => lib.validateFaq({}, '/x'), /must be an array/);
  assert.throws(() => lib.validateFaq([{ question: '', answer: 'a' }], '/x'), /faq\[0\]\.question/);
  assert.throws(() => lib.validateFaq([{ question: 'q' }], '/x'), /faq\[0\]\.answer/);
  assert.doesNotThrow(() => lib.validateFaq([{ question: 'q', answer: 'a' }], '/x'));
});

test('buildHowToNode numbers steps and carries optional fields', () => {
  const node = lib.buildHowToNode({
    name: 'Install',
    description: 'Get it running',
    totalTime: 'PT5M',
    steps: [
      { name: 'Download', text: 'Fetch the binary', url: 'https://example.com/dl' },
      { name: 'Run', text: 'Start it', image: '/img/run.png' },
    ],
  }, URL);
  assert.equal(node['@type'], 'HowTo');
  assert.equal(node.totalTime, 'PT5M');
  assert.equal(node.description, 'Get it running');
  assert.deepEqual(node.step[0], { '@type': 'HowToStep', position: 1, name: 'Download', text: 'Fetch the binary', url: 'https://example.com/dl' });
  assert.deepEqual(node.step[1], { '@type': 'HowToStep', position: 2, name: 'Run', text: 'Start it', image: '/img/run.png' });
  assert.throws(() => lib.validateHowTo({ name: 'x', steps: [] }, '/x'), /steps must be a non-empty array/);
});

test('buildSoftwareApplicationNode layers the page payload over site defaults and derives a free Offer', () => {
  const defaults = {
    name: 'StackQL',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    license: 'https://opensource.org/licenses/MIT',
    downloadUrl: 'https://example.com/download',
    softwareVersion: '0.12.0',
    isAccessibleForFree: true,
    priceCurrency: 'USD',
  };
  const bare = lib.buildSoftwareApplicationNode(true, URL, 'Page title', defaults);
  assert.equal(bare.name, 'StackQL');
  assert.equal(bare.applicationCategory, 'DeveloperApplication');
  assert.equal(bare.license, 'https://opensource.org/licenses/MIT');
  assert.equal(bare.downloadUrl, 'https://example.com/download');
  assert.equal(bare.softwareVersion, '0.12.0');
  assert.equal(bare.isAccessibleForFree, true);
  assert.deepEqual(bare.offers, { '@type': 'Offer', price: 0, priceCurrency: 'USD' });
  assert.equal(bare.priceCurrency, undefined, 'priceCurrency is an input, not a node property');

  const page = lib.buildSoftwareApplicationNode(
    { softwareVersion: '0.13.0', featureList: ['SQL'], offers: { '@type': 'Offer', price: 10, priceCurrency: 'AUD' } },
    URL, 'Page title', defaults,
  );
  assert.equal(page.softwareVersion, '0.13.0');
  assert.deepEqual(page.featureList, ['SQL']);
  assert.equal(page.offers.price, 10, 'an explicit offer wins over the derived free one');

  const noDefaults = lib.buildSoftwareApplicationNode(true, URL, 'Page title', null);
  assert.deepEqual(noDefaults, { '@type': 'SoftwareApplication', '@id': `${URL}/#softwareapplication`, name: 'Page title' });
});

test('applicationCategory is validated against the schema.org list', () => {
  assert.doesNotThrow(() => lib.validateSoftwareApplication({ applicationCategory: 'DeveloperApplication' }, '/x'));
  assert.doesNotThrow(() => lib.validateSoftwareApplication({ applicationCategory: ['DeveloperApplication', 'UtilitiesApplication'] }, '/x'));
  assert.throws(() => lib.validateSoftwareApplication({ applicationCategory: 'Developer Tools' }, '/x'), /not a schema.org application category/);
  assert.throws(() => lib.validateSoftwareApplicationDefaults({ applicationCategory: 'Nope' }), /themeConfig.structuredData.softwareApplication/);
});

test('buildSoftwareSourceCodeNode carries the repository and licence and passes other fields through', () => {
  const node = lib.buildSoftwareSourceCodeNode({
    codeRepository: 'https://github.com/stackql/stackql',
    programmingLanguage: 'Go',
    license: 'https://opensource.org/licenses/MIT',
    runtimePlatform: 'macOS, Linux, Windows',
    version: '0.12.0',
  }, 'https://example.com', 'Site');
  assert.deepEqual(node, {
    '@type': 'SoftwareSourceCode',
    '@id': 'https://example.com/#softwaresourcecode',
    name: 'Site',
    codeRepository: 'https://github.com/stackql/stackql',
    programmingLanguage: 'Go',
    license: 'https://opensource.org/licenses/MIT',
    runtimePlatform: 'macOS, Linux, Windows',
    version: '0.12.0',
  });
  assert.throws(() => lib.validateSoftwareSourceCode({ programmingLanguage: 'Go' }), /codeRepository must be the repository URL/);
  assert.throws(() => lib.validateSoftwareSourceCode('x'), /must be an object/);
});

test('normalizeOrganization types nested objects and warns once about a missing contactType', () => {
  const warnings = [];
  const out = lib.normalizeOrganization({
    sameAs: ['https://github.com/x'],
    contactPoint: { email: 'info@example.com' },
    address: { addressCountry: 'AU' },
    logo: 'https://example.com/logo.png',
  }, (w) => warnings.push(w));
  assert.deepEqual(out.contactPoint, { '@type': 'ContactPoint', email: 'info@example.com' });
  assert.deepEqual(out.address, { '@type': 'PostalAddress', addressCountry: 'AU' });
  assert.deepEqual(out.logo, { '@type': 'ImageObject', url: 'https://example.com/logo.png', contentUrl: 'https://example.com/logo.png' });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /contactType/);

  const quiet = [];
  const typed = lib.normalizeOrganization({
    contactPoint: [{ '@type': 'ContactPoint', contactType: 'sales', email: 'a@b.c' }, { contactType: 'support', email: 'd@e.f' }],
  }, (w) => quiet.push(w));
  assert.equal(quiet.length, 0);
  assert.equal(typed.contactPoint[1]['@type'], 'ContactPoint');
  assert.deepEqual(lib.normalizeOrganization(undefined), {});
});

test('toIsoDate handles ms, seconds, strings and Dates', () => {
  assert.equal(lib.toIsoDate(1791186544000), '2026-10-05T07:49:04.000Z');
  assert.equal(lib.toIsoDate(1791186544), '2026-10-05T07:49:04.000Z');
  assert.equal(lib.toIsoDate('2025-11-02T00:00:00.000Z'), '2025-11-02T00:00:00.000Z');
  assert.equal(lib.toIsoDate('2021-07-01'), '2021-07-01T00:00:00.000Z');
  assert.equal(lib.toIsoDate(new Date('2024-01-02T03:04:05Z')), '2024-01-02T03:04:05.000Z');
  assert.equal(lib.toIsoDate('not a date'), null);
  assert.equal(lib.toIsoDate(undefined), null);
  assert.equal(lib.toIsoDate(''), null);
});

test('resolveDates: a doc uses git lastUpdatedAt for dateModified and the site date for datePublished', () => {
  const r = lib.resolveDates({
    frontMatter: {},
    meta: { lastUpdatedAt: 1791186544000, date: null },
    articlePublishedTime: undefined,
    configDatePublished: '2021-07-01',
    buildTime: '2026-10-08T00:00:00.000Z',
  });
  assert.deepEqual(r, { datePublished: '2021-07-01T00:00:00.000Z', dateModified: '2026-10-05T07:49:04.000Z' });
});

test('resolveDates: a blog post uses its own date for both, not the site date or the build', () => {
  const r = lib.resolveDates({
    frontMatter: {},
    meta: { date: '2025-11-02T00:00:00.000Z' },
    articlePublishedTime: '2025-11-02T00:00:00.000Z',
    configDatePublished: '2021-07-01',
    buildTime: '2026-10-08T00:00:00.000Z',
  });
  assert.deepEqual(r, { datePublished: '2025-11-02T00:00:00.000Z', dateModified: '2025-11-02T00:00:00.000Z' });
});

test('resolveDates: front matter last_update and datePublished are honoured; build time is the last resort', () => {
  const r = lib.resolveDates({
    frontMatter: { last_update: { date: '2026-01-15' }, datePublished: '2024-06-01' },
    meta: null,
    configDatePublished: null,
    buildTime: '2026-10-08T00:00:00.000Z',
  });
  assert.deepEqual(r, { datePublished: '2024-06-01T00:00:00.000Z', dateModified: '2026-01-15T00:00:00.000Z' });

  const bare = lib.resolveDates({ frontMatter: {}, meta: null, configDatePublished: null, buildTime: '2026-10-08T00:00:00.000Z' });
  assert.deepEqual(bare, { datePublished: null, dateModified: '2026-10-08T00:00:00.000Z' });
});

test('resolveDates: with no modification record, dateModified is the build time, not datePublished', () => {
  const r = lib.resolveDates({ frontMatter: {}, meta: null, configDatePublished: '2021-07-01', buildTime: '2026-10-08T00:00:00.000Z' });
  assert.deepEqual(r, { datePublished: '2021-07-01T00:00:00.000Z', dateModified: '2026-10-08T00:00:00.000Z' });
});

test('resolveDates never reports a modification before publication', () => {
  const r = lib.resolveDates({
    frontMatter: {},
    meta: { lastUpdatedAt: new Date('2020-01-01').getTime() },
    configDatePublished: '2021-07-01',
    buildTime: '2026-10-08T00:00:00.000Z',
  });
  assert.equal(r.dateModified, r.datePublished);
});

test('routeMatcher: exact routes and globs, with or without a trailing slash', () => {
  const m = lib.routeMatcher(['/features', '/providers/*', '/registry/**', '/blog/?/x']);
  assert.equal(m('/features'), true);
  assert.equal(m('/features/'), true);
  assert.equal(m('/providers/aws'), true);
  assert.equal(m('/providers/aws/deep'), false);
  assert.equal(m('/registry/a/b/c'), true);
  assert.equal(m('/blog/1/x'), true);
  assert.equal(m('/blog/12/x'), false);
  assert.equal(m('/other'), false);
  assert.equal(m('/base/features', '/features'), true, 'any of the given spellings may match');
  assert.equal(lib.routeMatcher(undefined)('/x'), false);
});

test('validatePluginOptions rejects anything but id', () => {
  assert.doesNotThrow(() => lib.validatePluginOptions(undefined));
  assert.doesNotThrow(() => lib.validatePluginOptions({ id: 'default' }));
  assert.throws(() => lib.validatePluginOptions({ id: 'default', verbose: true }), /takes no plugin options \(got "verbose"\); configure it under themeConfig.structuredData/);
});

test('validateFeaturedImageDimensions names the option', () => {
  assert.doesNotThrow(() => lib.validateFeaturedImageDimensions(undefined, null));
  assert.throws(() => lib.validateFeaturedImageDimensions(undefined, 'route "/blog/x"'), /featuredImageDimensions is required .* \(route "\/blog\/x"\)/);
  assert.throws(() => lib.validateFeaturedImageDimensions({ width: '1200' }, null), /must be \{ width: number, height: number \}/);
  assert.doesNotThrow(() => lib.validateFeaturedImageDimensions({ width: 1200, height: 627 }, null));
});

// ---------------------------------------------------------- breadcrumbs

const label = (segment, fullPath) => {
  const map = { 'command-line-usage': 'Command Line Usage', '/blog/product': 'Product Announcements' };
  if (fullPath !== undefined && map[fullPath]) return map[fullPath];
  if (map[segment]) return map[segment];
  if (segment === 'docs') return 'Documentation';
  if (segment === 'blog') return 'Blog';
  return null;
};
const crumbs = (args) =>
  lib.buildBreadcrumb({
    baseUrl: 'https://example.com',
    publicUrlPrefix: '',
    webPageUrl: `https://example.com${args.outputRoute}`,
    webPageTitle: 'Page',
    blogInstance: null,
    docsInstance: null,
    routeSet: new Set(['/', '/command-line-usage', '/command-line-usage/exec', '/blog/product', '/blog/product/post']),
    breadcrumbLinkAncestors: false,
    breadcrumbLabel: label,
    ...args,
  });

test('breadcrumb: the home page is a single crumb; other roots fold ancestors into the leaf', () => {
  const home = crumbs({ outputRoute: '/', webPageTitle: 'Home' });
  assert.deepEqual(home.breadcrumbData.itemListElement, [{ '@type': 'ListItem', position: 1, name: 'Home' }]);

  const nested = crumbs({ outputRoute: '/command-line-usage/exec', webPageTitle: 'exec' });
  assert.deepEqual(nested.breadcrumbData.itemListElement, [
    { '@type': 'ListItem', position: 1, item: 'https://example.com', name: 'Home' },
    { '@type': 'ListItem', position: 2, name: 'Command Line Usage - exec' },
  ]);
  assert.equal(nested.blogCrumbNames, null);
});

test('breadcrumb: breadcrumbLinkAncestors links an ancestor that is a built route', () => {
  const r = crumbs({ outputRoute: '/command-line-usage/exec', webPageTitle: 'exec', breadcrumbLinkAncestors: true });
  assert.deepEqual(r.breadcrumbData.itemListElement, [
    { '@type': 'ListItem', position: 1, item: 'https://example.com', name: 'Home' },
    { '@type': 'ListItem', position: 2, item: 'https://example.com/command-line-usage', name: 'Command Line Usage' },
    { '@type': 'ListItem', position: 3, name: 'exec' },
  ]);
});

test('breadcrumb: a docs instance root is linked and named', () => {
  const docsInstance = { id: 'default', basePath: '/docs', docPermalinks: new Set(['/docs/intro']) };
  const r = crumbs({ outputRoute: '/docs/intro', webPageTitle: 'Intro', docsInstance, routeSet: new Set(['/docs', '/docs/intro']) });
  assert.deepEqual(r.breadcrumbData.itemListElement, [
    { '@type': 'ListItem', position: 1, item: 'https://example.com', name: 'Home' },
    { '@type': 'ListItem', position: 2, item: 'https://example.com/docs', name: 'Documentation' },
    { '@type': 'ListItem', position: 3, name: 'Intro' },
  ]);
  const root = crumbs({ outputRoute: '/docs', webPageTitle: 'Docs landing', docsInstance, routeSet: new Set(['/docs']) });
  assert.equal(root.pageName, 'Documentation');
});

test('breadcrumb: blog instance crumbs, list page and post, and articleSection names', () => {
  const blogInstance = { id: 'product', basePath: '/blog/product', title: 'Product Announcements' };
  const post = crumbs({ outputRoute: '/blog/product/post', webPageTitle: 'A post', blogInstance });
  assert.deepEqual(post.breadcrumbData.itemListElement, [
    { '@type': 'ListItem', position: 1, item: 'https://example.com', name: 'Home' },
    { '@type': 'ListItem', position: 2, item: 'https://example.com/blog', name: 'Blog' },
    { '@type': 'ListItem', position: 3, item: 'https://example.com/blog/product', name: 'Product Announcements' },
    { '@type': 'ListItem', position: 4, name: 'A post' },
  ]);
  assert.deepEqual(post.blogCrumbNames, ['Blog', 'Product Announcements']);

  const list = crumbs({ outputRoute: '/blog/product', webPageTitle: 'Product Announcements', blogInstance });
  assert.deepEqual(list.breadcrumbData.itemListElement.map((i) => i.name), ['Home', 'Blog', 'Product Announcements']);
  assert.equal(list.breadcrumbData.itemListElement[2].item, undefined, 'the list page is the leaf');
});

test('breadcrumb: a non-root baseUrl is carried on every item URL', () => {
  const r = crumbs({ outputRoute: '/command-line-usage/exec', publicUrlPrefix: '/site', breadcrumbLinkAncestors: true });
  assert.equal(r.breadcrumbData.itemListElement[0].item, 'https://example.com/site');
  assert.equal(r.breadcrumbData.itemListElement[1].item, 'https://example.com/site/command-line-usage');
});
