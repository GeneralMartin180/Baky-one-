import * as cheerio from 'cheerio';
import { isConservativeSpellingCorrection } from './querySpelling.ts';

const whitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Read an explicit provider spelling correction, never related searches or query echoes. */
export function parseProviderSpellingCorrection(provider: string, body: string, original: string): string | undefined {
  // This structure is reduced from the current live Seznam correction header.
  // Other providers are ignored until their actual correction markup is known.
  if (provider !== 'seznam') return undefined;
  const $ = cheerio.load(body);
  $('script, style, noscript, template, input, textarea, select').remove();
  const candidates = new Set<string>();
  $('h3').each((_, element) => {
    const heading = $(element);
    const links = heading.find('a[data-e-a="accept"]');
    if (links.length !== 1) return;
    const link = links.first();
    const visible = whitespace(link.text());
    if (!visible || visible.length > 500 || whitespace(heading.text()) !== `Hledali jsme ${visible}`) return;
    try {
      const url = new URL(link.attr('href') || '', 'https://search.seznam.cz/');
      if (url.origin !== 'https://search.seznam.cz' || url.pathname !== '/' || url.username || url.password || url.hash || url.searchParams.getAll('q').length !== 1) return;
      const supplied = url.searchParams.get('q')!;
      if (/[\u0000-\u001f\u007f<>]/.test(supplied) || supplied.length > 500) return;
      const candidate = whitespace(supplied);
      if (candidate !== visible || candidate === whitespace(original) || /(?:https?:\/\/|www\.)/i.test(candidate)) return;
      if (!isConservativeSpellingCorrection(original, candidate)) return;
      candidates.add(candidate);
    } catch { /* Invalid correction links are not usable spelling evidence. */ }
  });
  return candidates.size === 1 ? [...candidates][0] : undefined;
}
