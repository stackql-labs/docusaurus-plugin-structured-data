const path = require('path');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const {
    TAG,
    DEFAULT_TECH_ARTICLE_PREFIXES,
    validateFaq,
    validateHowTo,
    validateSoftwareApplication,
    validateSoftwareApplicationDefaults,
    validateSoftwareSourceCode,
    validateTechArticleRoutePrefixes,
    validateFeaturedImageDimensions,
    validatePluginOptions,
    buildFaqNode,
    buildHowToNode,
    buildSoftwareApplicationNode,
    buildSoftwareSourceCodeNode,
    buildSpeakableSpec,
    normalizeOrganization,
    resolveDates,
    normalizePermalink,
    routeMatcher,
    buildBreadcrumb,
} = require('./lib');

function readJsonScript(doc, selector, route, fieldName) {
    const node = doc.querySelector(selector);
    if (!node) return null;
    const raw = node.textContent.trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(`${TAG} route "${route}": ${fieldName} payload is not valid JSON (${err.message})`);
    }
}

// Walk allContent (the object Docusaurus 3 hands allContentLoaded) and
// collect, per permalink, the front matter plus the dates the content
// plugins know: a doc's lastUpdatedAt (git, when showLastUpdateTime is on),
// a blog post's date and lastUpdatedAt. Defensive about shape so we
// tolerate plugin instances, multi-version docs, and missing branches.
function collectPageMeta(allContent, verbose) {
    const map = new Map();

    function set(permalink, entry) {
        if (!permalink || !entry) return;
        map.set(normalizePermalink(permalink), entry);
    }

    const docsContent = allContent && allContent['docusaurus-plugin-content-docs'];
    if (docsContent) {
        for (const instance of Object.values(docsContent)) {
            const versions = (instance && instance.loadedVersions) || [];
            for (const version of versions) {
                const docs = (version && version.docs) || [];
                for (const doc of docs) {
                    set(doc.permalink, {
                        frontMatter: doc.frontMatter || {},
                        lastUpdatedAt: doc.lastUpdatedAt,
                        date: null,
                    });
                }
            }
        }
    }

    const blogContent = allContent && allContent['docusaurus-plugin-content-blog'];
    if (blogContent) {
        for (const instance of Object.values(blogContent)) {
            const posts = (instance && instance.blogPosts) || [];
            for (const post of posts) {
                const meta = post && post.metadata;
                if (meta) {
                    set(meta.permalink, {
                        frontMatter: meta.frontMatter || {},
                        lastUpdatedAt: meta.lastUpdatedAt,
                        date: meta.date,
                    });
                }
            }
        }
    }

    const pagesContent = allContent && allContent['docusaurus-plugin-content-pages'];
    if (pagesContent) {
        for (const instance of Object.values(pagesContent)) {
            const pages = Array.isArray(instance) ? instance : [];
            for (const page of pages) {
                // MDX pages expose frontMatter directly; plain JSX pages have none.
                if (page.frontMatter) {
                    set(page.permalink, { frontMatter: page.frontMatter, lastUpdatedAt: undefined, date: null });
                }
            }
        }
    }

    if (verbose) {
        console.log(`[structured-data] captured metadata for ${map.size} routes via allContentLoaded`);
    }
    return map;
}

// Collect the content-docs instances Docusaurus loaded: each instance's base
// path (the current version's route base, e.g. "/docs" or "/") and the set
// of doc permalinks it owns. Used to classify docs pages as TechArticle
// without relying on a URL prefix (techArticleDocsInstances) and to name
// breadcrumb roots. Paths are stored relative to siteConfig.baseUrl.
function collectDocsInstances(allContent, siteBaseUrl, verbose) {
    const instances = [];
    const docsContent = allContent && allContent['docusaurus-plugin-content-docs'];
    if (!docsContent) return instances;

    const relative = (p) => {
        if (typeof p !== 'string') return null;
        const stripped = p.startsWith(siteBaseUrl) ? `/${p.slice(siteBaseUrl.length)}` : p;
        return normalizePermalink(stripped) || '/';
    };

    for (const [id, instance] of Object.entries(docsContent)) {
        const versions = (instance && instance.loadedVersions) || [];
        const docPermalinks = new Set();
        let basePath = null;
        for (const version of versions) {
            if (basePath === null && version && typeof version.path === 'string') {
                basePath = relative(version.path);
            }
            for (const doc of (version && version.docs) || []) {
                const permalink = relative(doc.permalink);
                if (permalink) docPermalinks.add(permalink);
            }
        }
        if (basePath === null) continue;
        instances.push({ id, basePath, docPermalinks });
    }
    if (verbose) {
        const summary = instances
            .map((i) => `${i.id} -> ${i.basePath} (${i.docPermalinks.size} docs)`)
            .join(', ') || 'none';
        console.log(`[structured-data] docs instances: ${summary}`);
    }
    return instances;
}

// Collect the content-blog instances Docusaurus loaded, so blog routes are
// recognised by instance base path rather than by a hardcoded "/blog"
// prefix. A site may run several instances (e.g. /blog/product and
// /blog/providers) or mount one somewhere other than /blog. Base paths are
// stored relative to siteConfig.baseUrl, matching the routes postBuild
// resolves files for. Longest base path first, so /blog/product wins over
// /blog when both exist.
function collectBlogInstances(allContent, siteBaseUrl, verbose) {
    const instances = [];
    const blogContent = allContent && allContent['docusaurus-plugin-content-blog'];
    if (!blogContent) return instances;

    for (const [id, instance] of Object.entries(blogContent)) {
        if (!instance) continue;
        const firstListPage = Array.isArray(instance.blogListPaginated) ? instance.blogListPaginated[0] : null;
        let basePath = firstListPage && firstListPage.metadata && firstListPage.metadata.permalink;
        if (typeof basePath !== 'string' && typeof instance.blogTagsListPath === 'string') {
            // empty instance: no list page yet, but the tags path is always set
            basePath = instance.blogTagsListPath.replace(/\/tags\/?$/, '');
        }
        if (typeof basePath !== 'string') continue;
        if (basePath.startsWith(siteBaseUrl)) {
            basePath = `/${basePath.slice(siteBaseUrl.length)}`;
        }
        basePath = normalizePermalink(basePath);
        // An instance mounted at the site root would claim every route;
        // leave those sites to the generic breadcrumb logic.
        if (!basePath || basePath === '/') continue;
        instances.push({
            id,
            basePath,
            title: typeof instance.blogTitle === 'string' ? instance.blogTitle : null,
        });
    }
    instances.sort((a, b) => b.basePath.length - a.basePath.length);
    if (verbose) {
        const summary = instances.map((i) => `${i.id} -> ${i.basePath}`).join(', ') || 'none';
        console.log(`[structured-data] blog instances: ${summary}`);
    }
    return instances;
}

module.exports = function (context, options) {
    // All configuration lives under themeConfig.structuredData. Plugin
    // options were silently ignored before 1.7.0; now a misplaced option
    // fails the build with a message that says where it belongs.
    validatePluginOptions(options);

    const {siteConfig} = context;
    const {themeConfig} = siteConfig;
    const {structuredData} = themeConfig || {};

    if (!structuredData) {
        throw new Error(
        `You need to specify the 'structuredData' object in 'themeConfig' to use docusaurus-plugin-structured-data`,
        );
    }

    const techArticleRoutePrefixes = structuredData.techArticleRoutePrefixes !== undefined
        ? structuredData.techArticleRoutePrefixes
        : DEFAULT_TECH_ARTICLE_PREFIXES;
    validateTechArticleRoutePrefixes(techArticleRoutePrefixes);

    // Docs plugin instance ids whose pages (except each instance's root)
    // emit TechArticle regardless of URL prefix. Needed when a docs instance
    // lives at the site root, where no prefix separates docs from the rest.
    const techArticleDocsInstances = structuredData.techArticleDocsInstances !== undefined
        ? structuredData.techArticleDocsInstances
        : [];
    if (
        !Array.isArray(techArticleDocsInstances) ||
        techArticleDocsInstances.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
        throw new Error(
            `${TAG} themeConfig.structuredData.techArticleDocsInstances must be an array of content-docs instance ids (e.g. ["default"])`
        );
    }

    // When true, an ancestor path segment that is itself a built route (e.g.
    // a category index page) becomes its own breadcrumb item with a URL.
    // Default false keeps the 1.5.x shape: only the docs or blog instance
    // root is linked and every other ancestor is folded into the leaf name.
    const breadcrumbLinkAncestors = structuredData.breadcrumbLinkAncestors === true;

    const baseUrl = siteConfig.url;
    const orgName = siteConfig.title;
    const titleDelimiter = siteConfig.titleDelimiter;
    const verbose = structuredData.verbose || false;
    const speakableConfig = structuredData.speakable;
    const speakableEnabledByDefault = speakableConfig === undefined || speakableConfig !== false;
    const defaultSpeakableSpec = speakableEnabledByDefault ? buildSpeakableSpec(speakableConfig) : null;

    // Validated up front so a bad block fails at config time; a missing
    // block is reported the first time an article page needs it.
    validateFeaturedImageDimensions(structuredData.featuredImageDimensions, null);
    validateSoftwareApplicationDefaults(structuredData.softwareApplication);
    validateSoftwareSourceCode(structuredData.softwareSourceCode);
    const softwareApplicationDefaults = structuredData.softwareApplication || null;

    // Exact routes or globs ("/providers/*", "/registry/**"), matched against
    // the route with and without siteConfig.baseUrl.
    const isExcludedRoute = routeMatcher(structuredData.excludedRoutes || []);

    // Populated by allContentLoaded, read by postBuild. Same plugin instance
    // sees both hooks via this closure, so no separate state plumbing needed.
    let metaByPermalink = new Map();
    let blogInstances = [];
    let docsInstances = [];

    // need to build inverted index as the "name" property is not always populated for blog articles
    verbose ? console.log(`building inverted index for authors...`): null;
    const authorInvIndex = {};
    for (const [key, value] of Object.entries(structuredData.authors || {})) {
        authorInvIndex[value.url] = key;
    }
    verbose ? console.log(`inverted author index :\n${JSON.stringify(authorInvIndex, null, 2)}`): null;
    const authors = structuredData.authors || {};

    const orgData = {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: `${orgName}`,
        url: `${baseUrl}`,
        ...normalizeOrganization(structuredData.organization, (w) => console.warn(w)),
    };

    // Site-wide SoftwareSourceCode for an open-source product: in every
    // page's graph next to WebSite and Organization, and the WebSite's
    // `about`.
    const softwareSourceCodeData = structuredData.softwareSourceCode
        ? buildSoftwareSourceCodeNode(structuredData.softwareSourceCode, baseUrl, orgName)
        : null;

    const webSiteData = {
        '@type': 'WebSite',
        '@id': `${baseUrl}/#website`,
        name: `${orgName}`,
        url: `${baseUrl}`,
        description: `${siteConfig.tagline}`,
        publisher: {
            '@id': `${baseUrl}/#organization`,
        },
        potentialAction: [
            {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: `${baseUrl}/search?q={searchTerms}`,
              },
              'query-input': 'required name=searchTerms'
            }
          ],
        ...(softwareSourceCodeData ? { about: { '@id': softwareSourceCodeData['@id'] } } : {}),
        ...structuredData.website,
    };

    // The docs instance (if any) whose base path owns this baseUrl-relative
    // route. Longest base path wins, so an instance at "/" never shadows one
    // at "/ai".
    function findDocsInstance(route) {
        const normalized = normalizePermalink(route);
        let best = null;
        for (const instance of docsInstances) {
            const base = instance.basePath;
            const matches = base === '/' || normalized === base || normalized.startsWith(`${base}/`);
            if (matches && (!best || base.length > best.basePath.length)) best = instance;
        }
        return best;
    }

    // Doc pages of the configured instances emit TechArticle. The instance
    // root (the docs landing, or the homepage when docs live at "/") stays a
    // plain WebPage, matching the long-standing /docs carve-out.
    function isDocsInstanceArticle(route) {
        const normalized = normalizePermalink(route);
        for (const instance of docsInstances) {
            if (!techArticleDocsInstances.includes(instance.id)) continue;
            if (normalized === instance.basePath) continue;
            if (instance.docPermalinks.has(normalized)) return true;
        }
        return false;
    }

    const titleSuffix = ` ${titleDelimiter} ${orgName}`;
    const defaultInLanguage = (structuredData.webpage && structuredData.webpage.inLanguage) || 'en-US';
    const configDatePublished = (structuredData.webpage && structuredData.webpage.datePublished) || null;
    const skipRoutes = new Set(['/404.html', '/search']);

    // The blog instance (if any) whose base path owns this baseUrl-relative
    // route: the list page itself, a post, or a tags/page/archive route.
    function findBlogInstance(route) {
        const normalized = normalizePermalink(route);
        for (const instance of blogInstances) {
            if (normalized === instance.basePath || normalized.startsWith(`${instance.basePath}/`)) {
                return instance;
            }
        }
        return null;
    }

    // Tag and pagination routes of any blog instance: list pages, not content.
    function isBlogUtilityRoute(route) {
        const instance = findBlogInstance(route);
        if (!instance) return false;
        const rest = normalizePermalink(route).slice(instance.basePath.length);
        return rest === '/tags' || rest.startsWith('/tags/') || rest.startsWith('/page/');
    }

    function isSkippedRoute(route) {
        if (
            route === '/tags' ||
            route.startsWith('/tags/') ||
            route.startsWith('/page/') ||
            route === '/blog/tags' ||
            route.startsWith('/blog/tags/') ||
            route.startsWith('/blog/page/')
        ) {
            return true;
        }
        if (isBlogUtilityRoute(route)) {
            return true;
        }
        return skipRoutes.has(route);
    }

    function isTechArticleRoute(route) {
        return techArticleRoutePrefixes.some((prefix) => route.startsWith(prefix));
    }

    // breadcrumbLabelMap keys are either a full route path ("/blog/providers")
    // or a single path segment ("providers"). A full-path key wins, so the
    // same segment can mean different things in different places.
    const breadcrumbLabelMap = structuredData.breadcrumbLabelMap || {};

    function hasBreadcrumbLabel(token) {
        return Object.prototype.hasOwnProperty.call(breadcrumbLabelMap, token);
    }

    // Label for a crumb, or null when nothing applies: full-path key, then
    // segment key, then the built-in names for the classic docs and blog
    // roots. Callers decide the final fallback.
    function breadcrumbLabel(segment, fullPath) {
        if (fullPath !== undefined && hasBreadcrumbLabel(fullPath)) return breadcrumbLabelMap[fullPath];
        if (hasBreadcrumbLabel(segment)) return breadcrumbLabelMap[segment];
        if (segment === 'docs') return 'Documentation';
        if (segment === 'blog') return 'Blog';
        return null;
    }

    return {
    name: 'docusaurus-plugin-structured-data',

    // Docusaurus 3 only delivers allContent to allContentLoaded (not
    // contentLoaded). This is where we snapshot front matter and dates for
    // every route so postBuild can look them up without re-parsing source
    // files.
    async allContentLoaded({allContent}) {
        metaByPermalink = collectPageMeta(allContent, verbose);
        blogInstances = collectBlogInstances(allContent, siteConfig.baseUrl || '/', verbose);
        docsInstances = collectDocsInstances(allContent, siteConfig.baseUrl || '/', verbose);
    },

    async postBuild({siteConfig = {}, routesPaths = [], outDir}) {
        // routesPaths include siteConfig.baseUrl, but the build output tree
        // is rooted at the baseUrl (outDir/route-minus-baseUrl). On sites
        // with a non-root baseUrl the two differ; strip the prefix before
        // resolving files or every route silently misses its HTML.
        const siteBaseUrl = siteConfig.baseUrl || '/';

        // Every built route, baseUrl-relative, so breadcrumb ancestors can be
        // checked for existence: only a real page gets an `item` URL.
        const toOutputRoute = (route) => (route.startsWith(siteBaseUrl) ? `/${route.slice(siteBaseUrl.length)}` : route);
        const routeSet = new Set(routesPaths.map((route) => normalizePermalink(toOutputRoute(route))));
        const publicUrlPrefix = siteBaseUrl.endsWith('/') ? siteBaseUrl.slice(0, -1) : siteBaseUrl;

        // One timestamp for the whole build: the last-resort dateModified
        // for pages that carry no date of their own.
        const buildTime = new Date().toISOString();

        // Every route's HTML read is queued here, synchronously, before any
        // other plugin's postBuild I/O: Docusaurus runs the hooks in
        // parallel and Node's I/O threadpool is FIFO, so these reads (and
        // the parse-and-write that follows each one on the main thread)
        // complete before another HTML rewriter (e.g.
        // @stackql/docusaurus-plugin-aeo's alternate link) reads the same
        // file. Keep the fan-out synchronous when touching this. The hook
        // then waits for all of it, so a failure fails the build.
        await Promise.all(routesPaths.map(async (route) => {

            const outputRoute = route.startsWith(siteBaseUrl)
                ? `/${route.slice(siteBaseUrl.length)}`
                : route;

            if (isSkippedRoute(outputRoute)) {
                return;
            }

            // Resolve which built HTML file backs this route. Prefer the flat
            // form (outDir/route.html) over the directory-index form
            // (outDir/route/index.html). With trailingSlash:false sites emit
            // both shapes side-by-side (e.g. build/docs.html AND build/docs/
            // housing nested routes); the flat form is the canonical document
            // for the route itself. Using existence rather than reading
            // siteConfig.trailingSlash keeps this robust to Docusaurus 3's
            // per-page frontmatter overrides.
            let filePath;
            if (outputRoute === '/') {
                filePath = path.join(outDir, 'index.html');
            } else {
                const flatPath = path.join(outDir, `${outputRoute}.html`);
                const dirIndexPath = path.join(outDir, outputRoute, 'index.html');
                if (fs.existsSync(flatPath)) {
                    filePath = flatPath;
                    verbose ? console.log(`route: ${route} -> flat file ${flatPath}`): null;
                } else if (fs.existsSync(dirIndexPath)) {
                    filePath = dirIndexPath;
                    verbose ? console.log(`route: ${route} -> dir index ${dirIndexPath}`): null;
                } else {
                    verbose ? console.log(`skipping route ${route}: no built HTML at ${flatPath} or ${dirIndexPath}`): null;
                    return;
                }
            }

            if (!fs.existsSync(filePath)){
                verbose ? console.log(`skipping filePath: ${filePath} (route: ${route})...`): null;
                return;
            }

            if (isExcludedRoute(route, outputRoute)) {
                verbose ? console.log(`route: ${route} is excluded`): null;
                return;
            }

            const dom = await JSDOM.fromFile(filePath);
            verbose ? console.log(`processing route: ${route}...`): null;

            const doc = dom.window.document;
            const webPageUrl = `${baseUrl}${route}`;
            // Fragment ids hang off the URL without its trailing slash, so
            // the home page gets https://site/#webpage like every other
            // node, not https://site//#webpage.
            const idBase = webPageUrl.replace(/\/+$/, '');
            verbose ? console.log(`webPageUrl: ${webPageUrl}`): null;

            // Look up this route's captured metadata (may be undefined for
            // routes the content plugins did not own: redirects, custom
            // JSX pages, plugin-generated routes).
            const pageMeta = metaByPermalink.get(normalizePermalink(route)) || null;
            const frontMatter = (pageMeta && pageMeta.frontMatter) || {};

            // Defensive metadata reads. A page can lack <title>, the
            // description meta, etc. (e.g. redirect stubs, custom React
            // pages that bypass Docusaurus' head defaults). Fall back to
            // siteConfig values rather than crashing the whole build.
            const titleNode = doc.querySelector('title');
            const webPageTitle = titleNode
                ? titleNode.text.replace(titleSuffix, '')
                : (siteConfig.title || '');
            if (!titleNode && verbose) {
                console.log(`[structured-data] route ${route} has no <title>; falling back to siteConfig.title`);
            }
            verbose ? console.log(`webPageTitle: ${webPageTitle}`): null;

            const descNode = doc.head.querySelector('[name~=description][content]');
            const webPageDescription = descNode
                ? descNode.content
                : (siteConfig.tagline || '');
            if (!descNode && verbose) {
                console.log(`[structured-data] route ${route} has no <meta name="description">; falling back to siteConfig.tagline`);
            }
            verbose ? console.log(`webPageDescription: ${webPageDescription}`): null;

            // get page type and image...
            let webPageType = 'website';
            let webPageImage = themeConfig.image;
            let articleAuthorUrl;
            let articleAuthorName;
            let articlePublishedTime;
            let articleKeywords = [];
            let metaProficiencyLevel;
            let metaDependencies;
            let metaSpeakableOptOut = false;

            const metaNodeList = doc.querySelectorAll('meta');

            for (const value of metaNodeList.values()) {

                // check name attribute
                switch(value.name){
                    case 'author':
                        articleAuthorName = value.content;
                        break;
                    case 'keywords':
                        articleKeywords = value.content.split(',');
                        break;
                    case 'aeo:proficiencyLevel':
                        metaProficiencyLevel = value.content;
                        break;
                    case 'aeo:dependencies':
                        metaDependencies = value.content;
                        break;
                    case 'aeo:speakable':
                        if (value.content === 'false') metaSpeakableOptOut = true;
                        break;
                    default:
                        break;
                };

                // check property attribute
                switch(value.getAttribute('property')){
                    case 'og:type':
                        webPageType = value.content;
                        break;
                    case 'og:image':
                        webPageImage = value.content;
                        break;
                    case 'article:author':
                        articleAuthorUrl = value.content;
                        // if articleAuthorUrl contains multiple authors, only use the first one
                        articleAuthorUrl = articleAuthorUrl.split(',')[0];
                        break;
                    case 'article:published_time':
                        articlePublishedTime = value.content;
                        break;
                    default:
                        break;
                };
            }

            // route classification:
            //   route under any configured techArticleRoutePrefix, or a doc
            //   page of a techArticleDocsInstances instance -> TechArticle
            //   else any route with og:type=article -> Article
            // The prefix list defaults to ['/docs/']; landing routes like
            // /docs and /ai (no trailing slash) do not match a "/docs/" or
            // "/ai/" prefix, and docs instance roots are excluded, so both
            // stay plain WebPage, preserving the 1.4.x carve-out.
            const isTechArticle = isTechArticleRoute(route) || isDocsInstanceArticle(outputRoute);
            const isArticle = !isTechArticle && webPageType === 'article';
            const isPrimaryArticle = isArticle || isTechArticle;

            verbose ? console.log(`webPageType: ${webPageType}, isTechArticle: ${isTechArticle}, isArticle: ${isArticle}`): null;
            verbose ? console.log(`webPageImage: ${webPageImage}`): null;

            if(isArticle){

                verbose ? console.log(`articleAuthorUrl: ${articleAuthorUrl}`): null;

                if(!articleAuthorName){
                    verbose ? console.log(`articleAuthorName is not defined for route: ${route}, using inverted index`): null;
                    articleAuthorName = authorInvIndex[articleAuthorUrl];
                }

                verbose ? console.log(`articleAuthorName: ${articleAuthorName}`): null;
                verbose ? console.log(`articlePublishedTime: ${articlePublishedTime}`): null;
                verbose ? console.log(`articleKeywords: ${articleKeywords}`): null;
            }

            //
            // Resolve opt-in AEO payloads. Two sources:
            //   1) frontmatter (captured by allContentLoaded) - preferred
            //   2) script tags injected via MDX - 1.4.x compatibility path
            // When both are present for the same schema, frontmatter wins
            // and we log a verbose warning naming the duplicate.
            //

            const faqScriptPayload = readJsonScript(doc, 'script[type="application/json"][data-aeo-faq]', route, 'faq');
            const howToScriptPayload = readJsonScript(doc, 'script[type="application/json"][data-aeo-howto]', route, 'howTo');
            const softwareAppScriptPayload = readJsonScript(doc, 'script[type="application/json"][data-aeo-software]', route, 'softwareApplication');

            const faqFromFM = frontMatter.faq !== undefined ? frontMatter.faq : null;
            const howToFromFM = frontMatter.howTo !== undefined ? frontMatter.howTo : null;
            const softwareAppFromFM = frontMatter.softwareApplication !== undefined ? frontMatter.softwareApplication : null;

            if (verbose) {
                if (faqFromFM !== null && faqScriptPayload !== null) {
                    console.log(`[structured-data] route ${route}: both frontmatter.faq and <script data-aeo-faq> present; using frontmatter`);
                }
                if (howToFromFM !== null && howToScriptPayload !== null) {
                    console.log(`[structured-data] route ${route}: both frontmatter.howTo and <script data-aeo-howto> present; using frontmatter`);
                }
                if (softwareAppFromFM !== null && softwareAppScriptPayload !== null) {
                    console.log(`[structured-data] route ${route}: both frontmatter.softwareApplication and <script data-aeo-software> present; using frontmatter`);
                }
            }

            const faqPayload = faqFromFM !== null ? faqFromFM : faqScriptPayload;
            const howToPayload = howToFromFM !== null ? howToFromFM : howToScriptPayload;
            const softwareAppPayload = softwareAppFromFM !== null ? softwareAppFromFM : softwareAppScriptPayload;

            if (faqPayload !== null) validateFaq(faqPayload, route);
            if (howToPayload !== null) validateHowTo(howToPayload, route);
            if (softwareAppPayload !== null) validateSoftwareApplication(softwareAppPayload, route);

            // proficiencyLevel / dependencies: frontmatter wins, <meta> falls back.
            const proficiencyLevel = frontMatter.proficiencyLevel !== undefined
                ? frontMatter.proficiencyLevel
                : metaProficiencyLevel;
            const dependencies = frontMatter.dependencies !== undefined
                ? frontMatter.dependencies
                : metaDependencies;

            // speakable: frontmatter wins. Three frontmatter shapes:
            //   speakable: false           -> opt out for this page
            //   speakable: { cssSelector } -> per-page override
            //   speakable: { xpath }       -> per-page override
            // Falls back to the <meta name="aeo:speakable" content="false">
            // tag, then to the plugin-level default.
            let pageSpeakableSpec = null;
            if (defaultSpeakableSpec) {
                const fmSpeakable = frontMatter.speakable;
                if (fmSpeakable === false) {
                    pageSpeakableSpec = null;
                } else if (fmSpeakable && typeof fmSpeakable === 'object') {
                    pageSpeakableSpec = buildSpeakableSpec(fmSpeakable);
                } else if (metaSpeakableOptOut) {
                    pageSpeakableSpec = null;
                } else {
                    pageSpeakableSpec = defaultSpeakableSpec;
                }
            }

            // Dates the page can truthfully claim (see resolveDates).
            const { datePublished, dateModified } = resolveDates({
                frontMatter,
                meta: pageMeta,
                articlePublishedTime,
                configDatePublished,
                buildTime,
            });

            //
            // get WebPage data
            //

            verbose ? console.log('processing web page data...'): null;

            let webPageData = {
                '@type': 'WebPage',
                isPartOf: {
                    '@id': `${baseUrl}/#website`
                },
                ...structuredData.webpage,
            };

            webPageData['@id'] = `${idBase}/#webpage`;
            webPageData['url'] = `${webPageUrl}`;
            webPageData['name'] = webPageTitle;
            webPageData['description'] = webPageDescription;
            webPageData['inLanguage'] = defaultInLanguage;
            // No datePublished at all beats one that is really the build time.
            if (datePublished) {
                webPageData['datePublished'] = datePublished;
            } else {
                delete webPageData['datePublished'];
            }
            webPageData['dateModified'] = dateModified;
            webPageData['breadcrumb'] = {
                '@id': `${idBase}/#breadcrumb`
            };
            webPageData['potentialAction'] = [
                {
                    '@type': 'ReadAction',
                    target: [
                        `${webPageUrl}`
                    ]
                }
            ];

            if (pageSpeakableSpec) {
                webPageData['speakable'] = pageSpeakableSpec;
            }

            //
            // get Breadcrumb data
            //

            verbose ? console.log('processing breadcrumb data...'): null;

            const { breadcrumbData, blogCrumbNames, pageName, elementIndex } = buildBreadcrumb({
                baseUrl,
                publicUrlPrefix,
                outputRoute,
                webPageUrl: idBase,
                webPageTitle,
                blogInstance: findBlogInstance(outputRoute),
                docsInstance: findDocsInstance(outputRoute),
                routeSet,
                breadcrumbLinkAncestors,
                breadcrumbLabel,
            });

            verbose ? console.log(`pageName: ${pageName}, elementIndex: ${elementIndex}`): null;

            // article / techarticle related structured data
            let articleData;
            let imageObjectData;
            let personData;

            if(isPrimaryArticle){

                verbose ? console.log(`Adding ${isTechArticle ? 'TechArticle' : 'Article'} data...`): null;

                // The ImageObject needs real dimensions; say which option
                // is missing rather than emitting width: undefined.
                validateFeaturedImageDimensions(structuredData.featuredImageDimensions, `route "${route}"`);

                // get word count
                let wordCount = 0;
                let paragraphs = doc.getElementsByTagName('p');
                for (let i = 0; i < paragraphs.length; i++) {
                    wordCount += paragraphs[i].textContent.split(' ').length;
                }

                const articleType = isTechArticle ? 'TechArticle' : 'Article';
                // blog posts carry their instance crumbs (e.g. ['Blog',
                // 'Product Announcements']) as the section
                const articleSection = isTechArticle
                    ? ['Documentation']
                    : (blogCrumbNames && blogCrumbNames.length > 0 ? blogCrumbNames : ['Blog']);
                // An article needs a datePublished; a page with no date of
                // its own claims its last modification, which is at least true.
                const articleDatePublished = datePublished || dateModified;

                articleData = {
                    '@type': articleType,
                    '@id': `${idBase}/#article`,
                    isPartOf: {
                        '@type': 'WebPage',
                        '@id': `${idBase}/#webpage`
                    },
                    headline: webPageTitle,
                    datePublished: articleDatePublished,
                    dateModified: dateModified,
                    mainEntityOfPage: {
                        '@id': `${idBase}/#webpage`
                    },
                    wordCount: wordCount,
                    publisher: {
                        '@id': `${baseUrl}/#organization`
                    },
                    image: {
                        '@id': `${idBase}/#primaryimage`
                    },
                    thumbnailUrl: `${webPageImage}`,
                    keywords: articleKeywords,
                    articleSection: articleSection,
                    inLanguage: webPageData.inLanguage,
                };

                if (isArticle && articleAuthorName && authors[articleAuthorName]) {
                    articleData.author = {
                        name: articleAuthorName,
                        '@id': `${baseUrl}/#/schema/person/${authors[articleAuthorName].authorId}`
                    };
                }

                if (isTechArticle) {
                    if (proficiencyLevel) articleData.proficiencyLevel = proficiencyLevel;
                    if (dependencies) articleData.dependencies = dependencies;
                }

                // image object data
                imageObjectData = {
                    '@type': 'ImageObject',
                    inLanguage: webPageData.inLanguage,
                    '@id': `${idBase}/#primaryimage`,
                    url: `${webPageImage}`,
                    contentUrl: `${webPageImage}`,
                    caption: `${webPageTitle}`,
                    width: structuredData.featuredImageDimensions.width,
                    height: structuredData.featuredImageDimensions.height,
                };

                // person data (Article only; TechArticle has no author concept)
                if (isArticle && articleAuthorName && authors[articleAuthorName]) {
                    verbose ? console.log(`Getting person data for ${articleAuthorName}...`): null;

                    personData = {
                        '@type': 'Person',
                        '@id': `${baseUrl}/#/schema/person/${authors[articleAuthorName].authorId}`,
                        name: `${articleAuthorName}`,
                        image: {
                            '@type': 'ImageObject',
                            inLanguage: webPageData.inLanguage,
                            '@id': `${baseUrl}/#/schema/person/image/${authors[articleAuthorName].authorId}`,
                            url: authors[articleAuthorName].imageUrl,
                            contentUrl: authors[articleAuthorName].imageUrl,
                            caption: `${articleAuthorName}`,
                            },
                        sameAs: authors[articleAuthorName].sameAs,
                        url: `${articleAuthorUrl}`,
                    }
                }
            };

            //
            // secondary entities (FAQPage, HowTo, SoftwareApplication)
            //

            let faqNode = null;
            let howToNode = null;
            let softwareAppNode = null;

            if (faqPayload) {
                faqNode = buildFaqNode(faqPayload, idBase);
            }
            if (howToPayload) {
                howToNode = buildHowToNode(howToPayload, idBase);
            }
            if (softwareAppPayload && softwareAppPayload !== false) {
                softwareAppNode = buildSoftwareApplicationNode(softwareAppPayload, idBase, webPageTitle, softwareApplicationDefaults);
            }

            // graph linking - primary entity's mainEntity points at the secondary @id
            // priority: HowTo > FAQPage > SoftwareApplication
            const primary = articleData || webPageData;
            if (howToNode) {
                primary.mainEntity = { '@id': howToNode['@id'] };
            } else if (faqNode) {
                primary.mainEntity = { '@id': faqNode['@id'] };
            } else if (softwareAppNode) {
                primary.mainEntity = { '@id': softwareAppNode['@id'] };
            }

            //
            // add data to graph
            //

            verbose ? console.log('adding data to graph...'): null;

            let data = {};
            data['@context'] = 'https://schema.org';
            data['@graph'] = [];

            if (isPrimaryArticle) {
                data['@graph'].push(articleData);
                data['@graph'].push(webPageData);
                data['@graph'].push(imageObjectData);
                data['@graph'].push(breadcrumbData);
                data['@graph'].push(webSiteData);
                data['@graph'].push(orgData);
                if (personData) data['@graph'].push(personData);
            } else {
                data['@graph'].push(webPageData);
                data['@graph'].push(breadcrumbData);
                data['@graph'].push(webSiteData);
                data['@graph'].push(orgData);
            }

            if (softwareSourceCodeData) data['@graph'].push(softwareSourceCodeData);
            if (faqNode) data['@graph'].push(faqNode);
            if (howToNode) data['@graph'].push(howToNode);
            if (softwareAppNode) data['@graph'].push(softwareAppNode);

            let script = doc.createElement('script');
            script.type = 'application/ld+json';

            script.innerHTML = JSON.stringify(data);
            doc.head.appendChild(script);

            // find and remove breadcrumb microdata
            let breadcrumbMicrodata = doc.querySelector('ul[itemtype="https://schema.org/BreadcrumbList"]');
            if(breadcrumbMicrodata){
                breadcrumbMicrodata.removeAttribute('itemtype');
                breadcrumbMicrodata.removeAttribute('itemscope');
            }

            let breadcrumbListItemMicrodata = doc.querySelector('li[itemtype="https://schema.org/ListItem"]');
            if(breadcrumbListItemMicrodata){
                breadcrumbListItemMicrodata.removeAttribute('itemtype');
                breadcrumbListItemMicrodata.removeAttribute('itemscope');
                breadcrumbListItemMicrodata.removeAttribute('itemprop');
            }

            // find and remove <meta itemprop="position" ..>, excess baggage with JSON-LD breadcrumb data
            let breadcrumbPositionMeta = doc.querySelectorAll('meta[itemprop="position"]');
            if(breadcrumbPositionMeta){
                breadcrumbPositionMeta.forEach((element) => {
                    element.remove();
                });
            }

            fs.writeFileSync(filePath, dom.serialize());
        }));
      },
  };
};
