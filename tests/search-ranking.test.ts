import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalResultUrl, rankResults, resultDomain } from '../src/services/searchRanking.ts';
import type { ProviderResult } from '../src/services/webSearchService.ts';
import type { SearchResult } from '../src/types.ts';

const item = (title: string, url: string, snippet = ''): SearchResult => ({ id: url, title, url, displayUrl: url, snippet });
const rank = (query: string, results: SearchResult[]) => rankResults([{ source: 'bing', results }], query);

test('real search provider homepages and products are retained without accepting search navigation or ads', () => {
  for (const url of ['https://duckduckgo.com/', 'https://duckduckgo.com/about', 'https://duckduckgo.com/browser', 'https://www.bing.com/']) assert.equal(canonicalResultUrl(url), url);
  for (const url of ['', 'https://duckduckgo.com/?q=cats', 'https://html.duckduckgo.com/html/', 'https://www.bing.com/search?q=cats', 'https://www.bing.com/aclick?u=anything', 'https://www.bing.com/images/search?q=cats', 'https://search.seznam.cz/?q=cats']) assert.equal(canonicalResultUrl(url), null);
  assert.equal(canonicalResultUrl('https://www.microsoft.com/windows?msockid=tracking'), 'https://www.microsoft.com/windows');
});

test('joined brand names retain repeated query words and put the actual homepage first', () => {
  const official = item('DuckDuckGo — Privacy, simplified.', 'https://duckduckgo.com/', 'Private search and browser.');
  const article = item('Duck Duck Go search engine review', 'https://reviews.example/duck-duck-go');
  const incomplete = item('Duck Go game', 'https://games.example/duck-go');
  assert.deepEqual(rank('duck duck go', [article, official, incomplete]).map(result => result.url), [official.url, article.url]);
});

test('model and version numbers remain mandatory in longer and compact product queries', () => {
  const right = item('iPhone 16 Pro Max', 'https://www.apple.com/iphone-16-pro/');
  const wrong = item('iPhone 15 Pro Max', 'https://store.example/iphone-15-pro-max');
  assert.deepEqual(rank('iphone 16 pro max', [wrong, right]), [right]);
  assert.deepEqual(rank('iphone16 pro max', [wrong, right]), [right]);
  assert.deepEqual(rank('python 3.12', [item('Python 3.13 documentation', 'https://docs.python.org/3.13/'), item('Python 3.12 documentation', 'https://docs.python.org/3.12/')]).map(result => result.url), ['https://docs.python.org/3.12/']);
});

test('explicit destination domains and paths outrank domain names copied into another site', () => {
  const actual = item('React', 'https://github.com/facebook/react', 'The library for user interfaces.');
  const stuffed = item('GitHub.com React: All information', 'https://keyword.example/github.com/react');
  assert.equal(rank('github.com react', [stuffed, actual])[0].url, actual.url);
  assert.equal(rank('github.com/facebook/react', [item('GitHub', 'https://github.com/'), actual])[0].url, actual.url);
  assert.deepEqual(rank('github.com', [stuffed, actual]), [actual]);
});

test('quotes and site scopes are exact, and excluded paths use segment boundaries', () => {
  const exact = item('Baky OS downloads', 'https://github.com/org/project/docs/install');
  const shuffled = item('Baky downloads OS', 'https://github.com/org/project/docs/other');
  const neighbor = item('Baky OS reference', 'https://github.com/org/project/docs-old');
  const elsewhere = item('Baky OS downloads', 'https://elsewhere.example/docs');
  assert.deepEqual(rank('site:github.com/org/project/docs "baky os"', [exact, shuffled, neighbor, elsewhere]), [exact]);
  assert.deepEqual(rank('-site:github.com/org/project/docs "baky os"', [exact, neighbor, elsewhere]).map(result => result.url), [neighbor.url, elsewhere.url]);
});

test('long queries require more than an arbitrary overlap of two generic words', () => {
  const vague = item('NASA Artemis news', 'https://news.example/artemis');
  const exact = item('Artemis II launch schedule', 'https://www.nasa.gov/artemis-ii/', 'The NASA launch date and mission schedule.');
  assert.deepEqual(rank('NASA Artemis II launch date', [vague, exact]), [exact]);
  assert.deepEqual(rank('how to reset microsoft account password', [item('Microsoft account', 'https://generic.example/account'), item('Reset your Microsoft account password', 'https://support.microsoft.com/account-password')]).map(result => result.url), ['https://support.microsoft.com/account-password']);
  const city = item('Rimavská Sobota', 'https://sk.wikipedia.org/wiki/Rimavska_Sobota', 'Slovenské mesto Rimavská Sobota.');
  const weather = item('Počasie Rimavská Sobota', 'https://weather.example/rimavska-sobota', 'Predpoveď počasia pre mesto.');
  assert.deepEqual(rank('počasie Rimavská Sobota', [city, weather]), [weather]);
});

test('deduplication merges presentation aliases but preserves query documents and path case', () => {
  const results = rank('guide', [
    item('Guide', 'https://example.com/'), item('Guide', 'https://www.example.com/'), item('Guide', 'http://example.com/'),
    item('Guide', 'https://example.com/Doc'), item('Guide', 'https://example.com/doc'),
    item('Guide', 'https://example.com/watch?v=one'), item('Guide', 'https://example.com/watch?v=two'),
  ]);
  assert.equal(results.length, 5);
  assert.equal(new Set(results.map(result => result.url)).size, 5);
});

test('first page diversifies repeated hosts while keeping all real candidates available', () => {
  const repeated = Array.from({ length: 6 }, (_, i) => item('Lovable platform guide', `https://www.youtube.com/watch?v=${i}`, 'Create apps and websites.'));
  const other = Array.from({ length: 9 }, (_, i) => item('Lovable platform guide', `https://review${i}.example/lovable`, 'Create apps and websites.'));
  const results = rank('lovable', [...repeated, ...other]);
  assert.equal(results.length, 15);
  assert.equal(results.slice(0, 10).filter(result => new URL(result.url).hostname.endsWith('youtube.com')).length, 2);
});

test('upstream offset keeps supplementary pages behind equally relevant first-page results', () => {
  const early = item('JavaScript array sort', 'https://early.example/');
  const later = item('JavaScript array sort', 'https://later.example/');
  const pages = [{ source: 'bing', results: [early] }, { source: 'seznam', offset: 10, results: [later] }] as ProviderResult[];
  assert.equal(rankResults(pages, 'javascript array sort')[0].url, early.url);
});

test('language and product subdomains share a diversity bucket while their actual destinations remain intact', () => {
  assert.equal(resultDomain('cs.wikipedia.org'), 'wikipedia.org');
  assert.equal(resultDomain('docs.company.co.uk'), 'company.co.uk');
  const wiki = ['cs', 'sk', 'en'].map(language => item('SpaceX guide', `https://${language}.wikipedia.org/wiki/SpaceX`));
  const product = ['docs', 'support', 'blog'].map(subdomain => item('SpaceX guide', `https://${subdomain}.spacex.com/guide`));
  const other = Array.from({ length: 8 }, (_, index) => item('SpaceX guide', `https://review${index}.example/spacex`));
  const results = rank('spacex', [...wiki, ...product, ...other]);
  const first = results.slice(0, 10);
  assert.equal(first.filter(result => resultDomain(new URL(result.url).hostname) === 'wikipedia.org').length, 2);
  assert.equal(first.filter(result => resultDomain(new URL(result.url).hostname) === 'spacex.com').length, 2);
  assert.deepEqual(new Set(results.map(result => result.url)), new Set([...wiki, ...product, ...other].map(result => result.url)));
});

test('an existing brand homepage suppresses long copied mirror descriptions while retaining independent reviews', () => {
  const description = 'DuckDuckGo provides private search and a browser that helps protect your personal information while you browse websites and discover information across the public internet.';
  const official = item('DuckDuckGo', 'https://duckduckgo.com/', description);
  const mirror = item('DuckDuckGo', 'https://replica.example/', `${description.toUpperCase()} Additional copied page content.`);
  const review = item('DuckDuckGo browser review', 'https://reviews.example/duckduckgo', 'Our independent review of DuckDuckGo compares privacy controls, browser features, performance and search quality with alternatives.');
  const partial = item('DuckDuckGo analysis', 'https://analysis.example/duckduckgo', 'DuckDuckGo provides private search and a browser that helps protect your passwords. We independently discuss the available search options.');
  const results = rank('duck duck go', [mirror, review, official, partial]);
  assert.equal(results[0].url, official.url);
  assert.deepEqual(new Set(results.map(result => result.url)), new Set([official.url, review.url, partial.url]));
  assert.equal(rank('duck duck go', [mirror, review]).length, 2, 'without an actual brand homepage no destination can be classified as a copied mirror');
});
