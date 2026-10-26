import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalResultUrl, parseBingHtml, parseDuckDuckGo, rankResults, searchWeb } from '../src/services/webSearchService.ts';
import type { SearchResult } from '../src/types.ts';
import type { ServerFetch } from '../src/services/serverTransport.ts';

const item = (url: string, title = 'JavaScript array sort'): SearchResult => ({ id: url, url, title, displayUrl: url, snippet: 'Sort a JavaScript array with a comparator.' });
test('canonicalization preserves document parameters and case-sensitive paths, strips only known tracking', () => {
  assert.notEqual(canonicalResultUrl('https://example.com/watch?v=one'), canonicalResultUrl('https://example.com/watch?v=two'));
  assert.notEqual(canonicalResultUrl('https://example.com/Doc'), canonicalResultUrl('https://example.com/doc'));
  assert.equal(canonicalResultUrl('https://example.com/doc?id=1&utm_source=test#part'), 'https://example.com/doc?id=1');
  assert.equal(canonicalResultUrl('https://www.bing.com/aclick?u=anything'), null);
  assert.equal(canonicalResultUrl('javascript:alert(1)'), null);
  assert.equal(canonicalResultUrl('https://user:password@example.com/'), null);
});

test('organic parsers exclude paid containers and resolve real destination links', () => {
  const bing = '<ol id="b_results"><li class="b_ad"><h2><a href="https://ads.example/">Paid</a></h2></li><li class="b_algo"><h2><a href="https://docs.example/?id=2">Real</a></h2><div class="b_caption"><p>Real snippet</p></div></li></ol>';
  assert.deepEqual(parseBingHtml(bing).map(r => r.url), ['https://docs.example/?id=2']);
  const ddg = '<div class="result result--ad"><a class="result__a" href="https://ads.example/">Ad</a></div><div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdocs.example%2Fsort">Real</a><span class="result__snippet">Sort</span></div>';
  assert.deepEqual(parseDuckDuckGo(ddg).map(r => r.url), ['https://docs.example/sort']);
});

test('ranking retains distinct documents, rejects unrelated broad fallback and does not inject a directory', () => {
  const results = rankResults([{ source: 'bing', results: [item('https://example.com/watch?v=1'), item('https://example.com/watch?v=2'), { ...item('https://example.com/generic'), title: 'JavaScript', snippet: 'General introduction' }] }], 'javascript array sort');
  assert.equal(results.length, 2);
  assert.deepEqual(rankResults([{ source: 'bing', results: [item('https://example.com/')] }], 'počasie Rimavská Sobota'), []);
});

test('search uses disjoint pages from actual aggregated results and reports only existing next pages', async () => {
  const urls: URL[] = [];
  const fetcher: ServerFetch = async (url) => {
    const parsed = new URL(url); urls.push(parsed);
    if (parsed.hostname === 'html.duckduckgo.com') {
      return new Response(Array.from({ length: 23 }, (_, i) => `<div class="result"><a class="result__a" href="https://docs.example/sort/${i}">JavaScript array sort ${i}</a><span class="result__snippet">Comparator</span></div>`).join(''));
    }
    return new Response('');
  };
  const deps = { fetch: fetcher, overview: async () => null };
  const first = await searchWeb('javascript array sort', 1, {}, deps);
  const second = await searchWeb('javascript array sort', 2, {}, deps);
  const third = await searchWeb('javascript array sort', 3, {}, deps);
  assert.equal(first.results.length, 10); assert.equal(second.results.length, 10); assert.equal(third.results.length, 3);
  assert.equal(first.hasMore, true); assert.equal(second.hasMore, true); assert.equal(third.hasMore, false);
  assert.equal(second.results.filter(r => first.results.some(a => a.url === r.url)).length, 0);
  await searchWeb('počítače', 1, { safeSearch: false, region: 'cz', timeFilter: 'week' }, deps);
  const ddg = [...urls].reverse().find(url => url.hostname === 'html.duckduckgo.com')!;
  assert.equal(ddg.searchParams.get('q'), 'počítače');
  assert.equal(ddg.searchParams.get('kp'), '-2');
  assert.equal(ddg.searchParams.get('kl'), 'cz-cz');
  assert.equal(ddg.searchParams.get('df'), 'w');
});

test('provider failure is an error, never a Wikipedia-only or fabricated successful web fallback', async () => {
  await assert.rejects(searchWeb('Bratislava', 1, {}, { fetch: async () => { throw new Error('blocked'); }, overview: async () => null }), (error: any) => error.status === 502);
  await assert.rejects(searchWeb('Bratislava', 1, {}, { fetch: async () => { throw Object.assign(new Error('Tor unavailable'), { status: 503 }); }, overview: async () => null }), (error: any) => error.status === 503);
});
