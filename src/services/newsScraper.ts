import * as cheerio from 'cheerio';
import type { TrendingNewsItem } from '../types.ts';
import type { SearchOptions } from './searchOptions.ts';
import { getNetworkStatus, serverFetch } from './serverTransport.ts';

const defaults: SearchOptions = { safeSearch: true, region: 'sk', timeFilter: 'anytime' };
const locales = { sk: { hl: 'sk', gl: 'SK', ceid: 'SK:sk' }, cz: { hl: 'cs', gl: 'CZ', ceid: 'CZ:cs' }, eu: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' }, global: { hl: 'en-US', gl: 'US', ceid: 'US:en' } };
const worldFeeds = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC News' },
  { url: 'https://www.theguardian.com/world/rss', source: 'The Guardian' },
] as const;

function webUrl(value: string): string | undefined {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

function cleanHtml(value: string): string {
  return cheerio.load(value).text().replace(/\s+/g, ' ').trim();
}

function feedImage(item: ReturnType<cheerio.CheerioAPI>): string | undefined {
  const largestFirst = (selector: string) => item.find(selector).toArray().sort((left, right) => (Number(right.attribs?.width) || 0) - (Number(left.attribs?.width) || 0));
  const candidates = [
    ...largestFirst('media\\:thumbnail').map((element) => element.attribs?.url),
    ...largestFirst('media\\:content').filter((element) => (!element.attribs?.type || element.attribs.type.startsWith('image/')) && (!element.attribs?.medium || element.attribs.medium === 'image')).map((element) => element.attribs?.url),
    ...item.find('enclosure[type^="image/"]').toArray().map((element) => element.attribs?.url),
    item.find('image\\:image image\\:url').first().text().trim(),
  ];
  for (const candidate of candidates) {
    const url = candidate && webUrl(candidate.trim());
    if (url && new URL(url).protocol === 'https:') return url;
  }
  return undefined;
}

function parseFeed(xml: string, query: string, fallbackSource: string, options: SearchOptions): TrendingNewsItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const results: TrendingNewsItem[] = [];
  const seen = new Set<string>();
  $('item').each((_, element) => {
    const item = $(element);
    const rawTitle = item.find('title').first().text().trim();
    const url = webUrl(item.find('link').first().text().trim());
    if (!rawTitle || !url || seen.has(url)) return;
    const date = item.find('pubDate').first().text().trim();
    const timestamp = Date.parse(date);
    const days = { day: 1, week: 7, month: 30 }[options.timeFilter];
    if (days && (!Number.isFinite(timestamp) || timestamp < Date.now() - days * 86_400_000)) return;
    // Google appends a publisher to titles. Publisher-owned feeds do not.
    const separator = fallbackSource === 'Google News' ? rawTitle.lastIndexOf(' - ') : -1;
    const title = separator > 0 ? rawTitle.slice(0, separator) : rawTitle;
    const source = item.find('source').first().text().trim() || (separator > 0 ? rawTitle.slice(separator + 3) : fallbackSource);
    const description = item.find('description').first().text();
    seen.add(url);
    results.push({ id: `news-${results.length}`, query: query || title, title, snippet: cleanHtml(description) || title, url, source, imageUrl: feedImage(item), publishedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined });
  });
  return results.slice(0, 15);
}

async function readFeed(url: URL, query: string, options: SearchOptions, source = 'Google News', timeoutMs = 6000): Promise<TrendingNewsItem[]> {
  options.signal?.throwIfAborted();
  const response = await serverFetch(url, { signal: options.signal, timeoutMs, maxBytes: 2 * 1024 * 1024, headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'BakyOne/1.0' } });
  if (!response.ok) throw Object.assign(new Error('News provider is unavailable'), { status: getNetworkStatus().configured ? 502 : 503 });
  return parseFeed(await response.text(), query, source, options);
}

/** Google News RSS does not expose a guaranteed SafeSearch filter. No query logs or caches. */
export async function scrapeNewsForQuery(query: string, options: SearchOptions = defaults): Promise<TrendingNewsItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL('https://news.google.com/rss/search');
  const age = { day: '1d', week: '7d', month: '30d' }[options.timeFilter];
  url.search = new URLSearchParams({ q: age ? `${trimmed} when:${age}` : trimmed, ...locales[options.region] }).toString();
  return readFeed(url, trimmed, options);
}

/** This endpoint intentionally supports only the unfiltered general-news category. */
export async function scrapeTrendingNews(category = 'trending', options: SearchOptions = defaults): Promise<TrendingNewsItem[]> {
  if (!['trending', 'all'].includes(category)) throw Object.assign(new Error('Unsupported news category'), { status: 400 });
  // Fixed, publisher-owned feeds supply actual headlines and photographs.
  // Fetch them in parallel; no individual article pages or arbitrary URLs.
  const deadline = AbortSignal.timeout(6000);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  const boundedOptions = { ...options, signal };
  signal.throwIfAborted();
  const feeds = options.region === 'sk'
    ? [...worldFeeds, { url: 'https://www.aktuality.sk/rss/', source: 'Aktuality.sk' }]
    : worldFeeds;
  const batches = await Promise.allSettled(feeds.map(({ url, source }) => readFeed(new URL(url), '', boundedOptions, source, 3500)));
  signal.throwIfAborted();
  const available = batches.flatMap((batch) => batch.status === 'fulfilled' && batch.value.length ? [batch.value] : []);
  const results: TrendingNewsItem[] = [];
  const seen = new Set<string>();
  // One story per publisher per round keeps the visible cards balanced even
  // when one publisher provides a much longer feed than the others.
  for (let index = 0; index < 15 && results.length < 15; index++) {
    for (const batch of available) {
      const item = batch[index];
      if (!item || seen.has(item.url) || results.length >= 15) continue;
      seen.add(item.url);
      results.push({ ...item, id: `news-${results.length}` });
    }
  }
  if (results.length) return results;
  // Only if every publisher failed or was empty, use the localized fallback
  // through the same configured transport and original overall deadline.
  signal.throwIfAborted();
  const url = new URL('https://news.google.com/rss');
  url.search = new URLSearchParams(locales[options.region] || locales.sk).toString();
  return readFeed(url, '', boundedOptions, 'Google News', 2500);
}
