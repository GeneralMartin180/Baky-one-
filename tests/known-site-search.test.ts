import test from 'node:test';
import assert from 'node:assert/strict';
import { hasKnownSiteMatch, searchKnownSites } from '../src/services/knownSiteSearch.ts';
import type { SearchOptions } from '../src/services/searchOptions.ts';
import type { ServerFetch } from '../src/services/serverTransport.ts';

const options: SearchOptions = { safeSearch: true, region: 'sk', timeFilter: 'anytime' };
const html = (body: string, init: ResponseInit = {}) => new Response(body, { ...init, headers: { 'content-type': 'text/html; charset=utf-8', ...init.headers } });

test('Known sites returns only the live title, description and validated canonical of the named app', async () => {
  const controller = new AbortController();
  const calls: string[] = [];
  const fetcher: ServerFetch = async (input, request) => {
    calls.push(String(input));
    assert.equal(request?.signal, controller.signal);
    assert.equal(request?.publicAddressOnly, true);
    assert.equal(request?.redirect, 'error');
    assert.ok(request!.timeoutMs! <= 1800);
    assert.ok(request!.maxBytes! <= 1_000_000);
    return html('<title>Baky OS | Live title from current page</title><meta name="description" content="Current factual description supplied by the live website."><link rel="canonical" href="/official?version=2#section">');
  };
  const [result] = await searchKnownSites('baky os', { ...options, signal: controller.signal }, fetcher);
  assert.deepEqual(calls, ['https://www.bakyos.com/']);
  assert.equal(result.title, 'Baky OS | Live title from current page');
  assert.equal(result.snippet, 'Current factual description supplied by the live website.');
  assert.equal(result.url, 'https://www.bakyos.com/official?version=2');
  assert.equal(result.siteName, 'bakyos.com');
  assert.equal(result.displayUrl, 'bakyos.com/official');
});

test('Known-site matching accepts explicit full-brand variants and relevant extra words without broad brand flooding', async () => {
  const requests: string[] = [];
  const fetcher: ServerFetch = async (input) => { requests.push(String(input)); return html('<title>Unrelated</title>'); };
  for (const query of ['baky', 'os', 'ai', 'bakyone', 'baby os', 'baky oscar', 'baky-financial', 'news today']) {
    assert.equal(hasKnownSiteMatch(query), false);
    assert.deepEqual(await searchKnownSites(query, options, fetcher), []);
  }
  assert.equal(requests.length, 0);
  assert.equal(hasKnownSiteMatch('ako stiahnuť BAKY-OS'), true);
  assert.equal(hasKnownSiteMatch('bakyos'), true);
  await searchKnownSites('ako stiahnuť BAKY-OS', options, fetcher);
  await searchKnownSites('bakyos', options, fetcher);
  await searchKnownSites('Baky AI pomoc s kódom', options, fetcher);
  await searchKnownSites('bakyfinance prehľad trhu', options, fetcher);
  await searchKnownSites('"Baky News" správy', options, fetcher);
  assert.deepEqual(requests, [
    'https://www.bakyos.com/', 'https://www.bakyos.com/',
    'https://baky-ai-your-smart-partner.vercel.app/', 'https://bakyfinance-sk.vercel.app/', 'https://baky-news.vercel.app/',
  ]);
});

test('Known sites never fabricates a result after a network failure, HTTP error, redirect or non-HTML response', async () => {
  for (const fetcher of [
    async () => { throw Object.assign(new Error('Tor unavailable'), { status: 503 }); },
    async () => html('<title>Baky OS</title><meta name="description" content="Description">', { status: 404 }),
    async () => html('<title>Baky OS</title><meta name="description" content="Description">', { status: 302, headers: { location: 'https://elsewhere.example/' } }),
    async () => Response.json({ title: 'Baky OS', description: 'Description' }),
  ]) {
    assert.deepEqual(await searchKnownSites('baky os', options, fetcher), []);
  }
});

test('A successful HTTP response still needs a live app identity and usable description', async () => {
  for (const content of [
    '<title>Deployment not found</title><meta name="description" content="Baky OS URL could not be loaded.">',
    '<title>Baky OS</title><body><script>const body="invented descriptive page content";</script></body>',
    '<title>Baky OS</title><body>Not found</body>',
    '<title>Other operating system</title><meta name="description" content="Unrelated website description.">',
  ]) {
    assert.deepEqual(await searchKnownSites('baky os', options, async () => html(content)), []);
  }
});

test('Description can come from actual page text and external canonicals cannot replace a verified origin', async () => {
  const [result] = await searchKnownSites('baky os', options, async () => html('<title>Baky OS</title><link rel="canonical" href="https://attacker.example/fake"><main><h1>Baky OS</h1><p>Actual page paragraph describes the operating system and its current features.</p></main>'));
  assert.equal(result.url, 'https://www.bakyos.com/');
  assert.equal(result.snippet, 'Actual page paragraph describes the operating system and its current features.');
  const [second] = await searchKnownSites('baky os', options, async () => html('<title>Baky OS</title><meta name="description" content="Real description"><link rel="canonical" href="https://user:pass@www.bakyos.com/other">'));
  assert.equal(second.url, 'https://www.bakyos.com/');
});

test('Known-site results always refresh their content and use no stored or fallback title', async () => {
  let requests = 0;
  const fetcher: ServerFetch = async () => html(`<title>Baky OS | Revision ${++requests}</title><meta name="description" content="Actual version ${requests} from the website.">`);
  const first = await searchKnownSites('baky os', options, fetcher);
  const second = await searchKnownSites('baky os', options, fetcher);
  assert.equal(first[0].title, 'Baky OS | Revision 1');
  assert.equal(second[0].title, 'Baky OS | Revision 2');
  assert.equal(first[0].id, second[0].id);
  assert.equal(requests, 2);
});

test('Date-filtered queries do not claim an unsupported publication date or fetch the homepage', async () => {
  let calls = 0;
  assert.deepEqual(await searchKnownSites('baky os', { ...options, timeFilter: 'week' }, async () => { calls++; return html(''); }), []);
  assert.equal(calls, 0);
});

test('Cancellation prevents new requests and propagates cancellation after the live fetch', async () => {
  let calls = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchKnownSites('baky os', { ...options, signal: controller.signal }, async () => { calls++; return html(''); }));
  assert.equal(calls, 0);
  const active = new AbortController();
  await assert.rejects(searchKnownSites('baky os', { ...options, signal: active.signal }, async () => { active.abort(); throw new Error('aborted transport'); }));
});
