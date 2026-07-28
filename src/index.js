const path = require('path');
const fs = require('fs');
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const DEFAULT_SPEAKABLE_SELECTORS = ['h1', 'article p:first-of-type', '[data-speakable]'];
const DEFAULT_TECH_ARTICLE_PREFIXES = ['/docs/'];

function readJsonScript(doc, selector, route, fieldName) {
    const node = doc.querySelector(selector);
    if (!node) return null;
    const raw = node.textContent.trim();
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (err) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": ${fieldName} payload is not valid JSON (${err.message})`
        );
    }
}

function validateFaq(payload, route) {
    if (!Array.isArray(payload)) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": "faq" must be an array of {question, answer} objects`
        );
    }
    payload.forEach((entry, i) => {
        if (!entry || typeof entry !== 'object') {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": faq[${i}] must be an object`
            );
        }
        if (typeof entry.question !== 'string' || !entry.question.trim()) {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": faq[${i}].question must be a non-empty string`
            );
        }
        if (typeof entry.answer !== 'string' || !entry.answer.trim()) {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": faq[${i}].answer must be a non-empty string`
            );
        }
    });
}

function validateHowTo(payload, route) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": "howTo" must be an object with {name, steps[]}`
        );
    }
    if (typeof payload.name !== 'string' || !payload.name.trim()) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": howTo.name must be a non-empty string`
        );
    }
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": howTo.steps must be a non-empty array`
        );
    }
    payload.steps.forEach((step, i) => {
        if (!step || typeof step !== 'object') {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": howTo.steps[${i}] must be an object`
            );
        }
        if (typeof step.name !== 'string' || !step.name.trim()) {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": howTo.steps[${i}].name must be a non-empty string`
            );
        }
        if (typeof step.text !== 'string' || !step.text.trim()) {
            throw new Error(
                `[docusaurus-plugin-structured-data] route "${route}": howTo.steps[${i}].text must be a non-empty string`
            );
        }
    });
}

function validateSoftwareApplication(payload, route) {
    if (payload === true) return;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": "softwareApplication" must be an object (or true to opt in with no fields)`
        );
    }
    if (payload.featureList && !Array.isArray(payload.featureList)) {
        throw new Error(
            `[docusaurus-plugin-structured-data] route "${route}": softwareApplication.featureList must be an array of strings`
        );
    }
}

function validateTechArticleRoutePrefixes(prefixes) {
    if (!Array.isArray(prefixes)) {
        throw new Error(
            `[docusaurus-plugin-structured-data] themeConfig.structuredData.techArticleRoutePrefixes must be an array of strings`
        );
    }
    prefixes.forEach((prefix, i) => {
        if (typeof prefix !== 'string') {
            throw new Error(
                `[docusaurus-plugin-structured-data] techArticleRoutePrefixes[${i}] must be a string, got ${typeof prefix}`
            );
        }
        if (!prefix.startsWith('/') || !prefix.endsWith('/')) {
            throw new Error(
                `[docusaurus-plugin-structured-data] techArticleRoutePrefixes[${i}] (${JSON.stringify(prefix)}) must start and end with "/" (e.g. "/docs/")`
            );
        }
    });
}

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

function buildSoftwareApplicationNode(sa, webPageUrl, webPageTitle) {
    // sa may be `true` (bare opt-in) or an object with fields.
    const fields = sa === true ? {} : sa;
    const node = {
        '@type': 'SoftwareApplication',
        '@id': `${webPageUrl}/#softwareapplication`,
        name: fields.name || webPageTitle,
    };
    if (fields.applicationCategory) node.applicationCategory = fields.applicationCategory;
    if (fields.applicationSubCategory) node.applicationSubCategory = fields.applicationSubCategory;
    if (fields.operatingSystem) node.operatingSystem = fields.operatingSystem;
    if (fields.featureList) node.featureList = fields.featureList;
    if (fields.softwareVersion) node.softwareVersion = fields.softwareVersion;
    if (fields.downloadUrl) node.downloadUrl = fields.downloadUrl;
    if (fields.offers) node.offers = fields.offers;
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

// Strip a trailing slash so frontmatter lookups normalize routes regardless of
// trailingSlash config. Keep "/" intact.
function normalizePermalink(permalink) {
    if (typeof permalink !== 'string' || !permalink) return permalink;
    if (permalink === '/') return permalink;
    return permalink.endsWith('/') ? permalink.slice(0, -1) : permalink;
}

// Walk allContent (the object Docusaurus 3 hands allContentLoaded) and collect
// permalink -> frontmatter for every doc, blog post, and page. Defensive about
// shape so we tolerate plugin instances, multi-version docs, and missing
// branches.
function collectFrontmatter(allContent, verbose) {
    const map = new Map();

    function set(permalink, frontMatter) {
        if (!permalink || !frontMatter) return;
        map.set(normalizePermalink(permalink), frontMatter);
    }

    const docsContent = allContent && allContent['docusaurus-plugin-content-docs'];
    if (docsContent) {
        for (const instance of Object.values(docsContent)) {
            const versions = (instance && instance.loadedVersions) || [];
            for (const version of versions) {
                const docs = (version && version.docs) || [];
                for (const doc of docs) {
                    set(doc.permalink, doc.frontMatter);
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
                if (meta) set(meta.permalink, meta.frontMatter);
            }
        }
    }

    const pagesContent = allContent && allContent['docusaurus-plugin-content-pages'];
    if (pagesContent) {
        for (const instance of Object.values(pagesContent)) {
            const pages = Array.isArray(instance) ? instance : [];
            for (const page of pages) {
                // MDX pages expose frontMatter directly; plain JSX pages have none.
                set(page.permalink, page.frontMatter);
            }
        }
    }

    if (verbose) {
        console.log(`[structured-data] captured frontmatter for ${map.size} routes via allContentLoaded`);
    }
    return map;
}

module.exports = function (context) {
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

    const baseUrl = siteConfig.url;
    const orgName = siteConfig.title;
    const titleDelimiter = siteConfig.titleDelimiter;
    const verbose = structuredData.verbose || false;
    const speakableConfig = structuredData.speakable;
    const speakableEnabledByDefault = speakableConfig === undefined || speakableConfig !== false;
    const defaultSpeakableSpec = speakableEnabledByDefault ? buildSpeakableSpec(speakableConfig) : null;

    // Populated by allContentLoaded, read by postBuild. Same plugin instance
    // sees both hooks via this closure, so no separate state plumbing needed.
    let frontmatterByPermalink = new Map();

    // need to build inverted index as the "name" property is not always populated for blog articles
    verbose ? console.log(`building inverted index for authors...`): null;
    const authorInvIndex = {};
    for (const [key, value] of Object.entries(structuredData.authors)) {
        authorInvIndex[value.url] = key;
    }
    verbose ? console.log(`inverted author index :\n${JSON.stringify(authorInvIndex, null, 2)}`): null;

    const orgData = {
        '@type': 'Organization',
        '@id': `${baseUrl}/#organization`,
        name: `${orgName}`,
        url: `${baseUrl}`,
        ...structuredData.organization,
    };

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
        ...structuredData.website,
    };

    const breadcrumbHomeData = {
        '@type': 'ListItem',
        position: 1,
        item: `${baseUrl}`,
        name: 'Home',
    };

    const breadcrumbDocsData = {
        '@type': 'ListItem',
        position: 2,
        item: `${baseUrl}/docs`,
        name: 'Documentation',
    };

    const breadcrumbBlogData = {
        '@type': 'ListItem',
        position: 2,
        item: `${baseUrl}/blog`,
        name: 'Blog',
    };

    const titleSuffix = ` ${titleDelimiter} ${orgName}`;
    const defaultInLanguage = (structuredData.webpage && structuredData.webpage.inLanguage) || 'en-US';
    const defaultDatePublished = (structuredData.webpage && structuredData.webpage.datePublished) || null;
    const skipRoutes = new Set(['/404.html', '/search']);

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
        return skipRoutes.has(route);
    }

    function isTechArticleRoute(route) {
        return techArticleRoutePrefixes.some((prefix) => route.startsWith(prefix));
    }

    function getBreadcrumbLabel(token){
        if (structuredData.breadcrumbLabelMap.hasOwnProperty(token)){
            return structuredData.breadcrumbLabelMap[token];
        } else {
            return token;
        }
    }

    return {
    name: 'docusaurus-plugin-structured-data',

    // Docusaurus 3 only delivers allContent to allContentLoaded (not
    // contentLoaded). This is where we snapshot frontmatter for every route so
    // postBuild can look it up without re-parsing source files.
    async allContentLoaded({allContent}) {
        frontmatterByPermalink = collectFrontmatter(allContent, verbose);
    },

    async postBuild({siteConfig = {}, routesPaths = [], outDir}) {
        // routesPaths include siteConfig.baseUrl, but the build output tree
        // is rooted at the baseUrl (outDir/route-minus-baseUrl). On sites
        // with a non-root baseUrl the two differ; strip the prefix before
        // resolving files or every route silently misses its HTML.
        const siteBaseUrl = siteConfig.baseUrl || '/';
        routesPaths.map((route) => {

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

            JSDOM.fromFile(filePath).then(dom => {
                verbose ? console.log(`processing route: ${route}...`): null;

                if ((structuredData.excludedRoutes || []).includes(route)){
                    verbose ? console.log(`route: ${route} is excluded`): null;
                    return;
                }

                const doc = dom.window.document;
                const webPageUrl = `${baseUrl}${route}`;
                verbose ? console.log(`webPageUrl: ${webPageUrl}`): null;

                // Look up this route's captured frontmatter (may be undefined
                // for routes the content plugins did not own: redirects, custom
                // JSX pages, plugin-generated routes).
                const frontMatter = frontmatterByPermalink.get(normalizePermalink(route)) || {};

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
                //   route under any configured techArticleRoutePrefix -> TechArticle
                //   else any route with og:type=article -> Article
                // The prefix list defaults to ['/docs/']; landing routes like
                // /docs and /ai (no trailing slash) do not match a "/docs/" or
                // "/ai/" prefix and so stay plain WebPage, preserving the
                // 1.4.x carve-out for free.
                const isTechArticle = isTechArticleRoute(route);
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

                webPageData['@id'] = `${webPageUrl}/#webpage`;
                webPageData['url'] = `${webPageUrl}`;
                webPageData['name'] = webPageTitle;
                webPageData['description'] = webPageDescription;
                webPageData['inLanguage'] = defaultInLanguage;
                webPageData['datePublished'] = defaultDatePublished || new Date().toISOString();
                webPageData['dateModified'] = new Date().toISOString();
                webPageData['breadcrumb'] = {
                    '@id': `${webPageUrl}/#breadcrumb`
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

                let breadcrumbData = {
                    '@type': 'BreadcrumbList',
                    '@id': `${webPageUrl}/#breadcrumb`,
                    itemListElement: [],
                };

                const routeArray = route.split('/')
                    .slice(1, -1)
                    .map((token) => getBreadcrumbLabel(token));

                verbose ? console.log(`route: ${route}, routeArray: ${routeArray}`): null;

                let pageName;
                let elementIndex = 1;

                // add breadcrumb ancestors

                switch (routeArray.length) {
                    case 0:
                        // its the home page or another root level page
                        pageName = `${webPageTitle}`;
                        if (pageName !== 'Home') {
                            breadcrumbData.itemListElement.push(breadcrumbHomeData);
                            elementIndex = 2;
                        }
                        break;
                    case 1:
                        // its a top level leaf page, docs or blog
                        breadcrumbData.itemListElement.push(breadcrumbHomeData);
                        switch (routeArray[0]) {
                            case 'docs':
                                pageName = 'Documentation';
                                elementIndex = 2;
                                break;
                            case 'blog':
                                if (route === '/blog'){
                                    // its the blog index
                                    pageName = 'Blog';
                                    elementIndex = 2;
                                } else {
                                    // its a blog post
                                    breadcrumbData.itemListElement.push(breadcrumbBlogData);
                                    pageName = `${webPageTitle}`;
                                    elementIndex = 3;
                                }
                                break;
                            default:
                                break;
                        }
                        break;
                    default:
                        // its a nested (docs) leaf page
                        breadcrumbData.itemListElement.push(breadcrumbHomeData);
                        switch (routeArray[0]) {
                            case 'docs':
                                breadcrumbData.itemListElement.push(breadcrumbDocsData);
                                break;
                            default:
                                break;
                        }
                        routeArray.forEach((element, index) => {
                            if (['docs'].includes(element)){
                                return;
                            }
                            if (index === 1) {
                                pageName = element;
                            } else {
                                pageName = `${pageName} - ${element}`;
                            }
                        });

                        pageName = `${pageName} - ${webPageTitle}`;
                        elementIndex = 3;
                        break;
                }

                verbose ? console.log(`pageName: ${pageName}, elementIndex: ${elementIndex}`): null;

                // push final element (the current page)
                let leafPageElement = {
                    '@type': 'ListItem',
                    position: elementIndex,
                    name: `${pageName}`,
                }
                breadcrumbData.itemListElement.push(leafPageElement);

                // article / techarticle related structured data
                let articleData;
                let imageObjectData;
                let personData;

                if(isPrimaryArticle){

                    verbose ? console.log(`Adding ${isTechArticle ? 'TechArticle' : 'Article'} data...`): null;

                    // get word count
                    let wordCount = 0;
                    let paragraphs = doc.getElementsByTagName('p');
                    for (let i = 0; i < paragraphs.length; i++) {
                        wordCount += paragraphs[i].textContent.split(' ').length;
                    }

                    const articleType = isTechArticle ? 'TechArticle' : 'Article';
                    const articleSection = isTechArticle ? ['Documentation'] : ['Blog'];
                    const articleDatePublished = articlePublishedTime || webPageData['datePublished'];

                    articleData = {
                        '@type': articleType,
                        '@id': `${webPageUrl}/#article`,
                        isPartOf: {
                            '@type': 'WebPage',
                            '@id': `${webPageUrl}/#webpage`
                        },
                        headline: webPageTitle,
                        datePublished: articleDatePublished,
                        dateModified: articleDatePublished,
                        mainEntityOfPage: {
                            '@id': `${webPageUrl}/#webpage`
                        },
                        wordCount: wordCount,
                        publisher: {
                            '@id': `${baseUrl}/#organization`
                        },
                        image: {
                            '@id': `${webPageUrl}/#primaryimage`
                        },
                        thumbnailUrl: `${webPageImage}`,
                        keywords: articleKeywords,
                        articleSection: articleSection,
                        inLanguage: webPageData.inLanguage,
                    };

                    if (isArticle && articleAuthorName && structuredData.authors[articleAuthorName]) {
                        articleData.author = {
                            name: articleAuthorName,
                            '@id': `${baseUrl}/#/schema/person/${structuredData.authors[articleAuthorName].authorId}`
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
                        '@id': `${webPageUrl}/#primaryimage`,
                        url: `${webPageImage}`,
                        contentUrl: `${webPageImage}`,
                        caption: `${webPageTitle}`,
                        width: structuredData.featuredImageDimensions.width,
                        height: structuredData.featuredImageDimensions.height,
                    };

                    // person data (Article only; TechArticle has no author concept)
                    if (isArticle && articleAuthorName && structuredData.authors[articleAuthorName]) {
                        verbose ? console.log(`Getting person data for ${articleAuthorName}...`): null;

                        personData = {
                            '@type': 'Person',
                            '@id': `${baseUrl}/#/schema/person/${structuredData.authors[articleAuthorName].authorId}`,
                            name: `${articleAuthorName}`,
                            image: {
                                '@type': 'ImageObject',
                                inLanguage: webPageData.inLanguage,
                                '@id': `${baseUrl}/#/schema/person/image/${structuredData.authors[articleAuthorName].authorId}`,
                                url: structuredData.authors[articleAuthorName].imageUrl,
                                contentUrl: structuredData.authors[articleAuthorName].imageUrl,
                                caption: `${articleAuthorName}`,
                                },
                            sameAs: structuredData.authors[articleAuthorName].sameAs,
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
                    faqNode = buildFaqNode(faqPayload, webPageUrl);
                }
                if (howToPayload) {
                    howToNode = buildHowToNode(howToPayload, webPageUrl);
                }
                if (softwareAppPayload && softwareAppPayload !== false) {
                    softwareAppNode = buildSoftwareApplicationNode(softwareAppPayload, webPageUrl, webPageTitle);
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
            });
        });
      },
  };
};
