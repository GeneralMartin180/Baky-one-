import assert from 'node:assert/strict';
import test from 'node:test';
import { searchWeb } from '../src/services/webSearchService.ts';

const organic = (start: number, count: number, host = (n: number) => `source${n}.example`) => Array.from({ length: count }, (_, i) => {
  const n = start + i;
  return `<article><h3><a href="https://${host(n)}/sensor/${n}">Quantum sensor research ${n}</a></h3><p>Quantum sensor experiments and measurements.</p></article>`;
}).join('');

test('sparse opening results are filled from actual subsequent pages with the same query and filters', async () => {
  const requests: Array<{ url: URL; timeout: number | undefined }> = [];
  const data = await searchWeb('quantum sensor', 1, { safeSearch: false, region: 'global' }, {
    overview: async () => null,
    fetch: async (input, options) => {
      const url = new URL(input);
      if (url.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      requests.push({ url, timeout: options?.timeoutMs });
      const from = Number(url.searchParams.get('from') || 0);
      return new Response(from ? organic(from, 10) : organic(0, 3));
    },
  });
  assert.equal(data.results.length, 10);
  assert.equal(data.hasMore, true);
  assert.deepEqual(requests.map(request => request.url.searchParams.get('from')), [null, '10', '20']);
  assert.ok(requests.every(request => request.url.searchParams.get('q') === 'quantum sensor' && request.url.searchParams.get('safe') === 'no'));
  assert.ok(requests.slice(1).every(request => request.timeout === 1800));
  assert.deepEqual(data.sources, ['seznam']);
});

test('dense single-domain results retrieve independent alternatives before choosing the first page', async () => {
  const offsets: number[] = [];
  const data = await searchWeb('quantum sensor', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      const url = new URL(input);
      if (url.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      const from = Number(url.searchParams.get('from') || 0);
      offsets.push(from);
      return new Response(from ? organic(from, 10) : organic(0, 12, () => 'one.example'));
    },
  });
  assert.deepEqual(offsets, [0, 10, 20]);
  assert.equal(data.results.length, 10);
  assert.ok(new Set(data.results.map(row => new URL(row.url).hostname)).size >= 5);
});

test('unrelated extra pages cannot pad results and supplemental work has a fixed bound', async () => {
  let calls = 0;
  const data = await searchWeb('quantum sensor', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      const url = new URL(input);
      if (url.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      calls++;
      return new Response(url.searchParams.has('from') ? organic(10, 10).replaceAll('Quantum sensor', 'Sports news') : organic(0, 1));
    },
  });
  assert.equal(calls, 5);
  assert.equal(data.results.length, 1);
  assert.equal(data.hasMore, false);
});

test('a failed supplemental page keeps valid opening results and does not claim more results', async () => {
  let calls = 0;
  const data = await searchWeb('quantum sensor', 1, {}, {
    overview: async () => null,
    fetch: async input => {
      const url = new URL(input);
      if (url.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      calls++;
      return url.searchParams.has('from') ? new Response('unavailable', { status: 503 }) : new Response(organic(0, 3));
    },
  });
  assert.equal(calls, 3);
  assert.equal(data.results.length, 3);
  assert.equal(data.hasMore, false);
  assert.equal(data.degraded, true);
});

test('pagination uses the same candidate pool even when a later provider page has a stronger result', async () => {
  const offsets: number[][] = [[], []];
  const get = (page: number) => searchWeb('quantum sensor', page, {}, {
    overview: async () => null,
    fetch: async input => {
      const url = new URL(input);
      if (url.hostname !== 'search.seznam.cz') return new Response('blocked', { status: 429 });
      const from = Number(url.searchParams.get('from') || 0);
      offsets[page - 1].push(from);
      return new Response(from ? organic(from, 10) : organic(0, 12));
    },
  });
  const first = await get(1);
  const second = await get(2);
  assert.deepEqual(offsets[0], offsets[1]);
  assert.deepEqual(offsets[0], [0]);
  assert.equal(first.results.length, 10);
  assert.equal(second.results.length, 2);
  assert.equal(second.hasMore, false);
  assert.ok(second.results.every(row => !first.results.some(prior => prior.url === row.url)));
});
