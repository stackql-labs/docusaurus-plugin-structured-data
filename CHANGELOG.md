# Changelog

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
