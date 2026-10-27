import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.argv[2] || 'http://localhost:3000';
const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
const records = [];
async function request(route) {
  const started = performance.now();
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch {}
  const record = { route, status: response.status, elapsedMs: Math.round(performance.now() - started), body: body ?? text.slice(0, 250) };
  records.push(record);
  console.log(JSON.stringify({ route, status: record.status, elapsedMs: record.elapsedMs, count: body?.count }));
  return { response, body };
}

try {
  const health = await request('/api/health'); assert.equal(health.response.status, 200); assert.equal(health.body.status, 'ok');
  const officialHosts = { 'baky os': 'bakyos.com', yutubez: 'youtube.com', yutube: 'youtube.com', 'space x': 'spacex.com', 'duck duck go': 'duckduckgo.com', lovable: 'lovable.dev' };
  for (const query of ['duck duck go', 'lovable', 'baky os', 'yutubez', 'yutube', 'space x', 'Bratislava', 'javascript array sort', 'počítače', 'počasie Rimavská Sobota', 'ako uvariť ryžu', 'futbal výsledky', 'kde kúpiť notebook']) {
    const { response, body } = await request(`/api/search?${new URLSearchParams({ q: query, safeSearch: '1', region: 'sk' })}`);
    assert.equal(response.status, 200, query);
    const minimum = query in officialHosts ? 1 : 3;
    assert.ok(body.results?.length >= minimum, `${query}: need real web results`);
    // Live provider counts fluctuate; require useful independent pages without
    // rejecting a valid set simply because it also contains a Wikipedia result.
    assert.ok(body.results.filter(r => !new URL(r.url).hostname.endsWith('wikipedia.org')).length >= Math.min(2, minimum), `${query}: independent web pages missing`);
    assert.ok(body.results.every(r => !/bing\.com\/aclick/.test(r.url)), `${query}: advertisement redirect`);
    if (query === 'javascript array sort') assert.ok(body.results.some(r => /array|sort/i.test(r.title)), 'specific JavaScript documentation missing');
    if (query in officialHosts) assert.ok(body.results.some(r => new URL(r.url).hostname.replace(/^www\./, '') === officialHosts[query]), `${query}: real official page missing`);
    if (query === 'duck duck go' || query === 'lovable') {
      assert.ok(body.results.length >= 8, `${query}: first page remains sparse`);
      assert.equal(new URL(body.results[0].url).hostname.replace(/^www\./, ''), officialHosts[query], `${query}: official destination must lead`);
      assert.ok(new Set(body.results.map(r => new URL(r.url).hostname)).size >= 5, `${query}: independent sources missing`);
      assert.ok(body.results.filter(r => /(^|\.)youtube\.com$/.test(new URL(r.url).hostname)).length <= 2, `${query}: video cards displaced web pages`);
      if (query === 'lovable') assert.ok(body.results.every(r => !(new URL(r.url).hostname.endsWith('.lovable.app') && /^lovable app$/i.test(r.title.trim()))), 'lovable: generic hosted projects displaced platform results');
    }
    assert.match(response.headers.get('cache-control') || '', /no-store/);
  }
  const global = await request('/api/search?' + new URLSearchParams({ q: 'NASA Artemis', region: 'global', safeSearch: '1' }));
  assert.equal(global.response.status, 200);
  assert.ok(global.body.results?.length > 0, 'global search must retain available real sources');
  const malformed = await request('/api/search?q=a&q=b'); assert.equal(malformed.response.status, 400);
  const ssrf = await request('/api/news-proxy-image?url=http://127.0.0.1/'); assert.equal(ssrf.response.status, 400);
  if (process.argv.includes('--media')) {
    for (const endpoint of ['images', 'videos', 'shorts', 'news']) {
      const { response, body } = await request(`/api/${endpoint}?q=Bratislava&safeSearch=1&region=sk`);
      assert.equal(response.status, 200, endpoint); assert.ok(body.count > 0, `${endpoint}: no results`);
    }
  }
  console.log('LIVE SMOKE PASSED');
} finally {
  if (output) { await mkdir(path.dirname(output), { recursive: true }); await writeFile(output, JSON.stringify({ base, testedAt: new Date().toISOString(), records }, null, 2)); }
}
