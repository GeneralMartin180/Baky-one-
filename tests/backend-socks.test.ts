import assert from 'node:assert/strict';
import { once } from 'node:events';
import net from 'node:net';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { serverFetch } from '../src/services/serverTransport.ts';

const environmentKeys = ['TOR_PROXY_URL', 'SEARCH_NETWORK_MODE', 'PROXY_URL', 'HTTP_PROXY', 'HTTPS_PROXY'] as const;

async function withSocksFixture(mode: 'success' | 'stalled-body' | 'gzip-limit', run: (fixture: { proxy: string; hostnames: string[]; requests: string[] }) => Promise<void>) {
  const saved = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  for (const key of environmentKeys) delete process.env[key];
  const sockets = new Set<net.Socket>();
  const hostnames: string[] = [];
  const requests: string[] = [];
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let pending = Buffer.alloc(0);
    let stage = 0;
    socket.on('data', chunk => {
      pending = Buffer.concat([pending, chunk]);
      if (stage === 0) {
        if (pending.length < 2 || pending.length < 2 + pending[1]) return;
        assert.equal(pending[0], 5);
        pending = pending.subarray(2 + pending[1]);
        socket.write(Buffer.from([5, 0]));
        stage = 1;
      }
      if (stage === 1) {
        if (pending.length < 5) return;
        // Domain address mode proves destination resolution happens at the proxy.
        assert.equal(pending[3], 3);
        const length = pending[4];
        if (pending.length < 7 + length) return;
        hostnames.push(pending.subarray(5, 5 + length).toString());
        pending = pending.subarray(7 + length);
        socket.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]));
        stage = 2;
      }
      if (stage === 2 && pending.includes('\r\n\r\n')) {
        requests.push(pending.toString());
        stage = 3;
        if (mode === 'stalled-body') {
          socket.write('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 7\r\nConnection: close\r\n\r\n');
        } else if (mode === 'gzip-limit') {
          const body = gzipSync(Buffer.alloc(20_000, 97));
          socket.end(Buffer.concat([Buffer.from(`HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Encoding: gzip\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`), body]));
        } else {
          socket.end('HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied');
        }
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const proxy = `socks5://127.0.0.1:${address.port}`;
  process.env.TOR_PROXY_URL = proxy;
  try { await run({ proxy, hostnames, requests }); }
  finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of environmentKeys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

test('SOCKS transport uses remote DNS and forwards a real HTTP request without native fetch', async () => {
  await withSocksFixture('success', async fixture => {
    const response = await serverFetch('http://search.fixture.invalid/results?q=private', { timeoutMs: 1000 });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'proxied');
    assert.deepEqual(fixture.hostnames, ['search.fixture.invalid']);
    assert.match(fixture.requests[0], /^GET \/results\?q=private HTTP\/1\.1/);
    assert.ok(!fixture.requests[0].includes(fixture.proxy));
  });
});

test('SOCKS deadline covers a body stalled after successful headers', async () => {
  await withSocksFixture('stalled-body', async () => {
    const started = Date.now();
    await assert.rejects(serverFetch('http://search.fixture.invalid/stalled', { timeoutMs: 80 }), (error: any) => error.status === 503);
    assert.ok(Date.now() - started < 1500);
  });
});

test('SOCKS response limit applies to decompressed bytes', async () => {
  await withSocksFixture('gzip-limit', async () => {
    await assert.rejects(serverFetch('http://search.fixture.invalid/compressed', { timeoutMs: 1000, maxBytes: 128 }), (error: any) => error.status === 502);
  });
});

test('image proxy public-DNS policy fails closed under SOCKS and sends no connection', async () => {
  await withSocksFixture('success', async fixture => {
    await assert.rejects(serverFetch('https://i.aktuality.sk/image.png', { publicAddressOnly: true, timeoutMs: 1000 }), (error: any) => error.status === 503);
    assert.deepEqual(fixture.hostnames, []);
  });
});
