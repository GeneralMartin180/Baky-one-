import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchNewsImage, ImageProxyError, MAX_IMAGE_BYTES } from '../src/services/imageProxy.ts';
import { setServerFetchForTests } from '../src/services/serverTransport.ts';

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

test('image proxy uses the shared transport with pinned public DNS, no redirects and a body limit', async () => {
  let requests = 0;
  setServerFetchForTests(async (url, options) => {
    requests++;
    assert.equal(String(url), 'https://i.aktuality.sk/image.png');
    assert.equal(options?.publicAddressOnly, true);
    assert.equal(options?.redirect, 'error');
    assert.equal(options?.maxBytes, MAX_IMAGE_BYTES);
    assert.equal(options?.timeoutMs, 6000);
    return new Response(png, { headers: { 'Content-Type': 'image/png' } });
  });
  try {
    const image = await fetchNewsImage('https://i.aktuality.sk/image.png');
    assert.equal(requests, 1);
    assert.equal(image.contentType, 'image/png');
    assert.deepEqual(image.body, png);
    await assert.rejects(fetchNewsImage('http://127.0.0.1/admin'));
    assert.equal(requests, 1, 'blocked hosts must never reach a transport');
  } finally { setServerFetchForTests(null); }
});

test('HTML, SVG, a private redirect and oversized upstream bodies are rejected', async () => {
  for (const response of [
    () => new Response('<html><script>bad()</script></html>', { headers: { 'Content-Type': 'text/html' } }),
    () => new Response('<svg><script>bad()</script></svg>', { headers: { 'Content-Type': 'image/svg+xml' } }),
    () => new Response('<html>forged</html>', { headers: { 'Content-Type': 'image/png' } }),
    () => new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/admin' } }),
    () => new Response(png, { headers: { 'Content-Type': 'image/png', 'Content-Length': String(MAX_IMAGE_BYTES + 1) } }),
    () => new Response(new Uint8Array(MAX_IMAGE_BYTES + 1), { headers: { 'Content-Type': 'image/png' } }),
  ]) {
    setServerFetchForTests(async () => response());
    try { await assert.rejects(fetchNewsImage('https://i.aktuality.sk/image.png'), ImageProxyError); }
    finally { setServerFetchForTests(null); }
  }
});
