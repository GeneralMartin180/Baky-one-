import * as cheerio from 'cheerio';

export type SearchResponseClassification = 'results' | 'empty' | 'unavailable';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const noResultsMessage = /^(?:no (?:results|matches)(?: (?:were )?found)?\b|there are no results\b|we (?:couldn't|could not|didn't|did not) find (?:any )?results\b|your search\b.*\bdid not match any documents\b|(?:nebyly nalezeny|nenasli jsme) zadne vysledky\b|(?:nenasli sa|neboli najdene) ziadne vysledky\b|zadne vysledky\b|ziadne vysledky\b)/;
const blockedHeading = /^(?:access denied\b|too many requests\b|rate limit(?:ed| exceeded)?\b|service unavailable\b|verify (?:that )?you are (?:a )?human\b|are you (?:a )?(?:human|robot)\b|just a moment\b|pristup odepren\b|prilis mnoho pozadavku\b|overte.*(?:clovek|robot)\b)/;

/** A parser returning zero rows alone is not evidence of a successful empty search. */
export function classifySearchResponse(provider: string, body: string, resultCount: number): SearchResponseClassification {
  // Normal result pages can load CAPTCHA libraries too; actual parsed rows take precedence.
  if (resultCount > 0) return 'results';
  if (!body.trim()) return 'unavailable';

  const $ = cheerio.load(body);
  const challenge = $('form#challenge-form, form#img-form[action*="anomaly"], form[action*="/anomaly"], #captcha, #b_captcha, #cf-challenge-running, .g-recaptcha, .h-captcha, [id^="cf-chl-"]').length > 0
    || $('script[src]').toArray().some(node => /(?:anomaly\.js|\/challenge-platform\/|captcha-delivery\.com)/i.test($(node).attr('src') || ''));
  $('script, style, noscript, template, input, textarea, select').remove();
  const blocked = $('h1, h2, h3, [role="alert"], body > pre').toArray().some(node => blockedHeading.test(normalize($(node).text())));
  if (challenge || blocked) return 'unavailable';

  if (provider === 'bing-rss') {
    // A complete RSS channel with no items is an explicit empty feed. HTML login,
    // error documents, truncated XML and feeds whose items failed parsing are not.
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<rss(?:\s|>)/i.test(body) || !/<\/rss>\s*$/i.test(body)) return 'unavailable';
    const xml = cheerio.load(body, { xmlMode: true });
    const roots = xml.root().children();
    const channel = xml('rss > channel');
    if (roots.length !== 1 || roots.first()[0]?.name !== 'rss' || channel.length !== 1 || xml('item, error, parsererror, html').length) return 'unavailable';
    if (channel.children('title, description').toArray().some(node => blockedHeading.test(normalize(xml(node).text())))) return 'unavailable';
    return 'empty';
  }

  if (provider === 'duckduckgo' || provider === 'duckduckgo-lite') {
    const emptyContainers = $('.no-results, .no-results__message, .no-results__container, .result--no-result');
    return emptyContainers.toArray().some(node => noResultsMessage.test(normalize($(node).text()))) ? 'empty' : 'unavailable';
  }

  if (provider === 'bing') {
    return $('#b_results .b_no, #b_results.b_no').toArray().some(node => noResultsMessage.test(normalize($(node).text()))) ? 'empty' : 'unavailable';
  }

  if (provider === 'seznam') {
    // Current Seznam uses generated classes. Its genuine zero-result state has
    // this heading and a neighboring instruction to check the submitted query.
    const emptyHeading = /^(?:bohuzel (?:jsem nic nenasel|jsme nic nenasli)|nic jsme nenasli)$/;
    const empty = $('h1, h2, h3').toArray().some(node => {
      const heading = $(node);
      if (!emptyHeading.test(normalize(heading.text()))) return false;
      const context = normalize(heading.parent().text());
      return /(?:asi jste prvni, kdo vyhledava|prekontrolujte zadany dotaz|zkuste (?:jiny|zmenit) dotaz)/.test(context);
    });
    return empty ? 'empty' : 'unavailable';
  }

  return 'unavailable';
}
