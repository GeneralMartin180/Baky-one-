import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseBingHtml, parseDuckDuckGoLite, parseSeznam, rankResults, searchWeb } from '../src/services/webSearchService.ts';
import type { SearchResult } from '../src/types.ts';

const github: SearchResult = {
  id: 'official', title: 'GitHub: Let us build from here', snippet: 'Collaborate on software projects.',
  url: 'https://github.com/', displayUrl: 'github.com',
};

test('domain navigation remains relevant when the host is absent from the page title and snippet', () => {
  assert.equal(rankResults([{ source: 'bing', results: [github] }], 'github.com').length, 1);
});

test('site operator narrows source hosts without becoming mandatory prose relevance tokens', () => {
  const react = { ...github, title: 'React hooks guide', snippet: 'Learn React state and effects.', url: 'https://github.com/org/hooks' };
  assert.equal(rankResults([{ source: 'bing', results: [react] }], 'site:github.com react').length, 1);
});

test('paid containers are excluded even when the ad marker is on the selected container itself', () => {
  assert.deepEqual(parseBingHtml('<ol id="b_results"><li class="b_algo b_ad"><h2><a href="https://paid.example/">Bratislava hotel</a></h2></li></ol>'), []);
});

test('Czech accented sponsorship labels are recognized as labels', () => {
  assert.deepEqual(parseSeznam('<article><h3><a href="https://paid.example/">Bratislava hotel</a></h3><span>Sponzorovaný</span></article>'), []);
});

test('editorial pages about advertising are not mistaken for paid results', () => {
  assert.equal(parseSeznam('<article><h3><a href="https://wiki.example/ads">Reklama na internetu</a></h3><p>Vysvetlenie pojmu reklama a marketing.</p></article>').length, 1);
});

test('dotted programming API names remain text queries instead of being treated as domain navigation', () => {
  const method = { ...github, title: 'Array.prototype.sort() - JavaScript | MDN', snippet: 'Sort an array in place.', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/sort' };
  assert.equal(rankResults([{ source: 'bing', results: [method] }], 'Array.prototype.sort').length, 1);
});

const seznamFixture = readFileSync(new URL('./fixtures/seznam-organic.html', import.meta.url), 'utf8');
const liteFixture = readFileSync(new URL('./fixtures/ddg-lite-organic.html', import.meta.url), 'utf8');

test('real Seznam structures retain individual snippets and ignore unrelated page-wide advertising labels', () => {
  const results = parseSeznam(seznamFixture);
  assert.equal(results.length, 2);
  assert.equal(results[0].url, 'https://www.w3schools.com/js/js_array_sort.asp');
  assert.match(results[0].snippet, /Well organized/);
  assert.ok(!results[0].snippet.includes('Ultra tiny library'));
  // The library row lacks the requested JavaScript subject in its own metadata.
  assert.equal(rankResults([{ source: 'seznam', results }], 'javascript array sort').length, 1);
});

test('real DuckDuckGo Lite result rows decode destinations and their own snippets', () => {
  const results = parseDuckDuckGoLite(liteFixture);
  assert.equal(results.length, 2);
  assert.equal(new URL(results[0].url).hostname, 'developer.mozilla.org');
  assert.match(results[0].snippet, /sorts the elements/);
  assert.equal(rankResults([{ source: 'duckduckgo-lite', results }], 'javascript array sort').length, 2);
});

test('DDG Lite recovers blocked HTML in parallel and forwards SafeSearch, region and time within the provider budget', async () => {
  const requests: Array<{ url: URL; init: any }> = [];
  const result = await searchWeb('javascript array sort', 1, { safeSearch: true, region: 'cz', timeFilter: 'week' }, {
    overview: async () => null,
    fetch: async (input, init) => {
      const url = new URL(input); requests.push({ url, init });
      if (url.hostname === 'html.duckduckgo.com') return new Response('challenge-form', { status: 429 });
      return new Response(url.hostname === 'lite.duckduckgo.com' ? liteFixture : '');
    },
  });
  const lite = requests.find(request => request.url.hostname === 'lite.duckduckgo.com')!;
  assert.equal(lite.url.searchParams.get('kp'), '1');
  assert.equal(lite.url.searchParams.get('kl'), 'cz-cz');
  assert.equal(lite.url.searchParams.get('df'), 'w');
  assert.equal(lite.init.timeoutMs, 3400);
  assert.equal(result.results.length, 2);
  assert.ok(result.sources.includes('duckduckgo-lite'));
  assert.equal(result.degraded, true);
});

test('Seznam forwards its documented safe parameter and omits unsupported count/safesearch parameters', async () => {
  for (const safeSearch of [true, false]) {
    let seznam: URL | undefined;
    await searchWeb('javascript array sort', 1, { safeSearch }, {
      overview: async () => null,
      fetch: async input => { const url = new URL(input); if (url.hostname === 'search.seznam.cz') seznam = url; return new Response('<div><h3>Bohužel jsem nic nenašel</h3><p>Překontrolujte zadaný dotaz</p></div>'); },
    });
    assert.ok(seznam);
    assert.equal(seznam.searchParams.get('safe'), safeSearch ? 'yes' : 'no');
    assert.equal(seznam.searchParams.has('safesearch'), false);
    assert.equal(seznam.searchParams.has('count'), false);
  }
});
