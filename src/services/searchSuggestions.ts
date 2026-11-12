import { serverFetch, type ServerFetch } from './serverTransport.ts';
import type { SearchOptions } from './searchOptions.ts';

const MAX_SUGGESTIONS = 7;
const MAX_PHRASE_LENGTH = 160;
const regionCodes = { sk: 'sk-sk', cz: 'cz-cs', eu: 'uk-en', global: 'wt-wt' } as const;

function comparisonKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export async function fetchSearchSuggestions(
  query: string,
  options: SearchOptions,
  fetcher: ServerFetch = serverFetch,
): Promise<string[]> {
  const input = query.trim().replace(/\s+/gu, ' ');
  const prefix = comparisonKey(input);
  if (input.length < 2 || input.length > MAX_PHRASE_LENGTH || !prefix || options.signal?.aborted) return [];

  const url = new URL(options.safeSearch ? 'https://safe.duckduckgo.com/ac/' : 'https://duckduckgo.com/ac/');
  url.searchParams.set('q', input);
  url.searchParams.set('kl', regionCodes[options.region]);
  url.searchParams.set('kp', options.safeSearch ? '1' : '-2');

  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json, application/javascript' },
      cache: 'no-store',
      redirect: 'error',
      timeoutMs: 1200,
      maxBytes: 16 * 1024,
      signal: options.signal,
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data) || options.signal?.aborted) return [];

    const exact = input.toLowerCase();
    const seen = new Set<string>();
    const suggestions: string[] = [];
    for (const entry of data) {
      if (entry === null || typeof entry !== 'object') continue;
      const raw: unknown = entry.phrase;
      if (typeof raw !== 'string' || raw.length > MAX_PHRASE_LENGTH) continue;
      if (/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(raw)) continue;
      const phrase = raw.trim().replace(/\s+/gu, ' ');
      const key = comparisonKey(phrase);
      if (!key.startsWith(prefix) || phrase.toLowerCase() === exact || seen.has(key)) continue;
      suggestions.push(phrase);
      seen.add(key);
      if (suggestions.length === MAX_SUGGESTIONS) break;
    }
    return suggestions;
  } catch {
    return [];
  }
}
