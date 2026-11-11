// Pure helpers for the plugin: validators, node builders, date resolution,
// the breadcrumb builder and the route matcher. Nothing here touches
// Docusaurus, the filesystem or the DOM, so all of it is covered by
// `npm test` (node:test) without a site build.

const TAG = '[docusaurus-plugin-structured-data]';

const DEFAULT_SPEAKABLE_SELECTORS = ['h1', 'article p:first-of-type', '[data-speakable]'];
const DEFAULT_TECH_ARTICLE_PREFIXES = ['/docs/'];

// schema.org's documented applicationCategory values (the list Google's
// software-app guidance also uses). The property is formally Text or URL,
// but anything outside this list is almost always a typo or a made-up
// category that no consumer recognises, so it fails the build.
const APPLICATION_CATEGORIES = [
    'GameApplication',
    'SocialNetworkingApplication',
    'TravelApplication',
    'ShoppingApplication',
    'SportsApplication',
    'LifestyleApplication',
    'BusinessApplication',
    'DesignApplication',
    'DeveloperApplication',
    'DriverApplication',
    'EducationalApplication',
    'HealthApplication',
    'FinanceApplication',
    'SecurityApplication',
    'BrowserApplication',
    'CommunicationApplication',
    'DesktopEnhancementApplication',
    'EntertainmentApplication',
    'MultimediaApplication',
    'HomeApplication',
    'UtilitiesApplication',
    'ReferenceApplication',
];

// 'ignore' (the default) adds the plugin's graph without looking at what
// the page already has; 'reuse' leaves out the nodes the page already has.
const NATIVE_STRUCTURED_DATA_MODES = ['ignore', 'reuse'];

// schema.org's Article and every subtype of it. A page that already
// carries one of these (the classic theme writes a BlogPosting on blog
// posts) does not get a second article from the plugin in 'reuse' mode.
const ARTICLE_TYPES = [
    'Article',
    'AdvertiserContentArticle',
    'NewsArticle',
    'AnalysisNewsArticle',
    'AskPublicNewsArticle',
    'BackgroundNewsArticle',
    'OpinionNewsArticle',
    'ReportageNewsArticle',
    'ReviewNewsArticle',
    'Report',
    'SatiricalArticle',
    'ScholarlyArticle',
    'MedicalScholarlyArticle',
    'SocialMediaPosting',
    'BlogPosting',
    'LiveBlogPosting',
    'DiscussionForumPosting',
    'TechArticle',
    'APIReference',
];

// ------------------------------------------------------------ validators

function validateFaq(payload, route) {
    if (!Array.isArray(payload)) {
        throw new Error(`${TAG} route "${route}": "faq" must be an array of {question, answer} objects`);
    }
    payload.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(`${TAG} route "${route}": faq[${i}] must be an object`);
        }
        if (typeof entry.question !== 'string' || !entry.question.trim()) {
            throw new Error(`${TAG} route "${route}": faq[${i}].question must be a non-empty string`);
        }
        if (typeof entry.answer !== 'string' || !entry.answer.trim()) {
            throw new Error(`${TAG} route "${route}": faq[${i}].answer must be a non-empty string`);
        }
    });
}

function validateHowTo(payload, route) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`${TAG} route "${route}": "howTo" must be an object with {name, steps[]}`);
    }
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
        throw new Error(`${TAG} route "${route}": howTo.name must be a non-empty string`);
    }
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
        throw new Error(`${TAG} route "${route}": howTo.steps must be a non-empty array`);
    }
    payload.steps.forEach((step, i) => {
        if (!step || typeof step !== 'object') {
            throw new Error(`${TAG} route "${route}": howTo.steps[${i}] must be an object`);
        }
        if (typeof step.name !== 'string' || !step.name.trim()) {
            throw new Error(`${TAG} route "${route}": howTo.steps[${i}].name must be a non-empty string`);
        }
        if (typeof step.text !== 'string' || !step.text.trim()) {
            throw new Error(`${TAG} route "${route}": howTo.steps[${i}].text must be a non-empty string`);
        }
    });
}

function validateApplicationCategory(value, where) {
    if (value === undefined || value === null) return;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) {
        if (typeof v !== 'string' || !APPLICATION_CATEGORIES.includes(v)) {
            throw new Error(
                `${TAG} ${where}: applicationCategory ${JSON.stringify(v)} is not a schema.org application category. Valid values: ${APPLICATION_CATEGORIES.join(', ')}`
            );
        }
    }
}

function validateSoftwareApplication(payload, route) {
    if (payload === true) return;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(
            `${TAG} route "${route}": "softwareApplication" must be an object (or true to opt in with no fields)`
        );
    }
    if (payload.featureList && !Array.isArray(payload.featureList)) {
        throw new Error(`${TAG} route "${route}": softwareApplication.featureList must be an array of strings`);
    }
    validateApplicationCategory(payload.applicationCategory, `route "${route}"`);
}

// themeConfig.structuredData.softwareApplication: site-wide defaults for
// every SoftwareApplication node a page opts into.
function validateSoftwareApplicationDefaults(defaults) {
    if (defaults === undefined || defaults === null) return;
    if (typeof defaults !== 'object' || Array.isArray(defaults)) {
        throw new Error(`${TAG} themeConfig.structuredData.softwareApplication must be an object of SoftwareApplication defaults`);
    }
    if (defaults.featureList && !Array.isArray(defaults.featureList)) {
        throw new Error(`${TAG} themeConfig.structuredData.softwareApplication.featureList must be an array of strings`);
    }
    validateApplicationCategory(defaults.applicationCategory, 'themeConfig.structuredData.softwareApplication');
}

// themeConfig.structuredData.softwareSourceCode: the site-wide
// SoftwareSourceCode node. codeRepository is the one required field.
function validateSoftwareSourceCode(cfg) {
    if (cfg === undefined || cfg === null) return;
    if (typeof cfg !== 'object' || Array.isArray(cfg)) {
        throw new Error(`${TAG} themeConfig.structuredData.softwareSourceCode must be an object`);
    }
    if (typeof cfg.codeRepository !== 'string' || !/^https?:\/\//.test(cfg.codeRepository)) {
        throw new Error(
            `${TAG} themeConfig.structuredData.softwareSourceCode.codeRepository must be the repository URL (e.g. "https://github.com/org/repo")`
        );
    }
}

function validateTechArticleRoutePrefixes(prefixes) {
    if (!Array.isArray(prefixes)) {
        throw new Error(`${TAG} themeConfig.structuredData.techArticleRoutePrefixes must be an array of strings`);
    }
    prefixes.forEach((prefix, i) => {
        if (typeof prefix !== 'string') {
            throw new Error(`${TAG} techArticleRoutePrefixes[${i}] must be a string, got ${typeof prefix}`);
        }
        if (!prefix.startsWith('/') || !prefix.endsWith('/')) {
            throw new Error(
                `${TAG} techArticleRoutePrefixes[${i}] (${JSON.stringify(prefix)}) must start and end with "/" (e.g. "/docs/")`
            );
        }
    });
}

// Optional: the pixel size of the site's default image (themeConfig.image).
// Without it no ImageObject states a width or height. A present block must
// be usable.
function validateFeaturedImageDimensions(dims) {
    if (dims === undefined || dims === null) return;
    const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
    if (typeof dims !== 'object' || !ok(dims.width) || !ok(dims.height)) {
        throw new Error(`${TAG} themeConfig.structuredData.featuredImageDimensions must be { width: number, height: number } in pixels`);
    }
}

// themeConfig.structuredData.nativeStructuredData: what to do about JSON-LD
// a page already carries when the plugin runs (see findNativeNodes).
function validateNativeStructuredData(mode) {
    if (mode === undefined || NATIVE_STRUCTURED_DATA_MODES.includes(mode)) return;
    throw new Error(
        `${TAG} themeConfig.structuredData.nativeStructuredData must be ${NATIVE_STRUCTURED_DATA_MODES.map((m) => JSON.stringify(m)).join(' or ')}, got ${JSON.stringify(mode)}`
    );
}

// Docusaurus hands every plugin an options object; this one is configured
// under themeConfig.structuredData only. Anything else passed as a plugin
// option used to be ignored silently, which hid misplaced configuration.
function validatePluginOptions(options) {
    if (!options || typeof options !== 'object') return;
    const stray = Object.keys(options).filter((k) => k !== 'id');
    if (stray.length > 0) {
        throw new Error(
            `${TAG} takes no plugin options (got ${stray.map((k) => JSON.stringify(k)).join(', ')}); configure it under themeConfig.structuredData in docusaurus.config.js`
        );
    }
}

// --------------------------------------------------------------- builders

function buildFaqNode(faq, webPageUrl) {
    return {
        '@type': 'FAQPage',
        '@id': `${webPageUrl}/#faq`,
        mainEntity: faq.map((entry, i) => ({
            '@type': 'Question',
            '@id': `${webPageUrl}/#faq-q-${i}`,
            name: entry.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: entry.answer,
            },
        })),
    };
}

function buildHowToNode(howTo, webPageUrl) {
    const node = {
        '@type': 'HowTo',
        '@id': `${webPageUrl}/#howto`,
        name: howTo.name,
        step: howTo.steps.map((step, i) => {
            const stepNode = {
                '@type': 'HowToStep',
                position: i + 1,
                name: step.name,
                text: step.text,
            };
            if (step.url) stepNode.url = step.url;
            if (step.image) stepNode.image = step.image;
            return stepNode;
        }),
    };
    if (howTo.totalTime) node.totalTime = howTo.totalTime;
    if (howTo.estimatedCost) node.estimatedCost = howTo.estimatedCost;
    if (howTo.description) node.description = howTo.description;
    return node;
}

// The page payload (`true` for a bare opt-in, or an object) layered over
// the site-wide defaults from themeConfig.structuredData.softwareApplication.
// `offers` is derived when the application is free and no explicit offer is
// given: { '@type': 'Offer', price: 0, priceCurrency }. Unknown keys pass
// through so a consumer can add any schema.org property.
function buildSoftwareApplicationNode(sa, webPageUrl, webPageTitle, defaults) {
    const page = sa === true ? {} : (sa || {});
    const fields = { ...(defaults || {}), ...page };
    const {
        name,
        isAccessibleForFree,
        priceCurrency,
        offers,
        ...rest
    } = fields;

    const node = {
        '@type': 'SoftwareApplication',
        '@id': `${webPageUrl}/#softwareapplication`,
        name: name || webPageTitle,
    };
    for (const key of [
        'applicationCategory',
        'applicationSubCategory',
        'operatingSystem',
        'featureList',
        'softwareVersion',
        'downloadUrl',
        'installUrl',
        'license',
        'url',
        'sameAs',
        'description',
        'softwareRequirements',
        'releaseNotes',
        'screenshot',
    ]) {
        if (rest[key] !== undefined) {
            node[key] = rest[key];
            delete rest[key];
        }
    }
    if (isAccessibleForFree !== undefined) node.isAccessibleForFree = isAccessibleForFree;
    if (offers !== undefined) {
        node.offers = offers;
    } else if (isAccessibleForFree === true) {
        node.offers = { '@type': 'Offer', price: 0, priceCurrency: priceCurrency || 'USD' };
    }
    // anything else the consumer put in the payload or the defaults
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && node[key] === undefined) node[key] = value;
    }
    return node;
}

// Site-wide SoftwareSourceCode node for an open-source product site: the
// repository, language, licence and platform. Referenced from WebSite.about.
function buildSoftwareSourceCodeNode(cfg, baseUrl, siteTitle) {
    const { name, codeRepository, programmingLanguage, license, runtimePlatform, ...rest } = cfg;
    const node = {
        '@type': 'SoftwareSourceCode',
        '@id': `${baseUrl}/#softwaresourcecode`,
        name: name || siteTitle,
        codeRepository,
    };
    if (programmingLanguage !== undefined) node.programmingLanguage = programmingLanguage;
    if (license !== undefined) node.license = license;
    if (runtimePlatform !== undefined) node.runtimePlatform = runtimePlatform;
    for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && node[key] === undefined) node[key] = value;
    }
    return node;
}

function buildSpeakableSpec(speakableConfig) {
    if (speakableConfig && speakableConfig.xpath) {
        return {
            '@type': 'SpeakableSpecification',
            xpath: Array.isArray(speakableConfig.xpath) ? speakableConfig.xpath : [speakableConfig.xpath],
        };
    }
    const selectors = (speakableConfig && speakableConfig.cssSelector)
        ? (Array.isArray(speakableConfig.cssSelector) ? speakableConfig.cssSelector : [speakableConfig.cssSelector])
        : DEFAULT_SPEAKABLE_SELECTORS;
    return {
        '@type': 'SpeakableSpecification',
        cssSelector: selectors,
    };
}

// The organization block is merged into the Organization node as written.
// This fills in the @types agents and search engines expect on its nested
// objects and warns (once) when a contact point has no contactType, which
// Google's Organization guidance treats as required.
function normalizeOrganization(org, warn) {
    const out = { ...(org || {}) };
    const warnings = [];
    if (out.contactPoint !== undefined) {
        const list = Array.isArray(out.contactPoint) ? out.contactPoint : [out.contactPoint];
        const normalized = list
            .filter((cp) => cp && typeof cp === 'object')
            .map((cp) => ({ '@type': 'ContactPoint', ...cp }));
        if (normalized.some((cp) => !cp.contactType)) {
            warnings.push(
                `${TAG} organization.contactPoint has no contactType; set one (e.g. "customer support", "sales", "technical support") so agents and search engines can classify it`
            );
        }
        out.contactPoint = Array.isArray(out.contactPoint) ? normalized : normalized[0];
    }
    if (out.address && typeof out.address === 'object' && !out.address['@type']) {
        out.address = { '@type': 'PostalAddress', ...out.address };
    }
    if (typeof out.logo === 'string') {
        out.logo = { '@type': 'ImageObject', url: out.logo, contentUrl: out.logo };
    } else if (out.logo && typeof out.logo === 'object' && !out.logo['@type']) {
        out.logo = { '@type': 'ImageObject', ...out.logo };
    }
    if (typeof warn === 'function') warnings.forEach((w) => warn(w));
    return out;
}

// -------------------------------------------------- native structured data

// A node's @type values as bare schema.org names ("BlogPosting" for
// "BlogPosting", "schema:BlogPosting" and "https://schema.org/BlogPosting").
function nodeTypes(node) {
    const raw = node && node['@type'];
    return (Array.isArray(raw) ? raw : [raw])
        .filter((t) => typeof t === 'string')
        .map((t) => t.replace(/^(?:https?:\/\/schema\.org\/|schema:)/, ''));
}

// The nodes a page already has that the plugin would otherwise duplicate:
// a BreadcrumbList (the classic theme writes one on docs pages since
// Docusaurus 3.8) and an Article of any subtype (its BlogPosting on blog
// posts). `blocks` is the text of each application/ld+json script on the
// page. Only top-level nodes count, including the members of a top-level
// @graph: the BlogPostings nested in a blog list page's Blog node describe
// other pages. A block that is not valid JSON is skipped and reported to
// onInvalid. Where several nodes qualify, one with an @id is preferred,
// since that is the one the plugin's graph can point at.
function findNativeNodes(blocks, onInvalid) {
    const nodes = [];
    const collect = (value) => {
        if (Array.isArray(value)) {
            value.forEach(collect);
        } else if (value && typeof value === 'object') {
            if (Array.isArray(value['@graph'])) value['@graph'].forEach(collect);
            else nodes.push(value);
        }
    };
    (blocks || []).forEach((text, index) => {
        if (typeof text !== 'string' || !text.trim()) return;
        try {
            collect(JSON.parse(text));
        } catch (err) {
            if (typeof onInvalid === 'function') onInvalid(err, index);
        }
    });
    const pick = (matches) => matches.find((n) => typeof n['@id'] === 'string' && n['@id']) || matches[0] || null;
    return {
        breadcrumb: pick(nodes.filter((n) => nodeTypes(n).includes('BreadcrumbList'))),
        article: pick(nodes.filter((n) => nodeTypes(n).some((t) => ARTICLE_TYPES.includes(t)))),
    };
}

// What the plugin adds to an article node the page already carries: the
// link back to the plugin's WebPage, and the publisher and dateModified the
// node does not state itself. It is a node with the article's @id and no
// @type, so it merges into that article rather than standing as a second
// one. Null when the article has no @id to merge on.
function buildNativeArticleSupplement(article, { webPageId, organizationId, dateModified }) {
    const id = article && article['@id'];
    if (typeof id !== 'string' || !id) return null;
    const node = {
        '@id': id,
        mainEntityOfPage: { '@id': webPageId },
    };
    if (article.publisher === undefined) node.publisher = { '@id': organizationId };
    if (article.dateModified === undefined && dateModified) node.dateModified = dateModified;
    return node;
}

// ----------------------------------------------------------------- images

// The absolute URL Docusaurus renders for a site image path such as
// themeConfig.image (useBaseUrl with absolute: true): a URL with a protocol
// is kept, anything else is put under siteConfig.baseUrl and siteConfig.url.
function resolveSiteImageUrl(image, siteUrl, baseUrl) {
    if (typeof image !== 'string' || !image) return null;
    if (/^(?:\w*:|\/\/)/.test(image)) return image;
    const base = baseUrl || '/';
    const underBase = image.startsWith(base) ? image : `${base}${image.replace(/^\//, '')}`;
    return `${siteUrl || ''}${underBase}`;
}

// Whether a page's image (its og:image, or themeConfig.image when the page
// has none) is the site default. featuredImageDimensions describes that one
// file, so only then may an ImageObject state a width and height.
function isSiteDefaultImage(pageImage, defaultImage, siteUrl, baseUrl) {
    if (typeof pageImage !== 'string' || !pageImage) return false;
    if (typeof defaultImage !== 'string' || !defaultImage) return false;
    return pageImage === defaultImage || pageImage === resolveSiteImageUrl(defaultImage, siteUrl, baseUrl);
}

// ------------------------------------------------------------------ dates

// Any date-ish value -> ISO 8601 string, or null. Numbers are epoch
// milliseconds (Docusaurus >= 3.5 lastUpdatedAt) or seconds (earlier).
function toIsoDate(value) {
    if (value === undefined || value === null || value === '') return null;
    let d;
    if (value instanceof Date) {
        d = value;
    } else if (typeof value === 'number') {
        d = new Date(value < 1e11 ? value * 1000 : value);
    } else if (typeof value === 'string') {
        d = new Date(value);
    } else {
        return null;
    }
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Dates a page can truthfully claim.
//
//   datePublished: the blog post's date, the article:published_time meta,
//                  a `datePublished` or `date` in front matter, then the
//                  site-wide webpage.datePublished. Null when none exists:
//                  no date is better than a date that is really the build.
//   dateModified:  the docs lastUpdatedAt (git, when showLastUpdateTime is
//                  on; front matter last_update.date folds into it), a blog
//                  post's lastUpdatedAt, front matter last_update.date, the
//                  blog post's date, and only then the build time: a page
//                  with no modification record of its own (a generated
//                  category index, a React page, docs without git info)
//                  was at least generated then, whereas repeating
//                  datePublished would claim it has never changed.
//
// dateModified is never earlier than datePublished.
function resolveDates({ frontMatter, meta, articlePublishedTime, configDatePublished, buildTime }) {
    const fm = frontMatter || {};
    const m = meta || {};
    const datePublished =
        toIsoDate(m.date) ||
        toIsoDate(articlePublishedTime) ||
        toIsoDate(fm.datePublished) ||
        toIsoDate(fm.date) ||
        toIsoDate(configDatePublished) ||
        null;
    let dateModified =
        toIsoDate(m.lastUpdatedAt) ||
        toIsoDate(fm.last_update && fm.last_update.date) ||
        toIsoDate(m.date) ||
        toIsoDate(buildTime) ||
        new Date().toISOString();
    if (datePublished && dateModified < datePublished) dateModified = datePublished;
    return { datePublished, dateModified };
}

// ----------------------------------------------------------------- routes

// Strip a trailing slash so frontmatter lookups normalize routes regardless of
// trailingSlash config. Keep "/" intact.
function normalizePermalink(permalink) {
    if (typeof permalink !== 'string' || !permalink) return permalink;
    if (permalink === '/') return permalink;
    return permalink.endsWith('/') ? permalink.slice(0, -1) : permalink;
}

// excludedRoutes entries are exact routes or globs: `*` matches within a
// segment, `**` across segments, `?` one character. The same syntax
// @stackql/docusaurus-plugin-aeo uses for its route patterns.
function globToRegExp(glob) {
    let re = '';
    for (let i = 0; i < glob.length; i++) {
        const c = glob[i];
        if (c === '*') {
            if (glob[i + 1] === '*') {
                re += '.*';
                i++;
                if (glob[i + 1] === '/') i++;
            } else {
                re += '[^/]*';
            }
        } else if (c === '?') {
            re += '[^/]';
        } else if ('.+^$()|{}[]\\'.includes(c)) {
            re += `\\${c}`;
        } else {
            re += c;
        }
    }
    return new RegExp(`^${re}$`);
}

function routeMatcher(patterns) {
    const list = Array.isArray(patterns) ? patterns.filter((p) => typeof p === 'string' && p) : [];
    const exact = new Set();
    const globs = [];
    for (const p of list) {
        if (/[*?]/.test(p)) globs.push(globToRegExp(p));
        else exact.add(p);
    }
    return (...routes) =>
        routes.some((route) => {
            if (typeof route !== 'string') return false;
            const n = normalizePermalink(route);
            return exact.has(route) || exact.has(n) || globs.some((g) => g.test(route) || g.test(n));
        });
}

// ------------------------------------------------------------ breadcrumbs

// The BreadcrumbList for a route, and the names of the blog crumbs between
// Home and the page (null for non-blog routes), which Article reuses as
// articleSection.
//
//   blog route   Home > one crumb per segment of the instance base path
//                (Blog > Product Announcements) > the page; the instance
//                list page is the last base-path crumb itself
//   other route  Home > the docs instance root if the route is under one
//                > the page. Other ancestors fold into the leaf name
//                ("Command Line Usage - exec") unless breadcrumbLinkAncestors
//                is set, in which case any ancestor that is itself a built
//                route becomes its own linked crumb.
function buildBreadcrumb({
    baseUrl,
    publicUrlPrefix,
    outputRoute,
    webPageUrl,
    webPageTitle,
    blogInstance,
    docsInstance,
    routeSet,
    breadcrumbLinkAncestors,
    breadcrumbLabel,
}) {
    const home = {
        '@type': 'ListItem',
        position: 1,
        item: `${baseUrl}${publicUrlPrefix || ''}`,
        name: 'Home',
    };
    const breadcrumbData = {
        '@type': 'BreadcrumbList',
        '@id': `${webPageUrl}/#breadcrumb`,
        itemListElement: [],
    };
    let pageName;
    let elementIndex = 1;
    let blogCrumbNames = null;

    if (blogInstance) {
        breadcrumbData.itemListElement.push(home);
        const isListPage = normalizePermalink(outputRoute) === blogInstance.basePath;
        const baseSegments = blogInstance.basePath.split('/').filter(Boolean);
        blogCrumbNames = [];
        elementIndex = 2;
        baseSegments.forEach((segment, index) => {
            const isInstanceRoot = index === baseSegments.length - 1;
            const crumbPath = `/${baseSegments.slice(0, index + 1).join('/')}`;
            const name = breadcrumbLabel(segment, crumbPath)
                || (isInstanceRoot && blogInstance.title ? blogInstance.title : segment);
            blogCrumbNames.push(name);
            if (isInstanceRoot && isListPage) {
                pageName = name;
                return;
            }
            breadcrumbData.itemListElement.push({
                '@type': 'ListItem',
                position: elementIndex,
                item: `${baseUrl}${publicUrlPrefix || ''}${crumbPath}`,
                name,
            });
            elementIndex += 1;
        });
        if (!isListPage) {
            pageName = `${webPageTitle}`;
        }
    } else {
        const segments = normalizePermalink(outputRoute).split('/').filter(Boolean);
        if (segments.length === 0) {
            pageName = `${webPageTitle}`;
            if (pageName !== 'Home') {
                breadcrumbData.itemListElement.push(home);
                elementIndex = 2;
            }
        } else {
            breadcrumbData.itemListElement.push(home);
            elementIndex = 2;
            const folded = [];
            segments.slice(0, -1).forEach((segment, index) => {
                const ancestorPath = `/${segments.slice(0, index + 1).join('/')}`;
                const name = breadcrumbLabel(segment, ancestorPath) || segment;
                const isInstanceRoot = !!docsInstance && ancestorPath === docsInstance.basePath;
                if (routeSet.has(ancestorPath) && (isInstanceRoot || breadcrumbLinkAncestors)) {
                    breadcrumbData.itemListElement.push({
                        '@type': 'ListItem',
                        position: elementIndex,
                        item: `${baseUrl}${publicUrlPrefix || ''}${ancestorPath}`,
                        name,
                    });
                    elementIndex += 1;
                } else {
                    folded.push(name);
                }
            });
            const leafPath = `/${segments.join('/')}`;
            const isDocsRoot = !!docsInstance && docsInstance.basePath !== '/' && leafPath === docsInstance.basePath;
            const leafSegment = segments[segments.length - 1];
            const leafName = isDocsRoot
                ? (breadcrumbLabel(leafSegment, leafPath) || `${webPageTitle}`)
                : `${webPageTitle}`;
            pageName = [...folded, leafName].join(' - ');
        }
    }

    breadcrumbData.itemListElement.push({
        '@type': 'ListItem',
        position: elementIndex,
        name: `${pageName}`,
    });
    return { breadcrumbData, blogCrumbNames, pageName, elementIndex };
}

module.exports = {
    TAG,
    DEFAULT_SPEAKABLE_SELECTORS,
    DEFAULT_TECH_ARTICLE_PREFIXES,
    APPLICATION_CATEGORIES,
    NATIVE_STRUCTURED_DATA_MODES,
    ARTICLE_TYPES,
    validateFaq,
    validateHowTo,
    validateApplicationCategory,
    validateSoftwareApplication,
    validateSoftwareApplicationDefaults,
    validateSoftwareSourceCode,
    validateTechArticleRoutePrefixes,
    validateFeaturedImageDimensions,
    validateNativeStructuredData,
    validatePluginOptions,
    buildFaqNode,
    buildHowToNode,
    buildSoftwareApplicationNode,
    buildSoftwareSourceCodeNode,
    buildSpeakableSpec,
    normalizeOrganization,
    nodeTypes,
    findNativeNodes,
    buildNativeArticleSupplement,
    resolveSiteImageUrl,
    isSiteDefaultImage,
    toIsoDate,
    resolveDates,
    normalizePermalink,
    globToRegExp,
    routeMatcher,
    buildBreadcrumb,
};
