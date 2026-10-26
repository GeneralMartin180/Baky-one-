import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp, type ApiServices } from '../src/serverApp.ts';
import { ApiInputError, readPage, readQuery, readSearchOptions } from '../src/services/apiValidation.ts';
import { hasExpectedImageSignature, validateNewsImageUrl } from '../src/services/imageProxy.ts';

async function withApi(overrides: Partial<ApiServices>, run: (base: string) => Promise<void>) {
  const server = createApp(overrides).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function emptyServices(): Partial<ApiServices> {
  return {
    searchWeb: async () => ({ results: [], overview: null, hasMore: false, elapsedMs: 1 }),
    images: async () => [], videos: async () => [], shorts: async () => [], news: async () => [], trending: async () => [],
    clearLocalSession: () => {}, networkStatus: () => ({ mode: 'direct', configured: false }),
  };
}

test('query/options validation rejects arrays, object values, long input and unsupported filters', () => {
  for (const q of [['one', 'two'], { nested: 'value' }, 'x'.repeat(513), 'one\u0000two']) {
    assert.throws(() => readQuery(q), ApiInputError);
  }
  for (const page of ['0', '-1', '1.5', '1abc', '101', ['2']]) assert.throws(() => readPage(page), ApiInputError);
  for (const options of [{ safeSearch: 'maybe' }, { safeSearch: ['1'] }, { region: 'private' }, { time: 'year' }, { time: 'day', timeFilter: 'week' }]) {
    assert.throws(() => readSearchOptions(options), ApiInputError);
  }
  assert.deepEqual(readSearchOptions({ safeSearch: '0', region: 'cz', time: 'week' }), { safeSearch: false, region: 'cz', timeFilter: 'week' });
  assert.deepEqual(readSearchOptions({ safeSearch: 'true', timeFilter: 'day' }), { safeSearch: true, region: 'sk', timeFilter: 'day' });
});

test('malformed query strings return HTTP400 promptly without invoking upstream services', async () => {
  let requests = 0;
  await withApi({ ...emptyServices(), searchWeb: async () => { requests++; throw new Error('must not execute'); } }, async base => {
    for (const path of ['/api/search?q=a&q=b', '/api/search?q[x]=a', '/api/search?q=test&page=1000', '/api/search?q=test&safeSearch=no', '/api/images?q=a&q=b', '/api/videos?q=a&q=b', '/api/shorts?q=a&q=b', '/api/news?q=a&q=b', '/api/trending?cat=a&cat=b']) {
      const response = await fetch(base + path, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 400, path);
      assert.equal((await response.json()).code, 'INVALID_INPUT');
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    }
    assert.equal(requests, 0);
  });
});

test('shared handlers forward validated options and pagination, with cache prevention on every query endpoint', async () => {
  const received: Array<{ query?: string; options: any; page?: number }> = [];
  const media = async (query: string, options: any) => { received.push({ query, options }); return []; };
  await withApi({ ...emptyServices(), images: media, videos: media, shorts: media, news: media, trending: media,
    searchWeb: async (query, page, options) => { received.push({ query, page, options }); return { results: [], overview: null, hasMore: true, elapsedMs: 12 }; },
  }, async base => {
    for (const path of ['search', 'images', 'videos', 'shorts', 'news', 'trending']) {
      const response = await fetch(`${base}/api/${path}?q=hello&page=2&safeSearch=0&region=cz&time=week`);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('cache-control') ?? '', /no-store/);
      assert.equal(response.headers.get('cdn-cache-control'), 'no-store');
      const data = await response.json();
      if (path === 'search') { assert.equal(data.page, 2); assert.equal(data.hasMore, true); assert.equal(data.elapsedMs, 12); }
    }
    assert.equal(received.length, 6);
    for (const call of received) {
      assert.equal(call.options.safeSearch, false);
      assert.equal(call.options.region, 'cz');
      assert.equal(call.options.timeFilter, 'week');
      assert.ok(call.options.signal instanceof AbortSignal);
    }
  });
});

test('upstream failures are HTTP502, network configuration failures HTTP503, with no internal error or query leakage', async () => {
  for (const status of [502, 503]) {
    await withApi({ ...emptyServices(), searchWeb: async () => { throw Object.assign(new Error('secret-proxy-password-and-query'), { status }); } }, async base => {
      const response = await fetch(`${base}/api/search?q=private`);
      assert.equal(response.status, status);
      assert.ok(!(await response.text()).includes('secret-proxy-password-and-query'));
    });
  }
});

test('removed global network mutations return410 and status responses never expose proxy credentials', async () => {
  const networkStatus = () => ({ mode: 'tor_socks', configured: true, url: 'socks5://user:secret@localhost:9050' });
  await withApi({ ...emptyServices(), networkStatus }, async base => {
    for (const path of ['fufu-mutate', 'fufu-mode', 'fufu-download-proxies', 'fufu-rotate-proxy']) {
      const response = await fetch(`${base}/api/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"mode":"direct"}' });
      assert.equal(response.status, 410);
    }
    for (const path of ['health', 'fufu-status']) {
      const response = await fetch(`${base}/api/${path}`);
      const text = await response.text();
      assert.ok(!text.includes('secret'));
      assert.ok(!text.includes('socks5://'));
      assert.deepEqual(JSON.parse(text).network, { mode: 'tor_socks', configured: true });
    }
  });
});

test('session reset describes only its local best-effort scope and unsupported methods return405', async () => {
  let resets = 0;
  await withApi({ ...emptyServices(), clearLocalSession: () => { resets++; } }, async base => {
    const response = await fetch(`${base}/api/clear-session`, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).scope, 'local-instance');
    assert.equal(resets, 1);
    assert.equal((await fetch(`${base}/api/search?q=test`, { method: 'POST' })).status, 405);
  });
});

test('news image URL allowlist blocks SSRF, credential tricks, arbitrary subdomains and redirect targets', () => {
  for (const url of ['http://127.0.0.1/admin', 'https://127.0.0.1/image', 'https://[::1]/image', 'https://2130706433/image', 'https://localhost/image', 'file:///etc/passwd', 'https://evil.example/image', 'https://i.aktuality.sk.evil.example/image', 'https://evil.i.aktuality.sk/image', 'https://i.aktuality.sk@127.0.0.1/image', 'https://user:secret@i.aktuality.sk/image', 'https://i.aktuality.sk:8443/image']) {
    assert.throws(() => validateNewsImageUrl(url), ApiInputError, url);
  }
  assert.equal(validateNewsImageUrl('https://i.aktuality.sk/image.jpg').hostname, 'i.aktuality.sk');
});

test('proxy only accepts matching raster signatures and rejects HTML/SVG even with forged MIME', () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(hasExpectedImageSignature(png, 'image/png'), true);
  assert.equal(hasExpectedImageSignature(png, 'image/jpeg'), false);
  assert.equal(hasExpectedImageSignature(Buffer.from('<script>alert(1)</script>'), 'image/png'), false);
  assert.equal(hasExpectedImageSignature(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'image/svg+xml'), false);
});
