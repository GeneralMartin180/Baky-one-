import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import test from 'node:test';
import { serverFetch } from '../src/services/serverTransport.ts';

function directEnvironment(t: any) {
  const keys = ['TOR_PROXY_URL', 'SEARCH_NETWORK_MODE', 'PROXY_URL', 'HTTP_PROXY', 'HTTPS_PROXY'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];
  t.after(() => { for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; } });
}

test('public-image transport refuses publisher DNS resolving to private or mixed public/private addresses before fetching', async t => {
  directEnvironment(t);
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => { fetches++; throw new Error('No outbound request is allowed in this fixture'); });
  let addresses = [{ address: '127.0.0.1', family: 4 }];
  t.mock.method(dns, 'lookup', async () => addresses);
  for (const records of [
    [{ address: '127.0.0.1', family: 4 }],
    [{ address: '8.8.8.8', family: 4 }, { address: '169.254.169.254', family: 4 }],
    [{ address: '::ffff:127.0.0.1', family: 6 }],
    [{ address: 'fe80::1', family: 6 }],
  ]) {
    addresses = records;
    await assert.rejects(serverFetch('https://i.aktuality.sk/image.png', { publicAddressOnly: true, timeoutMs: 1000 }), (error: any) => error.status === 502);
  }
  assert.equal(fetches, 0);
});
