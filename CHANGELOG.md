# Changelog

## 1.7.0

Truthful dates, the two schema.org types an open-source product site was missing, and the defects an independent agent-readiness audit of the built stackql.io site turned up (work order 3). The JSON-LD shape is otherwise unchanged: with the same configuration a 1.6.0 site emits the same nodes with the same ids, except where listed under Fixed.

Added:

- `themeConfig.structuredData.softwareSourceCode`: a site-wide `SoftwareSourceCode` node (`codeRepository` required; `name`, `programmingLanguage`, `license`, `runtimePlatform` and any other property pass through) in every page's graph, referenced from `WebSite.about`.
- `themeConfig.structuredData.softwareApplication`: site-wide defaults for every `SoftwareApplication` node a page opts into (`name`, `applicationCategory`, `operatingSystem`, `license`, `downloadUrl`, `softwareVersion`, `isAccessibleForFree`, `priceCurrency`, ...). The page payload is layered over them. `isAccessibleForFree: true` without an explicit `offers` derives `offers: { '@type': 'Offer', price: 0, priceCurrency }`. `applicationCategory`, in the defaults or in a page payload, is validated against schema.org's application categories.
- `organization` normalisation: `contactPoint` entries get `@type: ContactPoint`, `address` gets `@type: PostalAddress`, a string `logo` becomes an `ImageObject`, and a contact point without `contactType` logs one warning.
- `excludedRoutes` accepts globs (`/providers/*`, `/registry/**`, `?`) as well as exact routes, the same syntax as `@stackql/docusaurus-plugin-aeo`, matched against the route with and without `siteConfig.baseUrl`.
- `npm test` (`node --test`): the node builders, validators, date resolution, the breadcrumb builder, route matching and plugin-option handling. The pure logic moved to `src/lib.js`; `src/index.js` is the lifecycle.

Changed:

- `WebPage.dateModified` and `Article`/`TechArticle.dateModified` are the page's real last change: a doc's `lastUpdatedAt` (git, when the docs plugin has `showLastUpdateTime: true`; `last_update.date` front matter folds in), a blog post's `lastUpdatedAt` or `last_update.date`, else the post's date, and only for a page with no record of its own the build time. They were the build time on every page, and `Article.dateModified` equalled `datePublished`.
- `WebPage.datePublished` is the blog post's date, the page's `datePublished` or `date` front matter, else `webpage.datePublished`; it is omitted when none applies instead of defaulting to the build time. `Article.datePublished` falls back to `dateModified` when a page has no publication date at all. All dates are emitted as full ISO 8601 timestamps; `dateModified` is never earlier than `datePublished`.
- Plugin options are rejected: the plugin is configured under `themeConfig.structuredData` only, and an option passed in the `plugins` array used to be ignored silently. Now the build fails with a message naming the option and where it belongs.
- A missing `featuredImageDimensions` on a site that emits Article or TechArticle pages fails with a message naming the option and the first route that needed it, instead of writing `width: undefined` into the ImageObject; a present block is validated at config time.

Fixed:

- `postBuild` now awaits its work. It fired a `JSDOM.fromFile().then()` per route and returned, so the hook resolved before any HTML was rewritten and a failure (an invalid `faq` payload, say) surfaced as an unhandled rejection rather than a build error. The reads are still queued synchronously up front, so another `postBuild` HTML rewriter such as `@stackql/docusaurus-plugin-aeo` keeps seeing this plugin's output.
- The home page's fragment ids were `https://site//#webpage`, `//#breadcrumb`, `//#softwareapplication` (the route `/` appended to the site URL); they are now `https://site/#webpage` like every other node's.
- On a site with a non-root `baseUrl`, the Home breadcrumb item pointed at the bare site URL rather than the site root.
- README: `datePublished` is read from `webpage.datePublished`, not `website.datePublished` as documented.

## 1.6.0

Minor release: breadcrumbs and route skipping follow the blog plugin
instances a site actually runs, instead of assuming a single blog at
`/blog/<slug>`. Driven by stackql.io splitting its blog into three
`@docusaurus/plugin-content-blog` instances (`/blog/product`,
`/blog/providers`, `/blog/tutorials`).

Compatibility: no configuration changes are required and every new option
defaults to the 1.5.x behaviour. With default options a site with one blog
at `/blog` and docs at `/docs` emits the same `BreadcrumbList` as before
for its posts and nested docs. The only differences are where 1.5.x output
was invalid, listed under Fixed.

Added:

- `allContentLoaded` records the base path of every content-blog instance
  (from its first list page permalink, or its tags path for an instance with
  no posts). Routes are matched against these base paths, longest first, so
  `/blog/product` wins over `/blog` when both exist.
- Blog routes get one crumb per segment of the instance base path, then the
  page: `/blog/product/<slug>` emits Home > Blog > Product Announcements >
  Post, and the list page `/blog/product` emits Home > Blog > Product
  Announcements. Segment names come from `breadcrumbLabelMap`, then `Blog`
  for a `blog` segment, then the instance's `blogTitle` for its own root
  segment, then the raw segment.
- `Article.articleSection` on blog posts is the list of those crumb names
  (e.g. `["Blog", "Product Announcements"]`) instead of a fixed `["Blog"]`.
- Tag and pagination routes of every blog instance (`<base>/tags`,
  `<base>/tags/*`, `<base>/page/*`) are skipped, not only `/blog/tags/*`
  and `/blog/page/*`.
- `techArticleDocsInstances` option: an array of content-docs instance ids
  whose doc pages emit `TechArticle` regardless of URL prefix. Needed when a
  docs instance lives at the site root (`routeBasePath: '/'`), where no
  prefix separates docs from other pages. Each instance's root route (the
  docs landing, or the homepage) stays a plain `WebPage`, as `/docs` always
  did. Generated category index pages are not docs and stay `WebPage`.
- Breadcrumbs for every non-blog route are now derived from the path and
  the site's docs instances rather than from a hardcoded `/docs`: Home,
  then the docs instance root if the route is under one (named by the
  label map or `Documentation`), then the page, with other ancestors folded
  into the leaf name as before (`Command Line Usage - exec`).
- `breadcrumbLinkAncestors` option (default `false`): when `true`, an
  ancestor segment that is itself a built route (a category index page)
  becomes its own crumb with a URL instead of a prefix on the leaf name.
- `breadcrumbLabelMap` accepts full route paths as keys
  (`'/blog/providers': 'Provider Announcements'`) alongside single segments.
  A full-path key wins, so one segment can carry different names in
  different places.

Fixed:

- `breadcrumbLabelMap` is now optional (defaults to `{}`); omitting it used
  to crash `postBuild` on the first route with a nested path.
- Nested routes outside `/docs` and `/blog` (for example `/providers/aws`,
  or any docs instance not mounted at `/docs`) emitted a `BreadcrumbList`
  with a crumb named "undefined" or a gap in `position`. They now get Home
  plus the page, with intermediate segments folded into the leaf name.
- A doc directly under the docs root (`/docs/<page>`) emitted
  `Home > Documentation` with no crumb for the page itself. It now emits
  `Home > Documentation > <page title>`.
- Tag and pagination routes of a blog instance not mounted at `/blog`
  received JSON-LD; they are skipped like `/blog/tags/*` always was.

Notes:

- A blog instance mounted at the site root (`routeBasePath: '/'`) is left to
  the previous breadcrumb logic, since it would otherwise claim every route.

## 1.5.1

Patch release fixing JSON-LD emission on sites with a non-root `baseUrl`.

Fixed:

- `postBuild` resolved built HTML files by joining `outDir` with the route
  path, but Docusaurus route paths include `siteConfig.baseUrl` while the
  build output tree is rooted at the baseUrl. On sites with a non-root
  `baseUrl` (e.g. `/docs/query-library/` on query-library.stackql.io) every
  route missed its HTML file and the plugin silently emitted nothing. The
  baseUrl prefix is now stripped before file resolution. Sites with
  `baseUrl: '/'` are unaffected.
- The built-in skip list (`/tags`, `/search`, `/404.html`, pagination
  routes) now matches baseUrl-relative routes, so tag/search pages are
  skipped on non-root-baseUrl sites too. `excludedRoutes` and
  `techArticleRoutePrefixes` still match the full public route path
  (including baseUrl), unchanged.
- `excludedRoutes` is now optional (defaults to `[]`); previously omitting
  it crashed `postBuild` once a route resolved.

## 1.5.0

Minor release adding three closely-related capabilities driven by a new
`/ai/*` content surface at stackql.io: authors write normal Docusaurus
frontmatter and the plugin emits the right schema with no in-page `<script>`
blocks or `<meta>` workarounds.

Breaking changes: none. All v1.4.x mechanisms (script tags, meta tags,
hardcoded `/docs/*` -> TechArticle) keep working unchanged. The frontmatter
path is purely additive.

Added:

- `themeConfig.structuredData.techArticleRoutePrefixes` option for
  configuring which route prefixes emit `TechArticle`. Defaults to
  `['/docs/']` (unchanged behavior for 1.4.x users). Each prefix must
  start and end with `/`. A landing route like `/docs` or `/ai` (no
  trailing slash) does not match the corresponding `/docs/` or `/ai/`
  prefix and so stays a plain `WebPage`, preserving the 1.4.x carve-out.
- Frontmatter-driven FAQ / HowTo / SoftwareApplication emission. Consumers
  can declare `faq`, `howTo`, and `softwareApplication` in page frontmatter
  as an alternative to the in-MDX `<script type="application/json">` block:

  ```yaml
  ---
  title: What is StackQL?
  faq:
    - question: Is StackQL a database?
      answer: No. StackQL is a query runtime ...
  ---
  ```

  When both the frontmatter path and the script-tag path are present on the
  same page for the same schema, the frontmatter wins and a verbose log line
  names the duplicate.
- Frontmatter-driven `proficiencyLevel`, `dependencies`, and `speakable`
  fields. The `<meta name="aeo:...">`-tag paths stay supported; frontmatter
  wins on conflict. `speakable: false` in frontmatter opts the page out;
  `speakable: { cssSelector }` or `speakable: { xpath }` overrides the
  default selectors for that page only.

Internal:

- Plugin now uses Docusaurus's `allContentLoaded` lifecycle hook to capture
  per-route frontmatter (keyed by normalized permalink), in addition to its
  existing `postBuild` HTML scan. Tolerates multi-version docs, multiple
  content plugin instances, and missing branches in the `allContent` tree
  (custom JSX pages, redirect stubs, plugin-generated routes). No consumer
  impact.
- `contentLoaded` does not receive `allContent` in Docusaurus 3.x; only
  `allContentLoaded` does. Using the right hook from the start.
- `softwareApplication: true` is now accepted (as well as an object) for
  bare opt-in with no extra fields. Previously the `softwareApplication`
  validator rejected non-object values, which would have been awkward in
  frontmatter where `true` is the obvious "yes, emit this" idiom.

## 1.4.1

Bugfix patch on top of 1.4.0. Three issues surfaced when a real consumer
(stackql.io) wired up 1.4.0; all are fixed here. No new features, no
config-shape changes, no dependency bumps.

Breaking changes: none.

Fixed:

- `trailingSlash: false` sites silently skipped flat-routed pages with
  sibling subdirectories. With `trailingSlash: false`, Docusaurus emits
  e.g. `build/docs.html` alongside a `build/docs/` directory housing the
  nested routes (`/docs/foo`, `/docs/bar`, ...). The previous file-path
  resolver preferred the directory form, resolved `/docs` to
  `build/docs/index.html` (which does not exist under
  `trailingSlash: false`), and silently skipped the route. On
  stackql.io this dropped 11 landing pages including `/docs` and
  `/blog`. The resolver now prefers the flat `outDir/route.html` form
  when it exists, falls back to `outDir/route/index.html`, and
  special-cases the root route. Existence-based (not
  `siteConfig.trailingSlash`-based) so it stays correct under per-page
  frontmatter overrides in Docusaurus 3.
- `TypeError: Cannot read properties of null (reading 'content')` when
  a page lacks a `<meta name="description">` (e.g. a redirect-stub
  homepage). The description meta is now read defensively and falls
  back to `siteConfig.tagline` (then to `""`). The same node-then-
  fallback pattern is applied to `<title>`, which falls back to
  `siteConfig.title`. Pages without metadata still emit the full
  `WebPage` / `BreadcrumbList` / `WebSite` / `Organization` core
  graph rather than being skipped.
- README config example included `duns` on the `Organization` block.
  `duns` is defined on `LocalBusiness` (and its subtypes), not on
  `Organization`, so the schema.org Validator flags it (Google's Rich
  Results Test is permissive and does not). `duns` is removed from the
  example and the README now explains how to narrow `@type` to
  `LocalBusiness` for sites that need it. `taxID` stays - it is valid
  on `Organization`.

## 1.4.0

AEO (Answer Engine Optimization) release. Adds opt-in support for the schema
types that AI search surfaces (Google AI Overviews, Perplexity, ChatGPT search,
Claude web tools) actually consume, plus connected `@graph` linking between the
primary page entity and any secondary entities.

Breaking changes: none. All additions are opt-in via frontmatter / injected
script blocks or `themeConfig.structuredData` keys that did not previously
exist. Existing sites get one behavior change only: a `speakable` property is
added to the `WebPage` node by default. Opt out per-page with
`<meta name="aeo:speakable" content="false">` or globally with
`themeConfig.structuredData.speakable: false`.

Added:

- `FAQPage` emission. Page injects a
  `<script type="application/json" data-aeo-faq>` block containing
  `[{question, answer}, ...]`. Plugin emits a `FAQPage` node with `Question` /
  `Answer` children, each with stable `@id` values.
- `HowTo` emission. Page injects
  `<script type="application/json" data-aeo-howto>` with
  `{name, totalTime?, estimatedCost?, description?, steps: [{name, text, url?, image?}]}`.
- `TechArticle` for `/docs/*` routes (in place of generic `Article`), with
  optional `proficiencyLevel` and `dependencies` sourced from
  `<meta name="aeo:proficiencyLevel">` and `<meta name="aeo:dependencies">`.
  `/blog/*` keeps emitting `Article` exactly as before.
- `SoftwareApplication` per-page (opt-in). Page injects
  `<script type="application/json" data-aeo-software>` with at minimum a name
  plus any of `applicationCategory`, `applicationSubCategory`,
  `operatingSystem`, `featureList`, `softwareVersion`, `downloadUrl`, `offers`.
- `SpeakableSpecification` on every `WebPage` node by default. Override via
  `themeConfig.structuredData.speakable.cssSelector` (array) or `xpath`
  (array). Default CSS selectors: `["h1", "article p:first-of-type",
  "[data-speakable]"]`.
- Graph linking. When a page emits a secondary entity, the primary entity
  (`Article` / `TechArticle`, or `WebPage` for non-article pages) gets a
  `mainEntity` pointer to the secondary `@id`. Priority: `HowTo` ->
  `FAQPage` -> `SoftwareApplication`.
- Build-time validation. Malformed `faq`, `howTo`, or `softwareApplication`
  payloads throw an error naming the route, the field, and what was expected.
  Previously the plugin only validated that `themeConfig.structuredData`
  existed.

Internal:

- Hoisted route-independent work (skip-route check, default
  `inLanguage` / `datePublished` resolution, speakable spec construction) out
  of the per-route `.map()` callback.
- Defensive guard around missing `structuredData.authors[name]` entries -
  previously the plugin threw `Cannot read property 'authorId' of undefined`
  on a blog post whose author URL was not in the authors map. Now it skips the
  `author` / `Person` nodes for that post and continues. Working author
  configs are unaffected.
