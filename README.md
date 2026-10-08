[![NPM Version](https://img.shields.io/npm/v/%40stackql%2Fdocusaurus-plugin-structured-data)](https://www.npmjs.com/package/@stackql/docusaurus-plugin-structured-data) 
[![NPM Downloads](https://img.shields.io/npm/d18m/%40stackql%2Fdocusaurus-plugin-structured-data)](https://www.npmjs.com/package/@stackql/docusaurus-plugin-structured-data)

# docusaurus-plugin-structured-data
> Plugin to configure [__Structured Data__](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) for Docusaurus sites

## How it works

This plugin generates [__schema.org__](https://schema.org/) structured data for your Docusaurus site.

The plugin includes the following types in the `<head>` of each processed page using the [__JSON-LD__](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) format:

- [__`Organization`__](https://schema.org/Organization) - *augmented using data from `themeConfig.structuredData.organization`*
- [__`WebSite`__](https://schema.org/WebSite) - *augmented using data from `themeConfig.structuredData.website`*
- [__`WebPage`__](https://schema.org/WebPage) - *dynamically generated for each page*
- [__`BreadcrumbList`__](https://schema.org/BreadcrumbList) - *dynamically generated for each page*

> The plugin strips breadcrumb microdata attributes from the first matching breadcrumb list and list item, and removes `position` meta tags.

`Organization` and `WebSite` can be extended using the `themeConfig.structuredData` object based upon properties provided (e.g. you can add any `schema.org` compliant properties for `Organization` and `WebSite` and these will be automatically included in your structured data for each page).  

`WebPage` structured data is dynamically generated for each page, and includes the following properties:  

- [__`name`__](https://schema.org/name) - *rendered HTML title with the site title suffix removed; falls back to `siteConfig.title` when the title is absent*
- [__`url`__](https://schema.org/url) - *page url*
- [__`description`__](https://schema.org/description) - *rendered description meta tag, normally populated from front matter; falls back to `siteConfig.tagline` when absent*
- [__`inLanguage`__](https://schema.org/inLanguage) - *`themeConfig.structuredData.webpage.inLanguage`, defaulting to `en-US`*
- [__`dateModified`__](https://schema.org/dateModified) - *the page's last change: a doc's git last-update time (`showLastUpdateTime`, or `last_update.date` in front matter), a blog post's `last_update.date` or date, and only when a page has no record of its own, the build time (see Dates below)*
- [__`datePublished`__](https://schema.org/datePublished) - *blog metadata, `article:published_time`, front matter, or `themeConfig.structuredData.webpage.datePublished`, in that order; omitted when none supplies a valid date (see Dates below)*

`BreadcrumbList` structured data is dynamically generated for each page based upon the page `route`.  

For routes owned by a `@docusaurus/plugin-content-blog` instance the crumbs are Home, then one per segment of the instance's `routeBasePath`, then the page. With a single blog at `/blog` that is Home > Blog > Post. With several instances (for example `routeBasePath: '/blog/product'`) a post is Home > Blog > Product Announcements > Post and the instance list page is Home > Blog > Product Announcements. Segment names come from `breadcrumbLabelMap`, then `Blog` for a `blog` segment, then the instance's `blogTitle` for its own root segment. Blog posts also carry these names as `Article.articleSection`. Tag and pagination routes of every instance are skipped.  

> The plugin writes JSON-LD during Docusaurus's `postBuild` hook, after a production build such as `yarn build` or `npm run build`. It does not run in the development server.
 
`TechArticle` is generated for routes matching `techArticleRoutePrefixes` or docs selected by `techArticleDocsInstances`. Other pages with `og:type: article`, including normal blog posts, get `Article`. Both include a paragraph-based `wordCount`, an `ImageObject`, the page title as `headline`, and a `mainEntityOfPage` reference to the `WebPage`. `Article` includes author data only when an author matches the configured `authors` map; this plugin does not add authors to `TechArticle`.

`/404.html`, `/search`, `/tags`, `/tags/*`, `/page/*`, `/blog/tags`, `/blog/tags/*`, and `/blog/page/*` are skipped automatically, as are tag and pagination routes for detected blog instances. These checks use paths relative to `siteConfig.baseUrl`. Use `excludedRoutes` for additional exclusions, including custom redirects.

## Installation

<details>
<summary>NPM</summary>
<p>

```bash
npm i @stackql/docusaurus-plugin-structured-data
```

</p>
</details>

<details>
<summary>YARN</summary>
<p>

```bash
yarn add @stackql/docusaurus-plugin-structured-data
```

</p>
</details>

## Setup

Merge the following into `docusaurus.config.js`:

```js
module.exports = {
  plugins: [
    '@stackql/docusaurus-plugin-structured-data',
  ],
  themeConfig: {
    structuredData: {
      featuredImageDimensions: {
        width: 1200,
        height: 627,
      },
    },
  },
};
```

`themeConfig.structuredData` is required. Its fields are optional except `featuredImageDimensions`, which is required when any processed page emits `Article` or `TechArticle`. Set its positive numeric dimensions to match your featured image. The image URL comes from `og:image`, falling back to `themeConfig.image`; the plugin does not measure images.

All settings below belong in `themeConfig.structuredData`. The plugin accepts only Docusaurus's `id` in the plugin options object; other keys in `['@stackql/docusaurus-plugin-structured-data', { ... }]` fail the build.

### Configuration reference

| Option | Type | Default / behavior |
|---|---|---|
| `excludedRoutes` | string array | `[]`. Exact paths or globs: `*` within a segment, `**` across segments, `?` for one non-slash character. Matches paths both with and without `siteConfig.baseUrl`. |
| `verbose` | boolean | `false`. Logs route processing and metadata decisions. |
| `featuredImageDimensions` | `{width: number, height: number}` | No default. Required for article pages; both values must be finite and greater than zero. |
| `authors` | object keyed by author name | `{}`. Author details for `Article`; see Authors below. |
| `organization` | object | Overrides or extends the generated `Organization` node. |
| `website` | object | Overrides or extends the generated `WebSite` node. |
| `webpage` | object | Extends `WebPage`. `inLanguage` defaults to `en-US`; `datePublished` is a site-wide fallback. Generated page fields take precedence. |
| `softwareSourceCode` | object | Unset. Emits a site-wide node when configured; requires an HTTP(S) `codeRepository` URL. |
| `softwareApplication` | object | Unset. Defaults for pages that explicitly opt into `SoftwareApplication`; does not emit a node by itself. |
| `breadcrumbLabelMap` | object mapping paths or segments to labels | `{}`. Full paths take precedence over segment keys; paths are relative to `siteConfig.baseUrl`. |
| `breadcrumbLinkAncestors` | boolean | `false`. Links non-blog ancestors that have built routes. |
| `techArticleRoutePrefixes` | string array | `['/docs/']`. Prefixes must start and end with `/` and match the full public path, including `siteConfig.baseUrl`. |
| `techArticleDocsInstances` | string array | `[]`. Non-empty content-docs instance IDs whose doc pages qualify as `TechArticle`, excluding each instance root. |
| `speakable` | boolean or `{cssSelector?, xpath?}` | Enabled with `['h1', 'article p:first-of-type', '[data-speakable]']`. `false` disables generation globally. Selectors accept a string or string array; `xpath` takes precedence. |

`organization` defaults to the site title and URL. `website` uses the site title, URL and tagline, references the organization as publisher, and includes a `SearchAction` targeting `<siteConfig.url>/search?q={searchTerms}`. Override `website.potentialAction` if your search URL differs, or set it to `[]` to omit that action.

### Authors

Each `authors` entry uses `authorId` for the generated person identifier, `url` to match `article:author`, `imageUrl` for the portrait, and `sameAs` for profile links. `imageUrl` can be any image URL. Match `url` to the author's URL in `blog/authors.yml`.

The plugin uses the HTML `author` meta tag as the name, or looks up the first URL in `article:author` when the name is absent. It emits one `Person` only when that name matches an `authors` key; it does not emit a person for each co-author.

## Config Example

Example `structuredData` block inside `themeConfig`, covering all top-level options:

```js
structuredData: {
  excludedRoutes: [
    '/providers',
    '/registry/**',
  ],  
  verbose: true,
  techArticleRoutePrefixes: ['/docs/'],
  techArticleDocsInstances: [],
  breadcrumbLinkAncestors: false,
  speakable: {
    cssSelector: ['h1', 'article p:first-of-type', '[data-speakable]'],
  },
  featuredImageDimensions: {
    width: 1200,
    height: 627,
  },
  authors:{
    'Jeffrey Aven': {
      authorId: '1',
      url: 'https://www.linkedin.com/in/jeffreyaven/',
      imageUrl: 'https://s.gravatar.com/avatar/f96573d092470c74be233e1dded5376f?s=80',
      sameAs: [
        'https://www.amazon.com/stores/Jeffrey-Aven/author/B0BSP78VVL',
        'https://developers.google.com/community/experts/directory/profile/profile-jeffrey-aven',
        'https://www.linkedin.com/in/jeffreyaven/',
        'https://www.crunchbase.com/person/jeffrey-aven',
        'https://github.com/jeffreyaven',
        'https://dev.to/jeffreyaven',
      ],
    },
  },  
  organization: {
    sameAs: [
      'https://twitter.com/stackql',
      'https://www.linkedin.com/company/stackql',
      'https://github.com/stackql',
      'https://www.youtube.com/@stackql',
      'https://hub.docker.com/u/stackql',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'info@stackql.io',
    },
    logo: {
      '@type': 'ImageObject',
      inLanguage: 'en-US',
      '@id': 'https://stackql.io/#logo',
      url: 'https://stackql.io/img/stackql-cover.png',
      contentUrl: 'https://stackql.io/img/stackql-cover.png',
      width: 1440,
      height: 900,
      caption: 'StackQL - your cloud using SQL',
    },
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'AU', // https://en.wikipedia.org/wiki/ISO_3166-1
      postalCode: '3001',
      streetAddress: 'Level 24, 570 Bourke Street, Melbourne, Victoria',
    },
    taxID: 'ABN 65 656 147 054',
  },
  website: {
    inLanguage: 'en-US',
  },
  webpage: {
    inLanguage: 'en-US',
    datePublished: '2021-07-01',
  },
  softwareSourceCode: {
    name: 'StackQL',
    codeRepository: 'https://github.com/stackql/stackql',
    programmingLanguage: 'Go',
    license: 'https://opensource.org/licenses/MIT',
    runtimePlatform: 'macOS, Linux, Windows',
  },
  softwareApplication: {
    name: 'StackQL',
    applicationCategory: 'DeveloperApplication',
    operatingSystem: 'macOS, Linux, Windows',
    license: 'https://opensource.org/licenses/MIT',
    downloadUrl: 'https://stackql.io/installing-stackql',
    isAccessibleForFree: true,
    priceCurrency: 'USD',
  },
  breadcrumbLabelMap: {
    'developers': 'Developers',
    'functions': 'Functions',
    'aggregate': 'Aggregate',
    'datetime': 'Date Time',
    'json': 'JSON',
    'math': 'Math',
    'string': 'String',
    'command-line-usage': 'Command Line Usage',
    'getting-started': 'Getting Started',
    'language-spec': 'Language Specification',
    're': 'Regular Expressions',
  }
},
```

### Dates

Dates use the first valid value in these precedence lists:

| Property | Precedence |
|---|---|
| `WebPage.datePublished` | Blog post metadata `date`, HTML `article:published_time`, front matter `datePublished`, front matter `date`, `webpage.datePublished`; omitted if none is valid. |
| `dateModified` | Content metadata `lastUpdatedAt`, front matter `last_update.date`, blog post metadata `date`, build time. |

For docs, enable `showLastUpdateTime: true` on the [docs plugin](https://docusaurus.io/docs/api/plugins/@docusaurus/plugin-content-docs) to supply git timestamps; `last_update.date` can supply an explicit date. MDX pages also support the front matter date fields. Pages without metadata use the remaining fallbacks.

Dates are emitted as ISO 8601 timestamps, and `dateModified` is never earlier than `datePublished`. `Article` and `TechArticle` use the same dates, except that their `datePublished` falls back to `dateModified` when no publication date is available.

### Organization contact details

`organization` is merged into the Organization node. Contact point objects default to `@type: ContactPoint`, address objects to `@type: PostalAddress`, and logo objects to `@type: ImageObject`; explicit types are preserved. A string logo becomes an `ImageObject`. `contactPoint` accepts an object or an array of objects. Missing `contactType` produces one warning per plugin instance:

```js
contactPoint: {
  contactType: 'customer support', // or 'sales', 'technical support', ...
  email: 'info@example.com',
},
```

### Open-source product: SoftwareSourceCode and SoftwareApplication

Two site-wide blocks describe the product the site documents:

- `softwareSourceCode` emits one `SoftwareSourceCode` node (`@id` `<siteConfig.url>/#softwaresourcecode`) in every processed page's graph, referenced from `WebSite.about` unless overridden in `website`. `codeRepository` must start with `http://` or `https://`; `name` defaults to `siteConfig.title`. `programmingLanguage`, `license`, `runtimePlatform` and other properties pass through, except generated `@type` and `@id`.
- `softwareApplication` holds defaults for pages opting in via front matter or a legacy script payload. Page fields override site defaults. With `isAccessibleForFree: true` and no explicit `offers`, the node gets `offers: { '@type': 'Offer', price: 0, priceCurrency }`; the currency defaults to `USD`. An explicit `offers` value takes precedence, and `priceCurrency` is only used for the generated offer. `applicationCategory` accepts a string or array from the [supported application categories](https://developers.google.com/search/docs/appearance/structured-data/software-app#softwareapplication); other values fail the build with the list. Other schema.org properties pass through, except generated `@type` and `@id`.

For a Markdown/MDX home page, set the defaults and add `softwareApplication: true` to its front matter. For a JSX home page, use the legacy JSON script path below.

> If your organization is a `LocalBusiness` or one of its subtypes (e.g.
> `Store`, `Restaurant`), set `'@type': 'LocalBusiness'` (or the specific
> subtype) inside your `organization` config block. Properties like
> `currenciesAccepted`, `paymentAccepted`, and `priceRange` are
> defined on `LocalBusiness` (not on `Organization`) and only become
> schema.org-valid once `@type` is narrowed. `duns` and `taxID` are valid on
> [Organization](https://schema.org/Organization) itself without changing `@type`.

## AEO / Answer Engine Optimization

`FAQPage`, `HowTo`, and `SoftwareApplication` are opt-in. `TechArticle` is
automatic on matching routes, and `speakable` is added to every processed
`WebPage` by default. These nodes describe the page content; their emission
does not guarantee search features or citations. Google's [AI features guidance](https://developers.google.com/search/docs/appearance/ai-features)
does not require special schema.org markup.

### What each schema is for

| Schema | What the plugin emits |
|---|---|
| `FAQPage` | Questions and their accepted answers. |
| `HowTo` | A named task with ordered steps. |
| `TechArticle` | An article describing technical content, with optional proficiency and dependency metadata. |
| `SoftwareApplication` | Application metadata such as category, operating system and version. |
| `SpeakableSpecification` | Selectors identifying content suitable for reading aloud. |
| `mainEntity` linking | A reference from the primary entity to the highest-priority secondary entity in the same graph. |

### How frontmatter reaches the plugin

As of __1.5.0__ the plugin reads page frontmatter directly via Docusaurus's
`allContentLoaded` lifecycle hook. The plugin captures `frontMatter` for
docs, blog posts, and MDX pages from Docusaurus's content-docs, content-blog,
and content-pages plugins, keyed by permalink. It uses that metadata during
`postBuild`. No MDX or theme changes are required for this path.

Two alternative delivery paths from 1.4.x remain supported and continue to
work alongside the frontmatter path:

- `<script type="application/json" data-aeo-faq>` / `data-aeo-howto` /
  `data-aeo-software` blocks injected via MDX, for cases where editing
  frontmatter is awkward (e.g. programmatically generated MDX, pages
  outside the content-docs / content-blog plugins).
- `<meta name="aeo:proficiencyLevel">`, `<meta name="aeo:dependencies">`,
  `<meta name="aeo:speakable" content="false">` set via a page-level
  `<Head>` component.

For FAQ, HowTo and SoftwareApplication, non-null front matter takes
precedence over script payloads and duplicates are logged when `verbose`
is enabled. Script blocks must still contain valid JSON because they are
parsed before precedence is applied. `proficiencyLevel` and `dependencies`
prefer front matter over meta tags; speakable precedence is described below.

### Configuring TechArticle route prefixes

By default, routes under `/docs/*` emit `TechArticle` (in place of generic
`Article`). To extend this to additional surfaces - for example, a curated
`/ai/*` content tree intended for AI retrieval - set
`techArticleRoutePrefixes` in `themeConfig.structuredData`:

```js
themeConfig: {
  structuredData: {
    techArticleRoutePrefixes: ['/docs/', '/ai/'],
    // ...
  }
}
```

Rules:

- Each prefix must start and end with `/`. A misshaped prefix throws at
  plugin construction time with a clear error.
- A route matches a prefix iff `route.startsWith(prefix)`. A landing route
  like `/docs` or `/ai` (no trailing slash) does __not__ match `/docs/` or
  `/ai/`; `/docs/` and `/ai/` do match. A non-matching route can still emit
  `TechArticle` through `techArticleDocsInstances`, or `Article` when its
  `og:type` is `article`.
- Prefixes match the full public route, including `siteConfig.baseUrl`.
  For `baseUrl: '/project/'`, use `/project/docs/` to match docs there.
- Setting an empty array (`techArticleRoutePrefixes: []`) opts out of
  prefix matching. To disable `TechArticle` entirely, also leave
  `techArticleDocsInstances` empty. Pages with `og:type: article` still
  emit generic `Article`.
- Unset means default (`['/docs/']`).

### TechArticle by docs instance (docs at the site root)

A prefix cannot identify docs pages when the docs instance is mounted at
the site root (`routeBasePath: '/'`), because every page starts with `/`.
For that layout list the content-docs instance ids whose doc pages should
emit `TechArticle`:

```js
themeConfig: {
  structuredData: {
    techArticleRoutePrefixes: [],
    techArticleDocsInstances: ['default', 'ai'],
  }
}
```

Rules:

- A route emits `TechArticle` when it matches a prefix __or__ is a doc page
  of a listed instance (the plugin learns each instance's doc permalinks in
  `allContentLoaded`).
- Instance matching excludes each instance's root route (including the
  homepage when docs live at `/`) and generated category index pages.
  These routes can still emit `TechArticle` through prefix matching or
  `Article` through `og:type: article`.
- Unset means `[]` (prefix matching only), so existing configurations are
  unaffected.

### Breadcrumbs

`BreadcrumbList` is derived from the route path. For a blog route the
crumbs follow the blog instance (see above). Blog instances mounted at `/`
use the generic path logic. For other nested routes the crumbs are Home,
then the docs instance root if it is a built ancestor route, then the page.
The `docs` segment defaults to `Documentation`; other unmapped docs roots
use their path segment. Other ancestor segments are folded into the leaf name
(`Command Line Usage - exec`), since a `ListItem` needs a URL and most
category segments have no page.

Set `breadcrumbLinkAncestors: true` to turn every ancestor that is itself a
built route (a category index page) into its own crumb with a URL:
`Home > Command Line Usage > exec`. The default is `false`, which keeps the
1.5.x shape.

`breadcrumbLabelMap` keys are single path segments (`'quick-starts': 'Quick
Starts'`) or full route paths (`'/blog/providers': 'Provider
Announcements'`). A full-path key wins, so one segment can carry different
names in different places. Unmapped segments fall back to `Documentation`
for `docs`, `Blog` for `blog`, a blog instance's `blogTitle` for its own
root, and otherwise the raw segment.

### Frontmatter-driven structured data

This is the preferred path as of 1.5.0. Declare the AEO fields in the
normal Markdown / MDX frontmatter block at the top of your page:

```yaml
---
title: What is StackQL?
description: StackQL is a SQL query runtime for cloud and SaaS APIs.
proficiencyLevel: Beginner
dependencies: stackql >= 0.6
faq:
  - question: Is StackQL a database?
    answer: No. StackQL is a query runtime that translates SQL into provider API calls.
  - question: Does StackQL replace Terraform?
    answer: Not directly. StackQL is for querying and mutating cloud state; Terraform is for declaring desired state.
howTo:
  name: Install StackQL on macOS
  totalTime: PT2M
  steps:
    - name: Install via Homebrew
      text: Run "brew install stackql" in a terminal.
    - name: Verify
      text: Run "stackql --version" and confirm the version prints.
softwareApplication:
  applicationCategory: DeveloperApplication
  operatingSystem: macOS, Linux, Windows
  featureList:
    - SQL queries against cloud and SaaS providers
    - Embeddable in CI pipelines
speakable:
  cssSelector:
    - h1
    - .lead
    - "[data-speakable]"
---
```

Field reference:

| Frontmatter field | Type | Effect |
|---|---|---|
| `faq` | array of `{question, answer}` | Emits `FAQPage`; linked via `mainEntity` unless `HowTo` takes priority. |
| `howTo` | `{name, totalTime?, estimatedCost?, description?, steps: [{name, text, url?, image?}]}` | Emits `HowTo` node |
| `softwareApplication` | `true` or object with `applicationCategory?`, `applicationSubCategory?`, `operatingSystem?`, `featureList?`, `softwareVersion?`, `downloadUrl?`, `license?`, `isAccessibleForFree?`, `offers?` (any other schema.org property passes through) | Emits `SoftwareApplication` node, layered over `themeConfig.structuredData.softwareApplication` defaults |
| `proficiencyLevel` | string | Passed through to `TechArticle` without enum validation; schema.org suggests `Beginner` or `Expert`. |
| `dependencies` | string | Added to `TechArticle` node |
| `speakable` | `false` or `{cssSelector?, xpath?}` | `false` opts the page out; an object replaces the global selectors, provided speakable is enabled globally. |

`softwareApplication: true` opts in using the site-wide defaults. The name
falls back to the page title when neither the page payload nor the defaults
supplies one. Omit the field to opt out; `false` is rejected. `featureList`,
when supplied, should be an array of strings.

The previously-documented `<script type='application/json'>` and
`<meta name='aeo:...'>` paths remain supported; use whichever fits your
workflow. Frontmatter is the cleaner of the two for net-new content.

### Legacy: in-MDX `<script>` block path

Equivalent to the frontmatter path above but injected at the MDX level
instead of declared in the frontmatter block. Use this when frontmatter is
not available or convenient.

__FAQPage__ (in an MDX page):

```mdx
<script type="application/json" data-aeo-faq>
{`[
  {
    "question": "How do I install stackql?",
    "answer": "Run brew install stackql on macOS, or download the latest release from GitHub for Linux and Windows."
  },
  {
    "question": "Does stackql require a database?",
    "answer": "No. stackql uses an embedded SQL engine by default and does not require any external database."
  }
]`}
</script>
```

(The template literal inside `{...}` passes the JSON string through verbatim
without MDX trying to interpret the curly braces.)

__HowTo__:

```mdx
<script type="application/json" data-aeo-howto>
{`{
  "name": "Install stackql on macOS",
  "totalTime": "PT2M",
  "steps": [
    { "name": "Install via Homebrew", "text": "Run 'brew install stackql' in a terminal." },
    { "name": "Verify the install", "text": "Run 'stackql --version' and confirm the version prints." }
  ]
}`}
</script>
```

__TechArticle__ (`/docs/*` routes, automatic - no payload needed). Optional
metadata via head tags in `docusaurus.config.js` or a page-level `<Head>`:

```mdx
import Head from '@docusaurus/Head';

<Head>
  <meta name="aeo:proficiencyLevel" content="Intermediate" />
  <meta name="aeo:dependencies" content="stackql >= 0.6, Python 3.10" />
</Head>
```

The plugin passes `proficiencyLevel` through unchanged. [Schema.org](https://schema.org/proficiencyLevel)
defines it as text and suggests `Beginner` or `Expert`.

__SoftwareApplication__:

```mdx
<script type="application/json" data-aeo-software>
{`{
  "name": "stackql",
  "applicationCategory": "DeveloperApplication",
  "applicationSubCategory": "CLI",
  "operatingSystem": "macOS, Linux, Windows",
  "softwareVersion": "0.7.0",
  "downloadUrl": "https://github.com/stackql/stackql/releases/latest",
  "featureList": [
    "SQL queries against cloud and SaaS providers",
    "Provider-agnostic IaC introspection",
    "Embeddable in CI pipelines"
  ]
}`}
</script>
```

__SpeakableSpecification__ - emitted by default on every `WebPage` node with
selectors `["h1", "article p:first-of-type", "[data-speakable]"]`. Override
globally:

```js
themeConfig: {
  structuredData: {
    speakable: {
      cssSelector: ['h1', '.lead', '[data-speakable]'],
    },
    // ...
  }
}
```

Or with xpath:

```js
speakable: {
  xpath: ['/html/head/title', "//*[@data-speakable]"],
}
```

Opt out globally with `speakable: false`, or per-page with a head tag:

```mdx
<Head>
  <meta name="aeo:speakable" content="false" />
</Head>
```

Global `speakable: false` disables generation even when a page supplies
selectors. Otherwise, per-page `false` disables it, a per-page object
replaces the global specification (and takes precedence over a meta opt-out),
then the meta opt-out is checked, then the global default applies. Both
`cssSelector` and `xpath` accept a string or array; `xpath` wins when both
are supplied.

### Graph linking

When a page emits a secondary entity (`FAQPage`, `HowTo`, or
`SoftwareApplication`), the primary entity's `mainEntity` is set to the
secondary's `@id`. Priority when more than one secondary is present:
`HowTo` -> `FAQPage` -> `SoftwareApplication`. All supplied secondary nodes
are emitted; only the highest-priority one is linked by `mainEntity`. The
primary is `TechArticle` for a matching prefix or selected doc, `Article`
for other pages with `og:type: article`, and `WebPage` otherwise.

### Worked example

A hypothetical `/docs/install/macos` page declaring an FAQ and a
`SoftwareApplication` payload, with `proficiencyLevel: Beginner`,
`dependencies: Homebrew`, default `speakable`, and automatic `TechArticle`
classification, produces the following shape. This assumes a built `/docs`
landing route, configured image dimensions, no `howTo` payload and no
site-wide `softwareSourceCode` (abbreviated for clarity):

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://stackql.io/docs/install/macos/#article",
      "isPartOf": { "@type": "WebPage", "@id": "https://stackql.io/docs/install/macos/#webpage" },
      "headline": "Install stackql on macOS",
      "mainEntityOfPage": { "@id": "https://stackql.io/docs/install/macos/#webpage" },
      "mainEntity": { "@id": "https://stackql.io/docs/install/macos/#faq" },
      "proficiencyLevel": "Beginner",
      "dependencies": "Homebrew",
      "image": { "@id": "https://stackql.io/docs/install/macos/#primaryimage" },
      "publisher": { "@id": "https://stackql.io/#organization" },
      "articleSection": ["Documentation"],
      "inLanguage": "en-US"
    },
    {
      "@type": "WebPage",
      "@id": "https://stackql.io/docs/install/macos/#webpage",
      "url": "https://stackql.io/docs/install/macos",
      "isPartOf": { "@id": "https://stackql.io/#website" },
      "breadcrumb": { "@id": "https://stackql.io/docs/install/macos/#breadcrumb" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["h1", "article p:first-of-type", "[data-speakable]"]
      }
    },
    { "@type": "ImageObject", "@id": "https://stackql.io/docs/install/macos/#primaryimage", "...": "..." },
    {
      "@type": "BreadcrumbList",
      "@id": "https://stackql.io/docs/install/macos/#breadcrumb",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://stackql.io" },
        { "@type": "ListItem", "position": 2, "name": "Documentation", "item": "https://stackql.io/docs" },
        { "@type": "ListItem", "position": 3, "name": "install - Install stackql on macOS" }
      ]
    },
    { "@type": "WebSite", "@id": "https://stackql.io/#website", "...": "..." },
    { "@type": "Organization", "@id": "https://stackql.io/#organization", "...": "..." },
    {
      "@type": "FAQPage",
      "@id": "https://stackql.io/docs/install/macos/#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "@id": "https://stackql.io/docs/install/macos/#faq-q-0",
          "name": "How do I install stackql?",
          "acceptedAnswer": { "@type": "Answer", "text": "Run brew install stackql ..." }
        }
      ]
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://stackql.io/docs/install/macos/#softwareapplication",
      "name": "stackql",
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "macOS, Linux, Windows",
      "softwareVersion": "0.7.0",
      "featureList": ["SQL queries against cloud and SaaS providers", "..."]
    }
  ]
}
```

Note the `@id` chain: `TechArticle.mainEntity` -> `FAQPage.@id`,
`TechArticle.isPartOf` -> `WebPage.@id`, `WebPage.breadcrumb` ->
`BreadcrumbList.@id`, `WebPage.isPartOf` -> `WebSite.@id`,
`WebSite.publisher` -> `Organization.@id`. Every link resolves inside the
same `@graph`.

### Validation

Malformed `faq`, `howTo`, or `softwareApplication` payloads throw at build
time with the route, field path, and expected shape - for example:

```
[docusaurus-plugin-structured-data] route "/docs/install/macos": faq[1].answer must be a non-empty string
```

FAQ questions and answers must be non-empty strings. A HowTo needs a
non-empty name and at least one step with non-empty `name` and `text`.
Software application payloads must be `true` or an object; supplied
`applicationCategory` values must be in the plugin's supported list.
An invalid `softwareSourceCode.codeRepository`, malformed image dimensions,
or missing image dimensions on an article page also fails the build.

These checks validate selected inputs, not the full schema.org vocabulary
or search-engine eligibility. Optional fields and pass-through properties
still need appropriate values.

## Development

```bash
npm install
npm test   # node --test: node builders, validators, dates, breadcrumbs, route matching, plugin options
```

The pure logic lives in `src/lib.js`; `src/index.js` is the Docusaurus lifecycle around it.
