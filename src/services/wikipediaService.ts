import type { SearchOverview } from '../types.ts';
import type { SearchOptions } from './searchOptions.ts';
import { serverFetch } from './serverTransport.ts';

function normalizedTitle(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function isStrictWikiMatch(query: string, title: string): boolean {
  const normalized = normalizedTitle(query);
  if (!normalized) return false;
  // Disambiguation qualifiers are allowed; arbitrary title prefixes are not.
  return normalized === normalizedTitle(title) || normalized === normalizedTitle(title.replace(/\s*\([^)]*\)\s*$/, ''));
}

/** Server-only lookup. Wikipedia has no SafeSearch or publication-date filter. No query cache. */
export async function fetchWikipediaSummary(query: string, options?: SearchOptions): Promise<SearchOverview | null> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return null;
  const languages = options?.region === 'cz' ? ['cs', 'en'] : options?.region === 'global' || options?.region === 'eu' ? ['en'] : ['sk', 'en'];
  // One deadline for the whole optional panel, including language/search fallbacks.
  const deadline = AbortSignal.timeout(1800);
  const signal = options?.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
  for (const language of languages) {
    if (signal.aborted) return null;
    try {
      const base = `https://${language}.wikipedia.org`;
      let response = await serverFetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(trimmed)}`, {
        signal, timeoutMs: 1800, maxBytes: 256 * 1024,
      });
      if (response.ok) {
        const data = await response.json();
        if (data.type === 'standard' && data.extract && isStrictWikiMatch(trimmed, data.title || '')) return overview(data, language);
      }
      const url = new URL('/w/api.php', base);
      url.search = new URLSearchParams({ action: 'query', list: 'search', srsearch: trimmed, format: 'json', srlimit: '5' }).toString();
      response = await serverFetch(url, { signal, timeoutMs: 1800, maxBytes: 256 * 1024 });
      if (!response.ok) continue;
      const data = await response.json();
      const hit = data.query?.search?.find((item: any) => typeof item.title === 'string' && isStrictWikiMatch(trimmed, item.title));
      if (!hit) continue;
      response = await serverFetch(`${base}/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`, {
        signal, timeoutMs: 1800, maxBytes: 256 * 1024,
      });
      if (!response.ok) continue;
      const summary = await response.json();
      if (summary.type === 'standard' && summary.extract && isStrictWikiMatch(trimmed, summary.title || '')) return overview(summary, language);
    } catch {
      // Optional knowledge panel: upstream failure must not replace the web results.
    }
  }
  return null;
}

function overview(data: any, language: string): SearchOverview {
  const pageUrl = `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(data.title).replace(/ /g, '_'))}`;
  const thumbnail = typeof data.thumbnail?.source === 'string' && data.thumbnail.source.startsWith('https://') ? data.thumbnail.source : undefined;
  return {
    title: data.title, subtitle: data.description || 'Wikipédia', description: data.description,
    extract: data.extract, thumbnailUrl: thumbnail, pageUrl, sourceName: 'Wikipédia',
    sources: [{ title: `Wikipédia: ${data.title}`, url: pageUrl, domain: `${language}.wikipedia.org` }],
  };
}
