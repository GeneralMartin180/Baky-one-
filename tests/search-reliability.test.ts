import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSeznam, rankResults, searchWeb } from '../src/services/webSearchService.ts';
import type { SearchResult } from '../src/types.ts';

const result = (title: string, url: string, snippet = ''): SearchResult => ({ id: url, title, url, displayUrl: url, snippet });
const organic = '<article><h3><a href="https://www.nasa.gov/mission/artemis-ii/">NASA Artemis II</a></h3><p>NASA Artemis lunar mission.</p></article>';
const empty = '<div><h3>Bohužel jsem nic nenašel</h3><p>Překontrolujte zadaný dotaz</p></div>';

test('Slovak queries retain Czech subject inflections and cooking results', () => {
  assert.equal(rankResults([{ source: 'seznam', results: [result('Notebooky | Alza.cz', 'https://www.alza.cz/notebooky/18842920.htm')] }], 'kde kúpiť notebook').length, 1);
  assert.equal(rankResults([{ source: 'seznam', results: [result('Rýže recept. Jak uvařit sypkou rýži.', 'https://www.youtube.com/watch?v=rice')] }], 'ako uvariť ryžu').length, 1);
  assert.equal(rankResults([{ source: 'seznam', results: [result('Fotbalové live výsledky, livescore', 'https://www.livesport.cz/')] }], 'futbal výsledky').length, 1);
  assert.equal(rankResults([{ source: 'seznam', results: [result('Počasí Bratislava', 'https://weather.example/bratislava')] }], 'počasie Bratislava').length, 1);
});

test('short brand tokens use complete words, not accidental substrings in unrelated results', () => {
  const irrelevant = result('Baky: Boss battles', 'https://games.example/baky', 'Someone shows a boss fight.');
  assert.deepEqual(rankResults([{ source: 'seznam', results: [irrelevant] }], 'baky os'), []);
  assert.deepEqual(rankResults([{ source: 'seznam', results: [irrelevant] }], 'baky one'), []);
});

test('whole joined brand names keep Space X results without matching unrelated short words', () => {
  const spacex = result('SpaceX', 'https://www.spacex.com/', 'Rockets and spacecraft.');
  const youtube = result('YouTube', 'https://www.youtube.com/');
  assert.deepEqual(rankResults([{ source: 'seznam', results: [spacex] }], 'space x'), [spacex]);
  assert.deepEqual(rankResults([{ source: 'bing', results: [youtube] }], 'you tube'), [youtube]);
  assert.deepEqual(rankResults([{ source: 'seznam', results: [result('Space exploration', 'https://space.example/')] }], 'space x'), []);
});

test('verified provider typo corrections retain real results and expose the actual searched phrase', async () => {
  for (const [query, corrected, title, url] of [
    ['yutubez', 'youtube', 'YouTube', 'https://www.youtube.com/'],
    ['yutube', 'youtube', 'YouTube', 'https://www.youtube.com/'],
    ['space x', 'spacex', 'SpaceX', 'https://www.spacex.com/'],
    ['bratilsava', 'bratislava', 'Bratislava', 'https://www.bratislava.sk/'],
    ['microsfot windows', 'microsoft windows', 'Microsoft Windows', 'https://www.microsoft.com/windows'],
    ['pocsaie bratislava', 'počasí bratislava', 'Počasí Bratislava', 'https://weather.example/bratislava'],
  ]) {
    const requested: URL[] = [];
    const data = await searchWeb(query, 1, { safeSearch: false, region: 'cz' }, {
      overview: async () => null,
      fetch: async input => {
        const request = new URL(input); requested.push(request);
        if (request.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
        return new Response(`<h3>Hledali jsme <a data-e-a="accept" href="?q=${encodeURIComponent(corrected)}">${corrected}</a></h3><article><h3><a href="${url}">${title}</a></h3><p>${title} official website.</p></article>`);
      },
    });
    assert.equal(data.results[0]?.url, url, query);
    assert.equal(data.correctedQuery, corrected, query);
    assert.ok(requested.every(request => request.searchParams.get('q') === query), 'correction must not add a second network search');
    assert.equal(requested.find(request => request.hostname === 'search.seznam.cz')?.searchParams.get('safe'), 'no');
  }
});

test('unrelated advertised corrections cannot replace an original topic or site scope', () => {
  const unrelated = result('YouTube', 'https://www.youtube.com/');
  assert.deepEqual(rankResults([{ source: 'seznam', correctedQuery: 'youtube', results: [unrelated] }], 'microsfot windows'), []);
  assert.deepEqual(rankResults([{ source: 'seznam', correctedQuery: 'youtube', results: [unrelated] }], 'site:github.com yutube'), []);
  const wrongVersion = result('Microsoft Windows 11', 'https://www.microsoft.com/windows-11');
  assert.deepEqual(rankResults([{ source: 'seznam', correctedQuery: 'windows 11', results: [wrongVersion] }], 'windows 12'), []);
});

test('correction and related-query headings never become organic search results', () => {
  const html = '<section><h3>Lidé také hledají</h3><p>Local company</p><a href="https://www.firmy.cz/detail/123">Company</a></section><section><h3>Hledali jsme <a data-e-a="accept" href="?q=youtube">youtube</a></h3></section><article><h3><a href="https://www.youtube.com/">YouTube</a></h3><p>Videos.</p></article>';
  assert.deepEqual(parseSeznam(html).map(item => item.url), ['https://www.youtube.com/']);
});

test('a discarded correction cannot label a duplicate result won by another source', async () => {
  const data = await searchWeb('yutubez', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      const host = new URL(input).hostname;
      if (host === 'html.duckduckgo.com') return new Response('<div class="result"><a class="result__a" href="https://www.youtube.com/">Yutubez</a><p class="result__snippet">Exact submitted name.</p></div>');
      if (host === 'search.seznam.cz') return new Response('<h3>Hledali jsme <a data-e-a="accept" href="?q=youtuber">youtuber</a></h3><article><h3><a href="https://www.youtube.com/">YouTube</a></h3><p>Videos.</p></article>');
      return new Response('blocked', { status: 429 });
    },
  });
  assert.equal(data.results[0]?.title, 'Yutubez');
  assert.equal(data.correctedQuery, undefined);
});

test('baky os can return its verified live official page when public search providers are blocked', async () => {
  let siteRequests = 0;
  const data = await searchWeb('baky os', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      if (new URL(input).hostname !== 'www.bakyos.com') return new Response('blocked', { status: 429 });
      siteRequests++;
      return new Response('<html><head><title>Baky OS | Technologický ekosystém</title><meta name="description" content="Baky OS prepája aplikácie a digitálne služby."></head><body><h1>Baky OS</h1></body></html>', { headers: { 'content-type': 'text/html' } });
    },
  });
  assert.equal(siteRequests, 1);
  assert.equal(data.results.length, 1);
  assert.equal(data.results[0].url, 'https://www.bakyos.com/');
  assert.match(data.results[0].snippet, /prepája aplikácie/);
  assert.ok(data.sources.includes('known-sites'));
});

test('Seznam generated sponsored families are excluded without discarding following organic results', () => {
  const html = '<div data-e-b-z="main"><div><div data-e-b-n="paid~a"><h3>Sponzorované výsledky</h3><div><h3><a href="https://paid.example/one">Notebook offer</a></h3><p>Paid.</p></div></div></div><div><div data-e-b-n="paid~b"><h3><a href="https://paid.example/two">Another notebook offer</a></h3><p>Paid.</p></div></div><div><div data-e-b-n="organic~a"><h3><a href="https://store.example/notebooky">Notebooky</a></h3><p>Real organic listing.</p></div></div></div>';
  assert.deepEqual(parseSeznam(html).map(item => item.url), ['https://store.example/notebooky']);
});

test('global search includes the independent fallback but time-filtered search never silently relaxes its filter', async () => {
  const urls: URL[] = [];
  const fetcher = async (input: string | URL) => {
    const url = new URL(input); urls.push(url);
    return url.hostname === 'search.seznam.cz' ? new Response(organic) : new Response('challenge-form', { status: 429 });
  };
  const data = await searchWeb('NASA Artemis', 1, { region: 'global' }, { fetch: fetcher, overview: async () => null });
  assert.equal(data.results.length, 1);
  assert.ok(data.sources.includes('seznam'));
  urls.length = 0;
  await assert.rejects(searchWeb('NASA Artemis', 1, { region: 'global', timeFilter: 'day' }, { fetch: fetcher, overview: async () => null }), (error: any) => error.status === 502);
  assert.ok(!urls.some(url => url.hostname === 'search.seznam.cz'));
});

test('one bounded fallback retry recovers a transient provider error', async () => {
  let attempts = 0;
  const timeouts: number[] = [];
  const data = await searchWeb('NASA Artemis', 1, {}, {
    overview: async () => null,
    fetch: async (input, options) => {
      if (new URL(input).hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      attempts++; timeouts.push(options!.timeoutMs!);
      return attempts === 1 ? new Response('unavailable', { status: 503 }) : new Response(organic);
    },
  });
  assert.equal(data.results.length, 1);
  assert.equal(attempts, 2);
  assert.deepEqual(timeouts, [3400, 1800]);
});

test('explicit no-results response is successful and is not retried, unknown empty body is unavailable', async () => {
  let attempts = 0;
  const data = await searchWeb('unfindable query', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      if (new URL(input).hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      attempts++;
      return new Response(empty);
    },
  });
  assert.equal(data.results.length, 0);
  assert.equal(attempts, 1);
  await assert.rejects(searchWeb('NASA Artemis', 1, {}, { overview: async () => null, fetch: async () => new Response('') }), (error: any) => error.status === 502);
});
