import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/serverApp.ts';
import { fetchMarketQuotes, parseMarketQuote } from '../src/services/marketService.ts';
import { setServerFetchForTests } from '../src/services/serverTransport.ts';

afterEach(() => setServerFetchForTests(null));

function chart(meta: Record<string, unknown>) {
  return { chart: { result: [{ meta: { symbol: 'MSFT', currency: 'USD', regularMarketPrice: 524.51, regularMarketTime: 1792785601, range: '1d', chartPreviousClose: 521.08, ...meta } }], error: null } };
}

test('market parser preserves provider price, daily change, and actual quote time, including a previous session', () => {
  const parsed = parseMarketQuote(chart({ regularMarketChangePercent: 0.658 }), 'MSFT');
  assert.equal(parsed.status, 'available');
  assert.equal(parsed.price, 524.51);
  assert.equal(parsed.changePercent, 0.658);
  assert.equal(parsed.updatedAt, new Date(1792785601 * 1000).toISOString());
  assert.equal(parsed.label, 'Microsoft');
  assert.equal(parsed.kind, 'stock');
  assert.equal(parseMarketQuote(chart({ regularMarketChangePercent: 0 }), 'MSFT').changePercent, 0);
  assert.equal(parseMarketQuote(chart({ symbol: '^GSPC', regularMarketPrice: 7600, regularMarketChangePercent: -0.51 }), '^GSPC').kind, 'index');
});

test('daily change fallback uses a daily previous close and never mistakes a five-day change for a daily change', () => {
  assert.ok(Math.abs(parseMarketQuote(chart({}), 'MSFT').changePercent! - ((524.51 / 521.08 - 1) * 100)) < 1e-8);
  assert.equal(parseMarketQuote(chart({ range: '5d', chartPreviousClose: 500 }), 'MSFT').changePercent, null);
  assert.equal(parseMarketQuote(chart({ chartPreviousClose: null }), 'MSFT').changePercent, null);
  assert.equal(parseMarketQuote(chart({ previousClose: 0, chartPreviousClose: 0 }), 'MSFT').changePercent, null);
});

test('malformed, mismatched and provider-error market fixtures produce unavailable data rather than zero or fake quotes', () => {
  for (const value of [null, {}, { chart: { result: [], error: null } }, { chart: { error: { description: 'Rate limited' } } },
    chart({ symbol: '^IXIC' }), chart({ regularMarketPrice: '524.51' }), chart({ regularMarketPrice: null }),
    chart({ regularMarketPrice: -1 }), chart({ regularMarketPrice: Infinity }), chart({ regularMarketTime: 0 }),
    chart({ regularMarketTime: 1e30 }), chart({ currency: '<USD>' })]) {
    const parsed = parseMarketQuote(value, 'MSFT');
    assert.equal(parsed.status, 'unavailable');
    assert.equal(parsed.price, null);
    assert.equal(parsed.changePercent, null);
    assert.equal(parsed.updatedAt, null);
  }
});

test('market quote feed preserves available cards when another provider response is blocked or malformed', async () => {
  const requested: string[] = [];
  setServerFetchForTests(async (input) => {
    const url = new URL(input);
    requested.push(decodeURIComponent(url.pathname.split('/').at(-1)!));
    assert.equal(url.hostname, 'query1.finance.yahoo.com');
    if (url.pathname.endsWith('MSFT')) return Response.json(chart({ regularMarketChangePercent: 0.658 }));
    if (url.pathname.endsWith('%5EGSPC')) return new Response('Rate limited', { status: 429 });
    return new Response('<html>Provider challenge</html>', { headers: { 'Content-Type': 'text/html' } });
  });
  const snapshot = await fetchMarketQuotes();
  assert.deepEqual(requested.sort(), ['MSFT', '^GSPC', '^IXIC']);
  assert.equal(snapshot.quotes.length, 3);
  assert.equal(snapshot.quotes[0].price, 524.51);
  assert.equal(snapshot.quotes[1].price, null);
  assert.equal(snapshot.quotes[2].price, null);
  assert.deepEqual(snapshot.unavailable, ['^GSPC', '^IXIC']);
  assert.equal(snapshot.degraded, true);
  assert.equal(snapshot.informational, true);
});

test('all failed market requests return three honest unavailable cards without leaking network errors', async () => {
  setServerFetchForTests(async () => { throw Object.assign(new Error('fixture-secret-network-url'), { status: 503 }); });
  const snapshot = await fetchMarketQuotes();
  assert.deepEqual(snapshot.unavailable, ['MSFT', '^GSPC', '^IXIC']);
  assert.ok(snapshot.quotes.every(quote => quote.status === 'unavailable' && quote.price === null));
  assert.ok(!JSON.stringify(snapshot).includes('fixture-secret'));
});

test('market endpoint sends no-store headers and ignores arbitrary destinations supplied in query parameters', async () => {
  let calls = 0;
  setServerFetchForTests(async (input) => { calls++; assert.equal(new URL(input).hostname, 'query1.finance.yahoo.com'); return Response.json({ chart: { error: { code: 'Unavailable' } } }); });
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(`${base}/api/markets?url=http://127.0.0.1/admin&symbol=OTHER`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(response.headers.get('vercel-cdn-cache-control'), 'no-store');
    assert.deepEqual((await response.json()).unavailable, ['MSFT', '^GSPC', '^IXIC']);
    assert.equal(calls, 3);
    assert.equal((await fetch(`${base}/api/markets`, { method: 'POST' })).status, 405);
    assert.equal(calls, 3);
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
