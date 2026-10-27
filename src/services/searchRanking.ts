import type { SearchResult } from '../types.ts';
import type { ProviderResult } from './webSearchService.ts';
import { isConservativeSpellingCorrection } from './querySpelling.ts';

const STOP_WORDS = new Set('a an the of for to in on and or is how what when where na v vo z zo s so aj i je su sa si pre do od pri ako co kde kedy preco dnes'.split(' '));
const INTENT_WORDS = new Set('kupit koupit nakupit zakupit vybrat najst najit hladat hledat naucit buy buying find learn official oficialny oficialni website homepage stranka stranky'.split(' '));
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|msclkid$|msockid$|yclid$|ref_src$)/i;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function words(value: string): string[] {
  return normalize(value).match(/[\p{L}]+|[\p{N}]+/gu) || [];
}

function term(value: string): string {
  let word = value.replace(/^futbal/, 'fotbal');
  if (/^ryz[aeiuy]$/.test(word)) return 'ryz';
  if (/^pocasi(?:e)?$/.test(word)) return 'pocas';
  if (word.length > 5) word = word.replace(/(?:ami|emi|och|ove|ovy|ich|ych|ou|ov|om|em|um|mi|ie|ia|y|i|u|a|e)$/, '');
  return word;
}

/** Keep real provider/product pages while excluding search navigation and ad redirects. */
export function canonicalResultUrl(value: string, base = 'https://www.bing.com'): string | null {
  if (!value.trim()) return null;
  try {
    let url = new URL(value, base);
    if (/(^|\.)duckduckgo\.com$/i.test(url.hostname) && url.pathname === '/l/') {
      const target = url.searchParams.get('uddg');
      if (!target) return null;
      url = new URL(target);
    }
    if (/(^|\.)bing\.com$/i.test(url.hostname) && url.pathname.startsWith('/ck/')) {
      const encoded = url.searchParams.get('u');
      if (!encoded?.startsWith('a1')) return null;
      url = new URL(Buffer.from(encoded.slice(2), 'base64url').toString('utf8'));
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (/(^|\.)(search\.seznam\.cz|search\.yahoo\.com)$/i.test(host)) return null;
    if (/(^|\.)duckduckgo\.com$/i.test(host) && (url.searchParams.has('q') || /^\/(?:html|lite|l|y)(?:\/|$)/i.test(url.pathname))) return null;
    if (/(^|\.)bing\.com$/i.test(host) && (/^\/(?:search|aclick|ck|fd\/ls)(?:\/|$)/i.test(url.pathname) || /^\/(?:images|videos|news)\/search(?:\/|$)/i.test(url.pathname) || url.searchParams.has('q'))) return null;
    if (host === 'localhost' || host.endsWith('.local') || /^127\./.test(host)) return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(name)) url.searchParams.delete(name);
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

function hostName(url: URL): string {
  return url.hostname.toLowerCase().replace(/^(?:www|m|mobile)\./, '');
}

function identity(url: URL): string {
  // Protocol and conventional presentation subdomains do not identify a new document.
  return `${hostName(url)}${url.port ? `:${url.port}` : ''}${url.pathname}${url.search}`;
}

export function resultDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const countrySuffix = labels.length > 2 && labels.at(-1)!.length === 2 && /^(?:co|com|org|net|gov|ac)$/.test(labels.at(-2)!);
  return labels.slice(countrySuffix ? -3 : -2).join('.');
}

function brandLabel(host: string): string {
  return resultDomain(host).split('.')[0];
}

interface SiteScope { host: string; path: string; excluded: boolean }
interface Query {
  prose: string;
  terms: string[];
  joined?: string;
  repeatedPhrase?: string;
  phrases: string[];
  excluded: string[];
  scopes: SiteScope[];
  host?: string;
  path?: string;
}

function parseQuery(value: string, pages: ProviderResult[]): Query {
  const scopes: SiteScope[] = [];
  let prose = value.replace(/(^|\s)(-?)site:([^\s]+)/gi, (match, prefix, negative, target) => {
    try {
      const url = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
      scopes.push({ host: hostName(url), path: url.pathname.replace(/\/$/, ''), excluded: Boolean(negative) });
      return prefix;
    } catch { return match; }
  });
  const excluded: string[] = [];
  prose = prose.replace(/(^|\s)-(?:"([^"]+)"|([^\s]+))/g, (_match, prefix, phrase, token) => {
    excluded.push(words(phrase || token).join(' '));
    return prefix;
  });
  const phrases = [...prose.matchAll(/"([^"]+)"/g)].map(match => words(match[1]).join(' ')).filter(Boolean);
  let host: string | undefined;
  let path: string | undefined;
  // A host embedded in a natural query is a destination hint, not prose words such as "com".
  prose = prose.replace(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s"]*)?/gi, match => {
    try {
      const url = new URL(/^https?:\/\//i.test(match) ? match : `https://${match}`);
      const candidate = hostName(url);
      const returnedHost = pages.some(page => page.results.some(result => {
        try { const actual = hostName(new URL(result.url)); return actual === candidate || actual.endsWith(`.${candidate}`); } catch { return false; }
      }));
      // This preserves dotted API identifiers (Array.prototype.sort) as ordinary text.
      if (!returnedHost && !/^https?:\/\/|^www\./i.test(match)) return match;
      host ||= candidate;
      path ||= url.pathname === '/' ? undefined : url.pathname.replace(/\/$/, '');
      return ' ';
    } catch { return match; }
  });
  const ordered = words(prose).filter(word => !STOP_WORDS.has(word));
  const subjects = ordered.filter(word => !INTENT_WORDS.has(word));
  const retained = subjects.length ? subjects : ordered;
  return {
    prose: prose.replace(/"/g, '').replace(/\s+/g, ' ').trim(),
    terms: [...new Set(retained.map(term))],
    // Join before deduplicating: "duck duck go" is DuckDuckGo, never "duckgo".
    joined: retained.length > 1 && retained.every(word => /^\p{L}+$/u.test(word)) ? term(retained.join('')) : undefined,
    repeatedPhrase: retained.length <= 4 && new Set(retained).size < retained.length ? retained.join(' ') : undefined,
    phrases, excluded, scopes, host, path,
  };
}

export interface RankedResult { result: SearchResult; score: number; correctedQuery?: string }
interface Candidate extends RankedResult { host: string; domain: string; key: string; sources: Set<string>; titleTerms: Set<string>; textTerms: Set<string> }

export function rankProviderResults(pages: ProviderResult[], query: string): RankedResult[] {
  const original = parseQuery(query, pages);
  const seen = new Map<string, Candidate>();
  const hostMatches = (host: string, scope: string) => host === scope || host.endsWith(`.${scope}`);
  for (const page of pages) {
    const correctedQuery = page.correctedQuery && isConservativeSpellingCorrection(query, page.correctedQuery) ? page.correctedQuery : undefined;
    const parsedQuery = correctedQuery ? parseQuery(correctedQuery, pages) : original;
    page.results.forEach((result, index) => {
      const url = canonicalResultUrl(result.url);
      if (!url) return;
      const parsed = new URL(url);
      const host = hostName(parsed);
      if (original.host && !original.terms.length && !hostMatches(host, original.host)) return;
      const inScope = (scope: SiteScope) => hostMatches(host, scope.host) && (!scope.path || parsed.pathname === scope.path || parsed.pathname.startsWith(`${scope.path}/`));
      const positive = original.scopes.filter(scope => !scope.excluded);
      if ((positive.length && !positive.some(inScope)) || original.scopes.some(scope => scope.excluded && inScope(scope))) return;
      let pathname = parsed.pathname;
      try { pathname = decodeURIComponent(pathname); } catch { /* Keep the provider path. */ }
      const titleWords = words(result.title);
      const fields = [result.title, result.snippet, host, pathname].map(value => words(value));
      const allWords = fields.flat();
      const containsPhrase = (phrase: string) => fields.some(field => ` ${field.join(' ')} `.includes(` ${phrase} `));
      if (original.phrases.some(phrase => !containsPhrase(phrase)) || original.excluded.some(phrase => phrase && containsPhrase(phrase))) return;
      const titleTerms = new Set(titleWords.map(term));
      const textTerms = new Set(allWords.map(term));
      const { terms, joined } = parsedQuery;
      const joinedMatch = Boolean(joined && textTerms.has(joined));
      const joinedTitle = Boolean(joined && titleTerms.has(joined));
      if (parsedQuery.repeatedPhrase && !joinedMatch && !containsPhrase(parsedQuery.repeatedPhrase)) return;
      const hits = joinedMatch ? terms.length : terms.filter(token => textTerms.has(token)).length;
      const titleHits = joinedTitle ? terms.length : terms.filter(token => titleTerms.has(token)).length;
      const mandatory = terms.filter(token => /^\p{N}+$/u.test(token) || token.length <= 3);
      if (!joinedMatch && mandatory.some(token => !textTerms.has(token))) return;
      const minimum = terms.length <= 3 ? terms.length : Math.ceil(terms.length * 0.6);
      if (hits < minimum) return;
      const coverage = terms.length ? hits / terms.length : 1;
      const titleCoverage = terms.length ? titleHits / terms.length : 0;
      const hostHint = Boolean(original.host && hostMatches(host, original.host));
      const brand = terms.length && terms.every(token => /^\p{L}+$/u.test(token)) ? joined || (terms.length === 1 ? terms[0] : undefined) : undefined;
      const exactBrandHost = Boolean(brand && term(brandLabel(host)) === brand);
      const phrase = words(parsedQuery.prose).join(' ');
      const exactTitle = Boolean(phrase && ` ${titleWords.join(' ')} `.includes(` ${phrase} `));
      const offset = ('offset' in page && typeof page.offset === 'number') ? page.offset : 0;
      // Retain the upstream ordering; a follow-up page does not restart at rank one.
      let score = coverage * 38 + titleCoverage * 22 + 24 / Math.sqrt(offset + index + 1);
      if (exactTitle || joinedTitle) score += 13;
      if (correctedQuery) score -= 3;
      if (hostHint) {
        score += host === original.host ? 65 : 45;
        if (original.path && (parsed.pathname === original.path || parsed.pathname === `${original.path}/`)) score += 40;
        else if (original.path && parsed.pathname.startsWith(`${original.path}/`)) score += 18;
      }
      if (exactBrandHost) score += 36 + (parsed.pathname === '/' ? 12 : 0);
      if (page.source === 'bing-rss') score -= 8;
      if (page.source === 'brave') score += 5;
      // Candidate identity deliberately retains the provider's own title/snippet pair.
      const key = identity(parsed);
      const previous = seen.get(key);
      const sources = previous?.sources || new Set<string>();
      sources.add(page.source.replace(/-lite$|-rss$/, ''));
      if (!previous || score > previous.score) seen.set(key, { result: { ...result, url }, score, correctedQuery, host, domain: resultDomain(host), key, sources, titleTerms, textTerms });
    });
  }
  const candidates = [...seen.values()];
  for (const candidate of candidates) candidate.score += Math.min(8, (candidate.sources.size - 1) * 4);
  // For an unambiguous brand homepage, related pages sharing its subject words
  // deserve a small boost over other meanings of the same short brand name.
  const brandPage = candidates.filter(candidate => {
    const url = new URL(candidate.result.url);
    const brand = original.joined || (original.terms.length === 1 ? original.terms[0] : undefined);
    return brand && candidate.host === candidate.domain && term(brandLabel(candidate.host)) === brand && url.pathname === '/';
  }).sort((a, b) => b.score - a.score)[0];
  if (brandPage) {
    const officialDescription = words(brandPage.result.snippet);
    // A long copied introduction on another domain adds no independent result.
    // Only an actual brand homepage can establish which destination to retain.
    if (officialDescription.length >= 14) {
      for (let index = candidates.length - 1; index >= 0; index--) {
        const candidate = candidates[index];
        if (candidate.domain === brandPage.domain) continue;
        const description = words(candidate.result.snippet);
        let shared = 0;
        while (shared < officialDescription.length && shared < description.length && officialDescription[shared] === description[shared]) shared++;
        if (shared >= 14 && officialDescription.slice(0, shared).join(' ').length >= 120) candidates.splice(index, 1);
      }
    }
    const context = [...brandPage.titleTerms, ...words(brandPage.result.snippet).map(term)].filter(token => token.length >= 4 && !STOP_WORDS.has(token) && !INTENT_WORDS.has(token) && !original.terms.includes(token));
    for (const candidate of candidates) if (candidate !== brandPage) candidate.score += Math.min(12, [...new Set(context)].filter(token => candidate.textTerms.has(token)).length * 3);
  }
  const ordered: Candidate[] = [];
  const counts = new Map<string, number>();
  while (candidates.length) {
    const diversify = !original.host && !original.scopes.some(scope => !scope.excluded) && ordered.length < 10;
    const adjusted = (candidate: Candidate) => candidate.score - (diversify ? Math.max(0, (counts.get(candidate.domain) || 0) - 1) * 38 : 0);
    candidates.sort((a, b) => adjusted(b) - adjusted(a) || a.result.url.localeCompare(b.result.url));
    const freshDomainIndex = diversify ? candidates.findIndex(candidate => (counts.get(candidate.domain) || 0) < 2) : -1;
    const candidate = candidates.splice(freshDomainIndex < 0 ? 0 : freshDomainIndex, 1)[0];
    counts.set(candidate.domain, (counts.get(candidate.domain) || 0) + 1);
    ordered.push(candidate);
  }
  return ordered.map(({ result, score, correctedQuery }) => ({ result, score, ...(correctedQuery ? { correctedQuery } : {}) }));
}

export function rankResults(pages: ProviderResult[], query: string): SearchResult[] {
  return rankProviderResults(pages, query).map(item => item.result);
}
