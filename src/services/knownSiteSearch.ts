import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';
import type { SearchResult } from '../types.ts';
import type { SearchOptions } from './searchOptions.ts';
import { serverFetch, type ServerFetch } from './serverTransport.ts';

// These are the first-party app links already exposed by Baky One. This is an
// origin registry, not stored search results: every result requires live HTML.
const sites = [
  { url: 'https://www.bakyos.com/', names: ['baky os', 'bakyos'] },
  { url: 'https://baky-ai-your-smart-partner.vercel.app/', names: ['baky ai', 'bakyai'] },
  { url: 'https://bakyfinance-sk.vercel.app/', names: ['baky finance', 'bakyfinance'] },
  { url: 'https://baky-news.vercel.app/', names: ['baky news', 'bakynews'] },
] as const;

function words(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function namesApp(value: string, names: readonly string[]): boolean {
  const normalized = ` ${words(value)} `;
  return names.some((name) => normalized.includes(` ${name} `));
}

export function hasKnownSiteMatch(query: string): boolean {
  return sites.some((site) => namesApp(query, site.names));
}

function clean(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseLiveSite(html: string, site: (typeof sites)[number]): SearchResult | null {
  const $ = cheerio.load(html);
  const title = clean($('title').first().text() || $('meta[property="og:title"]').first().attr('content') || $('h1').first().text());
  // An error page, redirect landing page or unrelated site must not become an
  // official result merely because its address is in the registry.
  const identity = [title, $('meta[property="og:title"]').first().attr('content') || '', ...$('h1').map((_, element) => $(element).text()).get()];
  if (!title || !identity.some((value) => namesApp(value, site.names))) return null;

  $('script, style, noscript, template, nav, header, footer').remove();
  const paragraph = $('main p, article p, body p').map((_, element) => clean($(element).text())).get().find((value) => value.length >= 30);
  const body = clean($('main').first().text() || $('body').text());
  const description = [$('meta[name="description"]').first().attr('content'), $('meta[property="og:description"]').first().attr('content'), paragraph, body.length >= 30 ? body : ''].map((value) => clean(value || '')).find(Boolean);
  if (!description) return null;

  let url = new URL(site.url);
  const canonical = $('link[rel~="canonical"]').first().attr('href');
  if (canonical) {
    try {
      const candidate = new URL(canonical, site.url);
      if (candidate.origin === url.origin && candidate.protocol === 'https:' && !candidate.username && !candidate.password) url = candidate;
    } catch { /* Retain the verified requested URL. */ }
  }
  url.hash = '';
  const hostname = url.hostname.replace(/^www\./, '');
  return {
    id: `web-${createHash('sha256').update(url.href).digest('hex').slice(0, 16)}`,
    title: title.slice(0, 300), url: url.href,
    displayUrl: hostname + url.pathname.replace(/\/$/, ''),
    snippet: description.slice(0, 650), siteName: hostname,
  };
}

/** Retrieve only explicitly named first-party apps, with current live metadata. */
export async function searchKnownSites(query: string, options: SearchOptions, fetcher: ServerFetch = serverFetch): Promise<SearchResult[]> {
  options.signal?.throwIfAborted();
  // Homepage metadata cannot substantiate a published-date restriction.
  if (options.timeFilter !== 'anytime') return [];
  const matching = sites.filter((site) => namesApp(query, site.names));
  const results = await Promise.all(matching.map(async (site) => {
    try {
      options.signal?.throwIfAborted();
      const response = await fetcher(site.url, {
        signal: options.signal, timeoutMs: 1800, maxBytes: 1_000_000,
        publicAddressOnly: true, redirect: 'error',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (response.status !== 200 || !/^(?:text\/html|application\/xhtml\+xml)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return null;
      return parseLiveSite(await response.text(), site);
    } catch {
      // The shared transport enforces DNS/proxy policy. Its failure never causes
      // a direct retry or a result reconstructed from the registry.
      return null;
    }
  }));
  options.signal?.throwIfAborted();
  return results.filter((result): result is SearchResult => result !== null);
}
