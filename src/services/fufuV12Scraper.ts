import * as cheerio from 'cheerio';
import type { SearchResult, YouTubeVideoItem } from '../types.ts';
import type { SearchOptions } from './searchOptions.ts';
import { getNetworkStatus, serverFetch } from './serverTransport.ts';

const defaults: SearchOptions = { safeSearch: true, region: 'sk', timeFilter: 'anytime' };
const userAgent = 'Mozilla/5.0 (compatible; BakyOne/1.0)';
const markets = { sk: { hl: 'sk', gl: 'SK', market: 'sk-SK' }, cz: { hl: 'cs', gl: 'CZ', market: 'cs-CZ' }, eu: { hl: 'en', gl: 'GB', market: 'en-GB' }, global: { hl: 'en', gl: 'US', market: 'en-US' } };

function webUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function upstreamFailure(): Error {
  return Object.assign(new Error('Media provider is unavailable'), { status: getNetworkStatus().configured ? 502 : 503 });
}

/** Real Bing image results. SafeSearch, market and available age filters are sent upstream. */
export async function fetchFufuImages(query: string, options: SearchOptions = defaults): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const url = new URL('https://www.bing.com/images/search');
  const market = markets[options.region] || markets.sk;
  url.search = new URLSearchParams({ q: trimmed, form: 'HDRSC2', adlt: options.safeSearch ? 'strict' : 'off', mkt: market.market, cc: market.gl }).toString();
  const age = { day: '1440', week: '10080', month: '43200' }[options.timeFilter];
  if (age) url.searchParams.set('qft', `+filterui:age-lt${age}`);
  const response = await serverFetch(url, { headers: { 'User-Agent': userAgent }, signal: options.signal, timeoutMs: 6000, maxBytes: 4 * 1024 * 1024 });
  if (!response.ok) throw upstreamFailure();
  const $ = cheerio.load(await response.text());
  const images: SearchResult[] = [];
  const seen = new Set<string>();
  $('a.iusc[m]').each((_, element) => {
    if (images.length >= 24) return;
    try {
      const item = JSON.parse($(element).attr('m') || '{}');
      const source = webUrl(item.murl);
      if (!source || seen.has(source)) return;
      seen.add(source);
      const host = new URL(webUrl(item.purl) || source).hostname;
      const title = String(item.t || $(element).attr('aria-label') || $(element).find('img').attr('alt') || trimmed);
      images.push({ id: `image-${images.length}`, title, url: source, displayUrl: host, snippet: title, siteName: host, thumbnail: webUrl(item.turl) || source });
    } catch { /* Ignore malformed provider records. */ }
  });
  return images;
}

function text(value: any): string {
  return typeof value?.simpleText === 'string' ? value.simpleText : Array.isArray(value?.runs) ? value.runs.map((run: any) => run.text || '').join('') : '';
}

function videoRecord(renderer: any): YouTubeVideoItem | null {
  const id = renderer.videoId;
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) return null;
  return {
    id: `yt-${id}`, videoId: id, title: text(renderer.title) || 'YouTube',
    url: `https://www.youtube.com/watch?v=${id}`, channel: text(renderer.ownerText || renderer.shortBylineText) || 'YouTube',
    duration: text(renderer.lengthText) || undefined, views: text(renderer.viewCountText || renderer.shortViewCountText) || undefined,
    published: text(renderer.publishedTimeText) || undefined,
    thumbnail: webUrl(renderer.thumbnail?.thumbnails?.slice(-1)?.[0]?.url) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    snippet: text(renderer.detailedMetadataSnippets?.[0]?.snippetText || renderer.descriptionSnippet),
  };
}

function shortsRecord(renderer: any, viewModel = false): YouTubeVideoItem | null {
  const command = renderer.onTap?.innertubeCommand;
  const path = command?.commandMetadata?.webCommandMetadata?.url || renderer.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url;
  const id = renderer.videoId || command?.reelWatchEndpoint?.videoId || (typeof path === 'string' ? path.match(/^\/shorts\/([\w-]{11})(?:[?/#]|$)/)?.[1] : undefined)
    || (typeof renderer.entityId === 'string' ? renderer.entityId.match(/^shorts-shelf-item-([\w-]{11})$/)?.[1] : undefined);
  if (typeof id !== 'string' || !/^[\w-]{11}$/.test(id)) return null;
  return {
    id: `yt-short-${id}`, videoId: id,
    title: viewModel ? renderer.overlayMetadata?.primaryText?.content || 'YouTube Short' : text(renderer.headline || renderer.title) || 'YouTube Short',
    url: `https://www.youtube.com/shorts/${id}`, channel: text(renderer.ownerText || renderer.shortBylineText) || 'YouTube Shorts',
    views: viewModel ? renderer.overlayMetadata?.secondaryText?.content || undefined : text(renderer.viewCountText) || undefined,
    thumbnail: webUrl(viewModel ? renderer.thumbnailViewModel?.thumbnailViewModel?.image?.sources?.[0]?.url : renderer.thumbnail?.thumbnails?.slice(-1)?.[0]?.url) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    isShort: true,
  };
}

export function parseYouTubeResults(data: any, shortsOnly = false): YouTubeVideoItem[] {
  const results: YouTubeVideoItem[] = [];
  const seen = new Set<string>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || results.length >= 24) return;
    let item: YouTubeVideoItem | null = null;
    if (shortsOnly) {
      if (value.shortsLockupViewModel) item = shortsRecord(value.shortsLockupViewModel, true);
      else if (value.reelItemRenderer) item = shortsRecord(value.reelItemRenderer);
      else if (value.videoRenderer?.navigationEndpoint?.reelWatchEndpoint) item = shortsRecord({ ...value.videoRenderer, videoId: value.videoRenderer.navigationEndpoint.reelWatchEndpoint.videoId });
    } else if (value.videoRenderer) item = videoRecord(value.videoRenderer);
    if (item && !seen.has(item.videoId)) { seen.add(item.videoId); results.push(item); }
    for (const [key, child] of Object.entries(value)) {
      if (!['adSlotRenderer', 'promotedSparklesWebRenderer'].includes(key)) {
        if (Array.isArray(child)) child.forEach(visit);
        else visit(child);
      }
    }
  };
  visit(data?.contents || data);
  return results;
}

function uploadDateFilter(options: SearchOptions): string | undefined {
  const value = { day: 2, week: 3, month: 4 }[options.timeFilter];
  return value ? Buffer.from([0x12, 0x02, 0x08, value]).toString('base64') : undefined;
}

async function searchYouTube(query: string, options: SearchOptions, shortsOnly: boolean): Promise<YouTubeVideoItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const locale = markets[options.region] || markets.sk;
  const params = uploadDateFilter(options);
  let providerResponded = false;
  try {
    const response = await serverFetch('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, 'X-YouTube-Client-Name': '1', 'X-YouTube-Client-Version': '2.20241001.01.00' },
      body: JSON.stringify({ context: { client: { clientName: 'WEB', clientVersion: '2.20241001.01.00', hl: locale.hl, gl: locale.gl }, user: { enableSafetyMode: options.safeSearch } }, query: shortsOnly ? `${trimmed} #shorts` : trimmed, ...(params ? { params } : {}) }),
      signal: options.signal, timeoutMs: 5000, maxBytes: 4 * 1024 * 1024,
    });
    if (response.ok) {
      const data = await response.json();
      providerResponded = Boolean(data.contents);
      const results = parseYouTubeResults(data, shortsOnly);
      if (results.length || providerResponded) return results;
    }
  } catch { if (options.signal?.aborted) throw upstreamFailure(); }
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', shortsOnly ? `${trimmed} #shorts` : trimmed);
  if (params) url.searchParams.set('sp', params);
  try {
    const response = await serverFetch(url, {
      headers: { 'User-Agent': userAgent, 'Accept-Language': `${locale.hl},en;q=0.8`, Cookie: `PREF=hl=${locale.hl}${options.safeSearch ? '&f2=8000000' : ''}` },
      signal: options.signal, timeoutMs: 5000, maxBytes: 4 * 1024 * 1024,
    });
    if (response.ok) {
      const html = await response.text();
      const match = html.match(/(?:var\s+)?ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s);
      if (match) { providerResponded = true; return parseYouTubeResults(JSON.parse(match[1]), shortsOnly); }
    }
  } catch { /* Return a generic provider failure below. */ }
  if (!providerResponded) throw upstreamFailure();
  return [];
}

export function fetchYouTubeVideos(query: string, options: SearchOptions = defaults): Promise<YouTubeVideoItem[]> {
  return searchYouTube(query, options, false);
}

/** Only Shorts identified by YouTube's Shorts renderers; ordinary short videos are not relabelled. */
export function fetchYouTubeShorts(query: string, options: SearchOptions = defaults): Promise<YouTubeVideoItem[]> {
  return searchYouTube(query, options, true);
}

// Transitional exports for callers migrating from the old scraper. No fabricated devices or caches.
export const fufuManager = {
  getProfile: () => ({ engine: 'Baky One Search', network: getNetworkStatus() }),
  getStats: () => ({ engineName: 'Baky One Search', network: getNetworkStatus() }),
};
export function clearFufuServerCache(): void { /* Search queries are not cached by these services. */ }
