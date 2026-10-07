const test = require('node:test');
const assert = require('node:assert/strict');
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
