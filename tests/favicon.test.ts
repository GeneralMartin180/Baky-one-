import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchFavicon } from '../src/services/faviconService.ts';
import { setServerFetchForTests } from '../src/services/serverTransport.ts';
import { ApiInputError } from '../src/services/apiValidation.ts';
import { ImageProxyError } from '../src/services/imageProxy.ts';

test('favicons use a fixed provider, only a domain, pinned DNS and verified raster bytes', async () => {
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  setServerFetchForTests(async (url, options) => {
    assert.equal(String(url), 'https://icons.duckduckgo.com/ip3/developer.mozilla.org.ico');
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.publicAddressOnly, true);
    assert.equal(options?.maxBytes, 128 * 1024);
    return new Response(png, { headers: { 'Content-Type': 'image/x-icon' } });
  });
  try {
    const image = await fetchFavicon('developer.mozilla.org');
    assert.equal(image.contentType, 'image/png');
    assert.deepEqual(image.body, png);
  } finally { setServerFetchForTests(null); }
});

test('favicon input cannot supply a URL, credentials, path, IP or repeated parameter', async () => {
  let requests = 0;
  setServerFetchForTests(async () => { requests++; throw new Error('must not execute'); });
  try {
    for (const host of [undefined, ['a.com', 'b.com'], 'https://a.com', 'a.com/path', 'user@a.com', '127.0.0.1', 'localhost', 'a.local', 'a.localhost', '', 'x'.repeat(254), '-a.com']) {
      await assert.rejects(fetchFavicon(host), ApiInputError);
    }
    assert.equal(requests, 0);
  } finally { setServerFetchForTests(null); }
});

test('favicon provider HTML, SVG, redirects, invalid signatures and large bodies are rejected', async () => {
  for (const makeResponse of [
    () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('<svg><script/></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    () => new Response('<script/>', { headers: { 'Content-Type': 'image/png' } }),
    () => new Response(null, { status: 302, headers: { Location: 'http://localhost/' } }),
    () => new Response(new Uint8Array(128 * 1024 + 1), { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    setServerFetchForTests(async () => makeResponse());
    try { await assert.rejects(fetchFavicon('example.com'), ImageProxyError); }
    finally { setServerFetchForTests(null); }
  }
});
