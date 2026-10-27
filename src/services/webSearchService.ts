import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { SearchOverview, SearchResult } from '../types.ts';
import { resolveSearchOptions, type SearchOptions } from './searchOptions.ts';
import { serverFetch } from './serverTransport.ts';
import { fetchWikipediaSummary } from './wikipediaService.ts';
import { classifySearchResponse } from './searchProviderResponse.ts';
import { hasKnownSiteMatch, searchKnownSites } from './knownSiteSearch.ts';
import { canonicalResultUrl, rankProviderResults, rankResults, resultDomain } from './searchRanking.ts';
export { canonicalResultUrl, rankResults } from './searchRanking.ts';
import { parseProviderSpellingCorrection } from './searchSpellingCorrection.ts';

const PAGE_SIZE = 10;
const PROVIDER_TIMEOUT_MS = 3400;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type ProviderName = 'duckduckgo' | 'duckduckgo-lite' | 'bing' | 'seznam' | 'bing-rss' | 'brave' | 'known-sites';
export interface ProviderResult { source: ProviderName; results: SearchResult[]; correctedQuery?: string; offset?: number }
export interface WebSearchResponse {
  results: SearchResult[];
  overview: SearchOverview | null;
  hasMore: boolean;
  elapsedMs: number;
  sources: string[];
  degraded: boolean;
  correctedQuery?: string;
}
type SearchFetch = typeof serverFetch;
interface SearchDependencies { fetch?: SearchFetch; overview?: typeof fetchWikipediaSummary }

export function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}


function makeResult(title: string, href: string, snippet: string, source: ProviderName): SearchResult | null {
  const url = canonicalResultUrl(href, source.startsWith('duckduckgo') ? 'https://duckduckgo.com' : 'https://www.bing.com');
  const cleanTitle = title.replace(/\s+/g, ' ').trim();
  if (!url || !cleanTitle) return null;
  const hostname = new URL(url).hostname.replace(/^www\./, '');
  return {
    id: `web-${createHash('sha256').update(url).digest('hex').slice(0, 16)}`,
    title: cleanTitle, url,
    displayUrl: hostname + new URL(url).pathname.replace(/\/$/, ''),
    snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, 650),
    siteName: hostname,
  };
}

export function parseDuckDuckGo(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $('.result').each((_, element) => {
    const node = $(element);
    if (node.is('.result--ad') || node.find('.result__badge, .result__ad').length) return;
    const link = node.find('a.result__a').first();
    const result = makeResult(link.text(), link.attr('href') || '', node.find('.result__snippet').text(), 'duckduckgo');
    if (result) results.push(result);
  });
  return results;
}

export function parseDuckDuckGoLite(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  $('a.result-link').each((_, element) => {
    const link = $(element);
    const row = link.closest('tr');
    const related = row.nextUntil('tr:has(a.result-link)');
    if (row.is('.result--ad, .ad') || row.add(related).find('.ad-label, .result__badge, [data-ad], .result-sponsored').length) return;
    const snippet = related.find('.result-snippet').first().text();
    const result = makeResult(link.text(), link.attr('href') || '', snippet, 'duckduckgo-lite');
    if (result) results.push(result);
  });
  return results;
}

export function parseBingRss(xml: string): SearchResult[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $('item').map((_, element) => {
    const node = $(element);
    return makeResult(node.find('title').text(), node.find('link').text(), node.find('description').text().replace(/<[^>]+>/g, ''), 'bing-rss');
  }).get().filter(Boolean);
}

export function parseBingHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  return $('#b_results > li.b_algo').map((_, element) => {
    const node = $(element);
    const adMarker = '.b_ad, .b_adlabel, [data-tag="ad"]';
    if (node.is(adMarker) || node.find(adMarker).length) return null;
    const link = node.find('h2 a').first();
    return makeResult(link.text(), link.attr('href') || '', node.find('.b_caption p, .b_snippet').first().text(), 'bing');
  }).get().filter(Boolean);
}

export function parseSeznam(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const adFamilies = new Set<string>();
  const moduleScopes = new Set<object>();
  const relatedHeading = /^(?:lide take hledaji|souvisejici (?:dotazy|vyhledavani|hledani))$/;
  $('h3').each((_, element) => {
    const heading = $(element);
    const headingText = normalizeText(heading.text()).replace(/\s+/g, ' ').trim();
    if (/^(sponzorovane vysledky|sponsored results|reklama)$/.test(headingText)) {
      const family = heading.closest('[data-e-b-n]').attr('data-e-b-n')?.split('~')[0];
      if (family) adFamilies.add(family);
    }
    // Vertical carousels contain their own h3 cards. Their heading links to a
    // Seznam category, so those cards must not masquerade as organic web rows.
    const verticalHeading = /^(?:videa|obrazky|zpravy|novinky)(?:\s*[›»:]\s*.+)?$/.test(headingText)
      && heading.find('a[href]').toArray().some(link => {
        try {
          const target = new URL($(link).attr('href') || '', 'https://search.seznam.cz/');
          return target.hostname === 'search.seznam.cz' && /^\/(?:videa|obrazky|zpravy)\/?$/.test(target.pathname);
        } catch { return false; }
      });
    if (!verticalHeading && !relatedHeading.test(headingText)) return;
    const scope = heading.closest('[data-e-b-n], section, article, [role="region"]');
    // Only a bounded module beginning with this heading is safe to exclude.
    // Never promote a page-wide wrapper into an exclusion scope.
    if (scope.length && scope.find('h3').first().get(0) === element) moduleScopes.add(scope.get(0)!);
  });
  $('h3').each((_, element) => {
    const heading = $(element);
    if (heading.parents().toArray().some(parent => moduleScopes.has(parent))) return;
    // Correction and related-query widgets are navigation, not organic pages.
    const headingText = normalizeText(heading.text()).trim();
    if (relatedHeading.test(headingText)
      || (heading.find('a[data-e-a="accept"]').length && /^hledali jsme\b/.test(headingText))) return;
    const family = heading.closest('[data-e-b-n]').attr('data-e-b-n')?.split('~')[0];
    if (family && adFamilies.has(family)) return;
    // Class names on the live page are generated. Stop at the smallest complete
    // result, and never let another result or a page-wide ad label into its scope.
    let context = heading.parent();
    for (let depth = 0; depth < 4; depth++) {
      if (context.text().trim() !== heading.text().trim()) break;
      const parent = context.parent();
      if (!parent.length || parent.find('h3').length > 1) break;
      context = parent;
    }
    const adMarker = '[data-dot="ad"], .c-ad, .advert, [data-sponsored="true"]';
    if (context.is(adMarker) || context.find(adMarker).length) return;
    const isAdLabel = (value: string) => /^(reklama|sponzorovany|sponzorovane|sponzorovana|sponsored|advertisement|ad)$/.test(normalizeText(value).replace(/[^\p{L}\s]/gu, '').trim());
    const labels = context.find('span, small, label').toArray().some(label => !$(label).closest('h3, a, p').length && isAdLabel($(label).text()));
    const ownLabel = context.contents().toArray().some(node => node.type === 'text' && isAdLabel($(node).text()));
    if (labels || ownLabel) return;
    const link = heading.find('a').first().length ? heading.find('a').first() : heading.closest('a');
    const snippet = context.find('p, .c-result__snippet, [data-e-b-n] span').filter((_, node) => !$(node).closest('h3, a').length).first().text()
      || context.clone().find('h3, a, ul, .fcb1d4').remove().end().text().trim();
    const result = makeResult(heading.text(), link.attr('href') || '', snippet, 'seznam');
    if (result) results.push(result);
  });
  return results;
}


interface Source { source: ProviderName; url: URL; parse: (body: string) => SearchResult[] }
function sourceUrls(query: string, options: SearchOptions): Source[] {
  const ddg = new URL('https://html.duckduckgo.com/html/');
  ddg.searchParams.set('q', query);
  ddg.searchParams.set('kp', options.safeSearch ? '1' : '-2');
  ddg.searchParams.set('kl', { sk: 'sk-sk', cz: 'cz-cz', eu: 'uk-en', global: 'wt-wt' }[options.region]);
  if (options.timeFilter !== 'anytime') ddg.searchParams.set('df', { day: 'd', week: 'w', month: 'm' }[options.timeFilter]);
  const ddgLite = new URL('https://lite.duckduckgo.com/lite/');
  ddgLite.search = ddg.search;
  const bing = new URL('https://www.bing.com/search');
  bing.searchParams.set('q', query);
  bing.searchParams.set('count', '30');
  bing.searchParams.set('adlt', options.safeSearch ? 'strict' : 'off');
  bing.searchParams.set('setlang', options.region === 'cz' ? 'cs' : options.region === 'global' ? 'en' : 'sk');
  if (options.region !== 'global') bing.searchParams.set('cc', options.region === 'eu' ? 'GB' : options.region.toUpperCase());
  if (options.timeFilter !== 'anytime') bing.searchParams.set('filters', `ex1:"${{ day: 'ez1', week: 'ez2', month: 'ez3' }[options.timeFilter]}"`);
  const rss = new URL(bing);
  rss.searchParams.set('format', 'rss');
  const seznam = new URL('https://search.seznam.cz/');
  seznam.searchParams.set('q', query);
  seznam.searchParams.set('safe', options.safeSearch ? 'yes' : 'no');
  const providers: Source[] = [
    { source: 'duckduckgo', url: ddg, parse: parseDuckDuckGo },
    { source: 'duckduckgo-lite', url: ddgLite, parse: parseDuckDuckGoLite },
    { source: 'bing', url: bing, parse: parseBingHtml },
    { source: 'bing-rss', url: rss, parse: parseBingRss },
  ];
  // Exclude sources that cannot honor the selected time/region.
  if (options.timeFilter === 'anytime') providers.push({ source: 'seznam', url: seznam, parse: parseSeznam });
  return providers;
}

async function fetchBrave(query: string, options: SearchOptions, fetcher: SearchFetch): Promise<ProviderResult> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', '20');
  url.searchParams.set('safesearch', options.safeSearch ? 'strict' : 'off');
  url.searchParams.set('country', options.region === 'global' || options.region === 'eu' ? 'ALL' : options.region.toUpperCase());
  url.searchParams.set('search_lang', options.region === 'cz' ? 'cs' : options.region === 'sk' ? 'sk' : 'en');
  if (options.timeFilter !== 'anytime') url.searchParams.set('freshness', { day: 'pd', week: 'pw', month: 'pm' }[options.timeFilter]);
  const response = await fetcher(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY || '' }, timeoutMs: PROVIDER_TIMEOUT_MS, maxBytes: 2_000_000, signal: options.signal });
  if (!response.ok) throw new Error('Search provider unavailable');
  const data = await response.json();
  const results = (data.web?.results || []).map((item: any) => makeResult(item.title || '', item.url || '', item.description || '', 'brave')).filter(Boolean);
  return { source: 'brave', results };
}

export async function searchWeb(query: string, page = 1, partialOptions: Partial<SearchOptions> = {}, dependencies: SearchDependencies = {}): Promise<WebSearchResponse> {
  const started = performance.now();
  const options = resolveSearchOptions(partialOptions);
  const fetcher = dependencies.fetch || serverFetch;
  const overviewFetcher = dependencies.overview || fetchWikipediaSummary;
  if (!query.trim()) return { results: [], overview: null, hasMore: false, elapsedMs: 0, sources: [], degraded: false };
  const overviewPromise = page === 1 && options.timeFilter === 'anytime' ? overviewFetcher(query, options).catch(() => null) : Promise.resolve(null);
  const providers = sourceUrls(query, options);
  const fetchProvider = async (provider: Source, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<ProviderResult> => {
    const response = await fetcher(provider.url, {
      headers: { 'User-Agent': USER_AGENT, Accept: provider.source === 'bing-rss' ? 'application/rss+xml,application/xml,text/xml' : 'text/html', 'Accept-Language': options.region === 'cz' ? 'cs-CZ,cs;q=0.9,en;q=0.8' : options.region === 'sk' ? 'sk-SK,sk;q=0.9,cs;q=0.8,en;q=0.7' : 'en-US,en;q=0.9' },
      timeoutMs, maxBytes: 3_000_000, signal: options.signal,
    });
    if (!response.ok) throw new Error('Search provider unavailable');
    const body = await response.text();
    const results = provider.parse(body);
    if (classifySearchResponse(provider.source, body, results.length) === 'unavailable') throw new Error('Search provider unavailable');
    return { source: provider.source, results, correctedQuery: parseProviderSpellingCorrection(provider.source, body, query), offset: Number(provider.url.searchParams.get('from') || 0) };
  };
  const requests = providers.map(provider => fetchProvider(provider));
  if (process.env.BRAVE_SEARCH_API_KEY) requests.push(fetchBrave(query, options, fetcher));
  if (options.timeFilter === 'anytime' && hasKnownSiteMatch(query)) requests.push(searchKnownSites(query, options, fetcher).then(results => {
    if (!results.length) throw new Error('Known site unavailable');
    return { source: 'known-sites' as const, results };
  }));
  const settled = await Promise.allSettled(requests);
  if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
  const successful = settled.filter((item): item is PromiseFulfilledResult<ProviderResult> => item.status === 'fulfilled').map(item => item.value);
  // One bounded retry recovers a transient failure of the independent fallback.
  // A genuine empty response is not retried, and selected time filters stay intact.
  const fallbackIndex = providers.findIndex(provider => provider.source === 'seznam');
  const fallbackFailure = fallbackIndex >= 0 ? settled[fallbackIndex] : undefined;
  if (!rankResults(successful, query).length && fallbackFailure?.status === 'rejected' && fallbackFailure.reason?.status !== 503) {
    try { successful.push(await fetchProvider(providers[fallbackIndex], 1800)); } catch { /* Report unavailable sources below. */ }
  }
  if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
  if (!successful.length) {
    const configurationError = settled.find(item => item.status === 'rejected' && item.reason?.status === 503) as PromiseRejectedResult | undefined;
    if (configurationError) throw configurationError.reason;
    throw Object.assign(new Error('Vyhľadávacie zdroje sú dočasne nedostupné. Skúste to znova.'), { status: 502 });
  }
  // Some providers put only a few organic links on their opening page. Retrieve
  // further real result pages for the same query instead of weakening relevance.
  // Two bounded parallel batches also let dense single-host pages gain variety.
  const degraded = successful.length < requests.length;
  const firstFallback = successful.find(source => source.source === 'seznam' && source.results.length);
  const explicitSite = /(?:^|\s)-?site:|^(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(query);
  // Use the same retrieval plan for every page: a new, higher-scoring candidate
  // discovered only on page two would otherwise shift pagination and repeat rows.
  const targetCount = PAGE_SIZE + 1;
  const needsMore = () => {
    const rows = rankResults(successful, query);
    const hosts = new Set(rows.slice(0, PAGE_SIZE).map(row => resultDomain(new URL(row.url).hostname)));
    return rows.length < targetCount || (!explicitSite && hosts.size < 5);
  };
  let supplementalFailure = false;
  // A recovered opening page can still be sparse. Its successful retry gets
  // the same bounded fill as an immediate success; genuine empty pages do not.
  if (firstFallback) {
    for (let offset = 10; offset <= 30 && needsMore(); offset += 20) {
      const extra = await Promise.allSettled([offset, offset + 10].map(from => {
        const provider = providers[fallbackIndex];
        const url = new URL(provider.url);
        url.searchParams.set('from', String(from));
        return fetchProvider({ ...provider, url }, 1800);
      }));
      if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
      for (const response of extra) {
        if (response.status === 'fulfilled') successful.push(response.value);
        else supplementalFailure = true;
      }
      if (extra.every(response => response.status === 'rejected' || response.value.results.length === 0)) break;
    }
  }
  const ranked = rankProviderResults(successful, query);
  const start = (page - 1) * PAGE_SIZE;
  const selected = ranked.slice(start, start + PAGE_SIZE);
  const results = selected.map(item => item.result);
  const correctedQuery = selected[0]?.correctedQuery;
  const overview = await overviewPromise;
  return {
    results, overview: correctedQuery ? null : overview,
    hasMore: ranked.length > start + PAGE_SIZE, elapsedMs: Math.round(performance.now() - started),
    sources: [...new Set(successful.filter(source => source.results.length).map(source => source.source))],
    degraded: degraded || supplementalFailure,
    ...(correctedQuery ? { correctedQuery } : {}),
  };
}
