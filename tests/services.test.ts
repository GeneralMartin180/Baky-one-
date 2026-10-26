import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { fetchFufuImages, fetchYouTubeShorts, fetchYouTubeVideos, parseYouTubeResults } from '../src/services/fufuV12Scraper.ts';
import { scrapeNewsForQuery, scrapeTrendingNews } from '../src/services/newsScraper.ts';
import { fetchWikipediaSummary, isStrictWikiMatch } from '../src/services/wikipediaService.ts';
import { getNetworkStatus, isPublicAddress, serverFetch, setServerFetchForTests } from '../src/services/serverTransport.ts';
import type { SearchOptions } from '../src/services/searchOptions.ts';

const options: SearchOptions = { safeSearch: true, region: 'sk', timeFilter: 'anytime' };
afterEach(() => setServerFetchForTests(null));

function cleanNetworkEnvironment(t: any) {
  const names = ['TOR_PROXY_URL', 'PROXY_URL', 'HTTP_PROXY', 'HTTPS_PROXY', 'SEARCH_NETWORK_MODE'];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  t.after(() => { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } });
}

test('Wikipedia requires the complete title rather than another word with the same prefix', () => {
  assert.equal(isStrictWikiMatch('Java', 'JavaScript'), false);
  assert.equal(isStrictWikiMatch('Python', 'PythonAnywhere'), false);
  assert.equal(isStrictWikiMatch('Python', 'Python (programovací jazyk)'), true);
  assert.equal(isStrictWikiMatch('Česko', 'Cesko'), true);
});

test('Wikipedia fetches on every request and never retains pending or completed queries', async () => {
  let calls = 0;
  setServerFetchForTests(async () => { calls++; return Response.json({ type: 'standard', title: 'Java', extract: 'The programming language.' }); });
  assert.equal((await fetchWikipediaSummary('Java', options))?.title, 'Java');
  assert.equal((await fetchWikipediaSummary('Java', options))?.title, 'Java');
  assert.equal(calls, 2);
});

test('Wikipedia rejects unrelated search hits and disambiguation summaries', async () => {
  setServerFetchForTests(async (url) => String(url).includes('/w/api.php')
    ? Response.json({ query: { search: [{ title: 'JavaScript' }] } })
    : Response.json({ type: 'disambiguation', title: 'Java', extract: 'Ambiguous term.' }));
  assert.equal(await fetchWikipediaSummary('Java', options), null);
});

test('Wikipedia stops optional fallback work at a single whole-lookup deadline', async () => {
  let calls = 0;
  setServerFetchForTests(async (_url, init) => {
    calls++;
    await new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('deadline')), { once: true }));
    return Response.json({});
  });
  const keepAlive = setTimeout(() => {}, 2500);
  try {
    const started = Date.now();
    assert.equal(await fetchWikipediaSummary('Java', options), null);
    assert.equal(calls, 1, 'No additional language requests start after the lookup expires');
    assert.ok(Date.now() - started < 2400);
  } finally { clearTimeout(keepAlive); }
});

test('Image search sends SafeSearch, region and age to Bing and parses real records', async () => {
  let calls = 0;
  setServerFetchForTests(async (input) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.searchParams.get('adlt'), 'strict');
    assert.equal(url.searchParams.get('mkt'), 'cs-CZ');
    assert.equal(url.searchParams.get('qft'), '+filterui:age-lt1440');
    const fixture = { murl: 'https://images.example/photo.jpg', turl: 'https://images.example/thumb.jpg', purl: 'https://example.org/page', t: 'A real result' };
    return new Response(`<a class="iusc" m='${JSON.stringify(fixture)}'></a><a class="iusc" m='${JSON.stringify(fixture)}'></a><a class="iusc" m='{"murl":"javascript:alert(1)"}'></a>`);
  });
  const settings = { ...options, region: 'cz' as const, timeFilter: 'day' as const };
  const first = await fetchFufuImages('query', settings);
  assert.equal(first.length, 1);
  assert.equal(first[0].title, 'A real result');
  await fetchFufuImages('query', settings);
  assert.equal(calls, 2);
});

test('YouTube forwards restricted mode and date filters and only accepts actual Shorts', async () => {
  const ordinary = { videoId: 'ordinary001', title: { simpleText: 'My #shorts clip' }, lengthText: { simpleText: '0:30' } };
  const genuine = { videoId: 'realshort01', headline: { simpleText: 'Real Short' } };
  const fixture = { contents: { items: [{ videoRenderer: ordinary }, { reelItemRenderer: genuine }] } };
  let calls = 0;
  setServerFetchForTests(async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.context.user.enableSafetyMode, true);
    assert.equal(body.context.client.gl, 'CZ');
    assert.equal(body.params, 'EgIIAw==');
    return Response.json(fixture);
  });
  const settings = { ...options, region: 'cz' as const, timeFilter: 'week' as const };
  const shorts = await fetchYouTubeShorts('query', settings);
  assert.deepEqual(shorts.map((video) => video.videoId), ['realshort01']);
  assert.equal(shorts[0].duration, undefined);
  const videos = await fetchYouTubeVideos('query', settings);
  assert.equal(videos[0].url, 'https://www.youtube.com/watch?v=ordinary001');
  await fetchYouTubeShorts('query', settings);
  assert.equal(calls, 3);
  assert.deepEqual(parseYouTubeResults({ contents: { videoRenderer: ordinary } }, true), []);
});

test('News returns no results for a missing query or empty provider feed', async () => {
  let calls = 0;
  setServerFetchForTests(async (input) => {
    calls++;
    const url = new URL(input);
    assert.equal(url.pathname, '/rss/search');
    assert.equal(url.searchParams.get('q'), 'specific query when:7d');
    assert.equal(url.searchParams.get('ceid'), 'CZ:cs');
    return new Response('<rss><channel></channel></rss>');
  });
  assert.deepEqual(await scrapeNewsForQuery(''), []);
  assert.equal(calls, 0);
  assert.deepEqual(await scrapeNewsForQuery('specific query', { ...options, region: 'cz', timeFilter: 'week' }), []);
  assert.equal(calls, 1);
  await assert.rejects(scrapeTrendingNews('sports', options), { status: 400 });
});

test('News preserves real dates, rejects unsafe URLs and filters old stories', async () => {
  const date = new Date().toUTCString();
  setServerFetchForTests(async () => new Response(`<rss><channel>
    <item><title>Current story - Publisher</title><link>https://publisher.example/current</link><pubDate>${date}</pubDate><description><![CDATA[<b>Real description</b>]]></description></item>
    <item><title>Old</title><link>https://publisher.example/old</link><pubDate>Mon, 01 Jan 2001 00:00:00 GMT</pubDate></item>
    <item><title>Unsafe</title><link>javascript:alert(1)</link><pubDate>${date}</pubDate></item>
  </channel></rss>`));
  const results = await scrapeNewsForQuery('topic', { ...options, timeFilter: 'day' });
  assert.equal(results.length, 1);
  assert.equal(results[0].snippet, 'Real description');
  assert.equal(results[0].source, 'Publisher');
  assert.equal(results[0].publishedAt, new Date(date).toISOString());
});

test('Transport rejects oversized streamed bodies and retains the deadline after headers', async (t) => {
  cleanNetworkEnvironment(t);
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(5)); controller.close(); } })));
  await assert.rejects(serverFetch('https://example.test', { maxBytes: 4 }), { status: 502 });
  t.mock.restoreAll();
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream({ start() { /* Body never completes. */ } })));
  const started = Date.now();
  await assert.rejects(serverFetch('https://example.test', { timeoutMs: 30 }), { status: 503 });
  assert.ok(Date.now() - started < 500);
});

test('Transport fails closed for missing Tor and hides proxy credentials', async (t) => {
  cleanNetworkEnvironment(t);
  let directCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { directCalls++; return new Response('leak'); });
  process.env.SEARCH_NETWORK_MODE = 'tor_socks';
  assert.deepEqual(getNetworkStatus(), { mode: 'tor_socks', configured: false });
  await assert.rejects(serverFetch('https://example.test'), { status: 503 });
  process.env.TOR_PROXY_URL = 'https://user:fixture-secret@proxy.invalid';
  await assert.rejects(serverFetch('https://example.test'), (error: any) => error.status === 503 && !error.message.includes('fixture-secret'));
  assert.equal(directCalls, 0);
  assert.equal(JSON.stringify(getNetworkStatus()).includes('fixture-secret'), false);
});

test('Public address policy rejects private, mapped, link-local and special ranges', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '100.64.0.1', '192.168.1.1', '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
});

test('Public-only requests reject internal destinations before opening any connection', async (t) => {
  cleanNetworkEnvironment(t);
  let fetchCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetchCalls++; return new Response('unexpected'); });
  await assert.rejects(serverFetch('http://127.0.0.1:12345/private', { publicAddressOnly: true }), { status: 502 });
  assert.equal(fetchCalls, 0);
});

test('Default redirects are refused; callers can explicitly inspect a manual redirect', async (t) => {
  cleanNetworkEnvironment(t);
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests++;
    response.writeHead(302, { Location: 'http://127.0.0.1:12345/private' }); response.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${(server.address() as net.AddressInfo).port}`;
  await assert.rejects(serverFetch(url), { status: 502 });
  assert.equal(requests, 1);
  const response = await serverFetch(url, { redirect: 'manual' });
  assert.equal(response.status, 302);
  assert.equal(requests, 2);
});

test('SOCKS transport actually uses the proxy and resolves destination DNS remotely', async (t) => {
  cleanNetworkEnvironment(t);
  let destination = '';
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let stage = 0;
    let pending = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      if (stage === 0 && pending.length >= 2 + pending[1]) { pending = pending.subarray(2 + pending[1]); socket.write(Buffer.from([5, 0])); stage = 1; }
      if (stage === 1 && pending.length >= 5 && pending.length >= 7 + pending[4]) {
        assert.equal(pending[3], 3, 'SOCKS request carries hostname rather than locally resolved IP');
        destination = pending.subarray(5, 5 + pending[4]).toString();
        pending = pending.subarray(7 + pending[4]);
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 80])); stage = 2;
      }
      if (stage === 2 && pending.includes('\r\n\r\n')) { stage = 3; socket.end('HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied'); }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); server.close(); });
  const port = (server.address() as net.AddressInfo).port;
  process.env.TOR_PROXY_URL = `socks5://127.0.0.1:${port}`;
  const response = await serverFetch('http://upstream.invalid/resource', { timeoutMs: 2000 });
  assert.equal(await response.text(), 'proxied');
  assert.equal(destination, 'upstream.invalid');
});

test('HTTP proxy authentication is sent only to the configured proxy', async (t) => {
  cleanNetworkEnvironment(t);
  let authorization = '';
  const sockets = new Set<net.Socket>();
  const proxy = http.createServer((request, response) => {
    authorization = String(request.headers['proxy-authorization'] || '');
    assert.equal(request.url, 'http://upstream.invalid/resource');
    response.end('proxied');
  });
  proxy.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  proxy.on('connect', (request, socket) => {
    authorization = String(request.headers['proxy-authorization'] || '');
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    socket.once('data', () => socket.end('HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied'));
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); proxy.close(); });
  process.env.PROXY_URL = `http://user:fixture-secret@127.0.0.1:${(proxy.address() as net.AddressInfo).port}`;
  const response = await serverFetch('http://upstream.invalid/resource', { timeoutMs: 2000 });
  assert.equal(await response.text(), 'proxied');
  assert.equal(authorization, `Basic ${Buffer.from('user:fixture-secret').toString('base64')}`);
});
