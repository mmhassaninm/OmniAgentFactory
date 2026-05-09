/**
 * ═══════════════════════════════════════════════════════════════════
 *  NEXUS SEARCH ENGINE — Federated Web Search (Phase 55 / MT3)
 *  Hyper-Evolved from Vibelab's toolController.performWebSearch
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Architecture:
 *    1. Wikipedia API (free, CORS-friendly, primary)
 *    2. DuckDuckGo Instant Answer API (free, CORS-friendly, fallback)
 *    3. Optional: Tavily / Bing / Google (if API keys configured)
 *
 *  5-Speed Depth Control:
 *    Fastest  → 2 results, first engine only, no critic
 *    Fast     → 3 results, first engine only, no critic
 *    Normal   → 5 results, cascade fallback, no critic
 *    Think    → 8 results, parallel queries, no critic
 *    Deep     → 15 results, all engines parallel + AI Critic validation
 */

// ─── Depth Configuration ──────────────────────────────────────────
const DEPTH_CONFIG = {
    'Fastest': { maxResults: 2, parallel: false, multiQuery: false, critic: false, engines: ['wikipedia'] },
    'Fast': { maxResults: 3, parallel: false, multiQuery: false, critic: false, engines: ['wikipedia', 'duckduckgo'] },
    'Normal': { maxResults: 5, parallel: false, multiQuery: false, critic: false, engines: ['wikipedia', 'duckduckgo'] },
    'Think & Search': { maxResults: 8, parallel: true, multiQuery: true, critic: false, engines: ['wikipedia', 'duckduckgo'] },
    'Deep Search': { maxResults: 15, parallel: true, multiQuery: true, critic: true, engines: ['wikipedia', 'duckduckgo'] },
    'Nuclear Search': { maxResults: 25, parallel: true, multiQuery: true, critic: true, engines: ['wikipedia', 'duckduckgo', 'searx'] },
};

// ─── Smart Intent Parser (Platform Reference Resolver) ───────────
// When user mentions a platform like "ريديت" or "يوتيوب", resolve it
const PLATFORM_MAP = {
    'ريديت': 'reddit', 'ردت': 'reddit',
    'يوتيوب': 'youtube', 'تويتر': 'twitter', 'اكس': 'twitter',
    'جيتهاب': 'github', 'لينكدان': 'linkedin',
    'فيسبوك': 'facebook', 'انستجرام': 'instagram',
    'تيك توك': 'tiktok', 'تليجرام': 'telegram',
};

function parseSearchIntent(queryText) {
    let platform = null;
    let cleanedQuery = queryText;
    // Detect Arabic platform names and convert to English
    for (const [arName, enName] of Object.entries(PLATFORM_MAP)) {
        if (queryText.includes(arName)) {
            platform = enName;
            cleanedQuery = cleanedQuery.replace(new RegExp(arName, 'g'), '').trim();
            break;
        }
    }
    // Also detect English platform names
    const enPlatforms = ['reddit', 'youtube', 'github', 'twitter', 'linkedin', 'facebook'];
    if (!platform) {
        for (const p of enPlatforms) {
            if (queryText.toLowerCase().includes(p)) {
                platform = p;
                cleanedQuery = cleanedQuery.replace(new RegExp(p, 'gi'), '').trim();
                break;
            }
        }
    }
    return { platform, cleanedQuery };
}

// ─── Smart Keyword Extractor (NLP Innovation) ────────────────────
// Strips conversational filler and punctuation to create optimized search queries
function extractKeywords(queryText, lang = 'ar') {
    if (!queryText) return '';
    let cleansed = queryText.replace(/[?؟.,!؛،:()"\[\]\\\u060c]/g, ' ');

    if (lang === 'ar' || /[\u0600-\u06FF]/.test(cleansed)) {
        // Phase 1: Strip multi-word conversational filler (MSA + Egyptian + Gulf + Levantine)
        cleansed = cleansed.replace(/\b(لو سمحت|بالله عليك|ممكن تقولي|ممكن تقوللي|عايزك ت|عاوزك ت|مش كده|يعني ايه|زى كده|زي كده)\b/g, ' ');

        // Phase 2: Single-word stop words (comprehensive)
        const arStopWords = new Set([
            // MSA question words & prepositions
            'ما', 'هي', 'هو', 'هل', 'كيف', 'متى', 'أين', 'اين', 'لماذا', 'كم',
            'من', 'إلى', 'الي', 'عن', 'على', 'في', 'الى', 'ذلك', 'هذا', 'هذه',
            // MSA verbs & filler
            'تفاصيل', 'اخر', 'آخر', 'جولة', 'كانت', 'كان', 'ممكن',
            'اريد', 'أريد', 'معرفة', 'ابحث', 'بحث', 'وبين', 'بين',
            'مكانها', 'زمانها', 'تفاصيلها', 'اللي', 'لي',
            // Egyptian Arabic (Masri) — CRITICAL for colloquial queries
            'عايز', 'عايزك', 'عايزه', 'عاوز', 'عاوزك', 'عاوزه',
            'تشوف', 'شوف', 'تشوفلي', 'اشوف',
            'ايه', 'اية', 'ده', 'دي', 'كده', 'كدا', 'زى', 'زي', 'بتاع',
            'دلوقتى', 'دلوقتي', 'اقدر', 'استخدم', 'استخدمها',
            'جهازى', 'جهازي', 'جهاز',
            'يا', 'يعني', 'بقى', 'بردو', 'بس', 'خلاص', 'كمان',
            'علشان', 'عشان', 'مش', 'لسه', 'خلي', 'قولي', 'قوللي',
            'اخبرني', 'أخبرني', 'اديني', 'هاتلي', 'هات',
            'تبحث', 'تشوف', 'تشوفي',
            // Gulf Arabic
            'شنو', 'وش', 'ترا', 'ابي', 'ابغى', 'ويش',
        ]);

        return cleansed.split(/\s+/)
            .map(word => {
                // Strip common prefixes (wa, fa, bi, lil, al)
                let w = word.replace(/^(وال|بال|فال|و|ف|ب|لل|ال)/, '');
                // Strip common suffixes (her/him/them/you)
                w = w.replace(/(ها|هم|هما|كم|كن|ني|نا)$/, '');
                return w;
            })
            .filter(word => word.length > 2 && !arStopWords.has(word))
            .join(' ')
            .trim();
    }

    // Basic English stop words (removed 'latest', 'news' as they are intent-driven)
    const enStopWords = new Set(['what', 'is', 'the', 'how', 'when', 'where', 'why', 'who', 'tell', 'me', 'about', 'find', 'search', 'for', 'are', 'was', 'were', 'details']);
    return cleansed.toLowerCase().split(/\s+/)
        .filter(word => word.length > 2 && !enStopWords.has(word))
        .join(' ')
        .trim();
}

// ─── Wikipedia Search Engine ──────────────────────────────────────
async function searchWikipedia(query, limit = 5, lang = 'en') {
    const wikiLang = /[\u0600-\u06FF]/.test(query) ? 'ar' : lang;
    const url = `https://${wikiLang}.wikipedia.org/w/api.php?` + new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: query,
        srlimit: String(limit),
        utf8: '1',
        format: 'json',
        origin: '*',
    });

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
        const data = await res.json();
        return (data.query?.search || []).map(item => ({
            title: item.title,
            snippet: item.snippet.replace(/<[^>]+>/g, '').trim(),
            url: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            source: 'Wikipedia',
        }));
    } catch (err) {
        console.warn('[NexusSearch] Wikipedia failed:', err.message);
        return [];
    }
}

// ─── DuckDuckGo + SearXNG Multi-Strategy Search Engine ─────────────
// ─── DuckDuckGo + Proxied HTML Scraper + SearXNG ─────────────
async function searchDuckDuckGo(query, limit = 5) {
    const results = [];
    const seenUrls = new Set();
    // Strategy 1: DDG Instant Answer API (definitions/abstracts)
    const instantUrl = `https://api.duckduckgo.com/?` + new URLSearchParams({
        q: query, format: 'json', no_html: '1', skip_disambig: '1', t: 'NexusOS',
    });

    try {
        const res = await fetch(instantUrl, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
            const data = await res.json();
            const results = [];
            if (data.Abstract && data.AbstractText) {
                const url = data.AbstractURL || `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
                if (!seenUrls.has(url)) {
                    seenUrls.add(url);
                    results.push({
                        title: data.Heading || query,
                        snippet: data.AbstractText.substring(0, 500),
                        url: url,
                        source: 'DuckDuckGo Instant',
                    });
                }
            }
            if (data.RelatedTopics) {
                for (const topic of data.RelatedTopics) {
                    if (results.length >= limit) break;
                    if (topic.Text && topic.FirstURL && !seenUrls.has(topic.FirstURL)) {
                        seenUrls.add(topic.FirstURL);
                        results.push({
                            title: topic.Text.split(' - ')[0]?.substring(0, 100) || query,
                            snippet: topic.Text.substring(0, 400),
                            url: topic.FirstURL,
                            source: 'DuckDuckGo Instant',
                        });
                    }
                }
            }
        }
    } catch (err) {
        console.warn('[NexusSearch] DDG Instant API failed:', err.message);
    }

    // Strategy 1.5: DuckDuckGo HTML Scraper via Native Node Fetch (Bypasses CORS entirely in Electron)
    try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        let html = '';

        if (typeof window !== 'undefined' && window.nexusAPI) {
            const res = await window.nexusAPI.invoke('search:fetchHtml', ddgUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) NexusOS/5.0' }
            });
            if (res && res.ok && res.text) html = res.text;
        } else {
            // Fallback for standard browser testing
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(ddgUrl)}`;
            const res = await fetch(proxyUrl, { method: 'POST', body: new URLSearchParams({ q: query }) });
            if (res.ok) html = await res.text();
        }

        if (html) {
            const regex = /<a class="result__url" href="([^"]+)".*?<a class="result__a[^>]*>(.*?)<\/a>.*?<a class="result__snippet[^>]+>(.*?)<\/a>/gis;
            const matches = [...html.matchAll(regex)];

            for (const match of matches) {
                if (results.length >= limit) break;

                let currentUrl = match[1];
                let title = match[2].replace(/<\/?[^>]+(>|$)/g, "").trim(); // Strip HTML tags
                let snippet = match[3].replace(/<\/?[^>]+(>|$)/g, "").trim();

                if (currentUrl?.startsWith('//duckduckgo.com/l/?uddg=')) {
                    currentUrl = decodeURIComponent(currentUrl.split('uddg=')[1].split('&')[0]);
                } else if (currentUrl?.startsWith('/')) {
                    currentUrl = 'https://duckduckgo.com' + currentUrl;
                }

                if (currentUrl && !seenUrls.has(currentUrl)) {
                    seenUrls.add(currentUrl);
                    results.push({
                        title: title || query,
                        snippet: snippet,
                        url: currentUrl,
                        source: 'DuckDuckGo Web'
                    });
                }
            }
        }
    } catch (err) {
        console.warn('[NexusSearch] DDG Native Scraper failed:', err.message);
    }

    if (results.length >= Math.max(3, limit)) return results;

    // Strategy 2: SearXNG public meta-search instances (real web results)
    const searxInstances = [
        'https://searx.be',
        'https://search.bus-hit.me',
        'https://search.sapti.me',
        'https://paulgo.io',
        'https://searx.tiekoetter.com',
        'https://search.mdosch.de',
        'https://suche.uferwerk.org'
    ].sort(() => Math.random() - 0.5); // Randomize to bypass rate limits

    for (const instance of searxInstances) {
        try {
            const searxUrl = `${instance}/search?` + new URLSearchParams({
                q: query, format: 'json', categories: 'general', language: 'en',
            });
            const res = await fetch(searxUrl, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) continue;
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                console.log(`[NexusSearch] SearXNG (${instance}) returned ${data.results.length} results`);
                for (const r of data.results) {
                    const url = r.url;
                    if (!seenUrls.has(url)) {
                        seenUrls.add(url);
                        results.push({
                            title: r.title || query,
                            snippet: (r.content || r.description || '').substring(0, 400),
                            url: url,
                            source: 'SearXNG',
                        });
                    }
                    if (results.length >= limit) break;
                }
            }
            if (results.length >= limit) break;
        } catch { continue; }
    }

    return results;
}

// ─── Direct URL Scraper (Extract Webpages On-the-Fly) ──────────────
async function scrapeDirectUrl(url) {
    console.log(`[NexusSearch] Direct URL scraping initiated for: ${url}`);
    try {
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let html = await res.text();
        // Naive text extraction
        const cleanText = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<\/?[^>]+(>|$)/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (cleanText.length > 100) {
            return [{
                title: `Direct Extraction: ${url}`,
                snippet: cleanText.substring(0, 5000), // Feed a massive chunk for LLM analysis
                url: url,
                source: 'URL Auto-Scraper'
            }];
        }
    } catch (err) {
        console.warn(`[NexusSearch] URL Scrape failed for ${url}:`, err.message);
    }
    return [];
}

// ─── Deduplication Engine ─────────────────────────────────────────
function deduplicateResults(results) {
    const seen = new Set();
    return results.filter(r => {
        const key = r.snippet.substring(0, 60).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Smart Context Mapper ─────────────────────────────────────────
// Converts raw results into a clean context string for the LLM prompt
function mapResultsToContext(results, maxCitations = 7) {
    if (!results || results.length === 0) return null;

    let context = '[SEARCH CONTEXT]:\n';
    results.forEach(r => {
        context += `Source: [${r.title}]\nInfo: ${r.snippet}\n---\n`;
    });

    const citationsCount = Math.min(results.length, maxCitations);
    const citations = results.slice(0, citationsCount)
        .map(r => `- [${r.title}](${r.url})`)
        .join('\n');
    context += `\nالمصادر:\n${citations}`;

    return context;
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN SEARCH FUNCTION — Federated Multi-Engine Search
// ═══════════════════════════════════════════════════════════════════

/**
 * Perform a federated web search across multiple engines.
 *
 * @param {string|string[]} queries  - The search query or array of queries
 * @param {string}          depth    - One of: 'Fastest', 'Fast', 'Normal', 'Think & Search', 'Deep Search'
 * @param {string}          lang     - Language hint ('en' | 'ar')
 * @returns {Promise<{results: Array, context: string|null, duration: number}>}
 */
export async function performSearch(queries, depth = 'Normal', lang = 'en') {
    const startTime = performance.now();
    const config = DEPTH_CONFIG[depth] || DEPTH_CONFIG['Normal'];
    const queryArray = Array.isArray(queries) ? queries : [queries];

    console.log(`[NexusSearch] Engaging (Depth: ${depth}) for: ${JSON.stringify(queryArray)}`);

    let allResults = [];

    if (config.parallel) {
        // ── Parallel: fire all engines + all queries simultaneously ──
        const promises = [];
        for (const rawQ of queryArray) {
            const optimizedQ = extractKeywords(rawQ, lang) || rawQ;
            console.log(`[NexusSearch] Extracted Keyword: "${optimizedQ}" (from: "${rawQ}")`);

            if (config.engines.includes('wikipedia')) {
                promises.push(searchWikipedia(optimizedQ, config.maxResults, lang));
            }
            if (config.engines.includes('duckduckgo')) {
                promises.push(searchDuckDuckGo(optimizedQ, config.maxResults));
            }
        }
        const settled = await Promise.allSettled(promises);
        for (const result of settled) {
            if (result.status === 'fulfilled') {
                allResults.push(...result.value);
            }
        }
    } else {
        // ── Sequential/Cascade: first engine with results wins ──
        for (const rawQ of queryArray) {
            const optimizedQ = extractKeywords(rawQ, lang) || rawQ;
            console.log(`[NexusSearch] Extracted Keyword: "${optimizedQ}" (from: "${rawQ}")`);

            for (const engine of config.engines) {
                let results = [];
                if (engine === 'wikipedia') {
                    results = await searchWikipedia(optimizedQ, config.maxResults, lang);
                } else if (engine === 'duckduckgo') {
                    results = await searchDuckDuckGo(optimizedQ, config.maxResults);
                }
                if (results.length > 0) {
                    allResults.push(...results);
                    if (!config.parallel) break; // Stop at first successful engine
                }
            }
        }
    }

    // ── Direct URL Detection ──
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = queries.match(urlRegex) || [];
    if (urls.length > 0) {
        console.log(`[NexusSearch] Detected URLs in query. Engaging Direct Scraper.`);
        for (const url of urls) {
            const scraped = await scrapeDirectUrl(url);
            if (scraped.length > 0) {
                allResults.unshift(...scraped); // Prioritize direct scrapes
            }
        }
    }

    // ── Dual-Language Fallback + Smart Intent ──
    // If Arabic search returned 0 results, use intent parser + English fallback
    if (allResults.length === 0) {
        for (const rawQ of queryArray) {
            // Parse intent to find platform references (ريديت→reddit)
            const { platform, cleanedQuery } = parseSearchIntent(rawQ);
            const englishWords = rawQ.match(/[a-zA-Z]{2,}/g);
            const arabicKeywords = extractKeywords(cleanedQuery || rawQ, 'ar');

            // Build an optimized English search query
            let enSearchTerms = [];
            if (englishWords && englishWords.length > 0) enSearchTerms.push(...englishWords);
            if (platform) enSearchTerms.push(platform);
            // Add Arabic keywords that might have English meaning
            if (arabicKeywords) {
                const arToEn = arabicKeywords.replace(/[^\u0600-\u06FF\s]/g, '').trim();
                // If we have no English terms at all, try arabicKeywords on English Wikipedia
                if (enSearchTerms.length === 0 && arToEn) enSearchTerms.push(arToEn);
            }

            if (enSearchTerms.length > 0) {
                const enQuery = enSearchTerms.join(' ').trim();
                console.log(`[NexusSearch] Dual-Language Fallback (EN): "${enQuery}"${platform ? ` [Platform: ${platform}]` : ''}`);
                const enResults = await searchWikipedia(enQuery, config.maxResults, 'en');
                if (enResults.length > 0) allResults.push(...enResults);
                // Also try DuckDuckGo/SearXNG with the English query
                if (allResults.length === 0) {
                    const ddgResults = await searchDuckDuckGo(enQuery, config.maxResults);
                    if (ddgResults.length > 0) allResults.push(...ddgResults);
                }
            }

            // If still 0, try the Arabic keywords on English Wikipedia
            if (allResults.length === 0 && arabicKeywords) {
                console.log(`[NexusSearch] Dual-Language Fallback (AR→EN Wiki): "${arabicKeywords}"`);
                const arEnResults = await searchWikipedia(arabicKeywords, config.maxResults, 'en');
                if (arEnResults.length > 0) allResults.push(...arEnResults);
            }
        }
    }

    // Deduplicate
    allResults = deduplicateResults(allResults);

    // Cap to depth limit
    allResults = allResults.slice(0, config.maxResults);

    const duration = Math.round(performance.now() - startTime);
    const maxCitations = depth === 'Deep Search' ? 12 : (depth === 'Think & Search' ? 8 : 6);
    const context = allResults.length > 0 ? mapResultsToContext(allResults, maxCitations) : null;

    console.log(`[NexusSearch] Found ${allResults.length} results in ${duration}ms`);

    return {
        results: allResults,
        context,
        duration,
        depth,
        noData: allResults.length === 0,
    };
}

// ─── Export Default ───────────────────────────────────────────────
const searchEngine = { performSearch };
export default searchEngine;
