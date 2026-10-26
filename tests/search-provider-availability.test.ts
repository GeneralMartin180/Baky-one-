import assert from 'node:assert/strict';
import test from 'node:test';
import { classifySearchResponse } from '../src/services/searchProviderResponse.ts';

const providers = ['duckduckgo', 'duckduckgo-lite', 'bing', 'bing-rss', 'seznam'];

// Reduced from real DDG Lite and Seznam zero-result pages captured using an
// exact quoted nonsensical public query, without storing a user's search.
const ddgEmpty = '<div class="no-results__message"><h1>No results found for <strong>&quot;zzqvxnmplkqvxnmplk&quot;</strong></h1><p><strong>Suggestions</strong>:</p><ul><li>Check spelling</li></ul></div>';
const seznamEmpty = '<div class="f323a7"><h3 class="ab6782 fe2c14 b2c01b" title="Bohužel jsem nic nenašel">Bohužel jsem nic nenašel</h3><div class="e9542c"><div>Asi jste první, kdo vyhledává <strong>"zzqvxnmplkqvxnmplk"</strong>.</div><div><strong>TIP: </strong>Překontrolujte zadaný dotaz, zda je napsán správně.</div></div></div>';

test('parsed results win over incidental CAPTCHA assets and footer language', () => {
  const body = '<script src="/captcha.js"></script><div>Verify you are human</div><form id="challenge-form"></form>';
  for (const provider of providers) assert.equal(classifySearchResponse(provider, body, 2), 'results', provider);
});

test('genuine provider-specific zero-result structures are distinct from failed parsing', () => {
  assert.equal(classifySearchResponse('duckduckgo', ddgEmpty, 0), 'empty');
  assert.equal(classifySearchResponse('duckduckgo-lite', ddgEmpty, 0), 'empty');
  assert.equal(classifySearchResponse('bing', '<ol id="b_results"><li class="b_no"><h1>There are no results for <strong>an exact phrase</strong></h1></li></ol>', 0), 'empty');
  assert.equal(classifySearchResponse('seznam', seznamEmpty, 0), 'empty');
  assert.equal(classifySearchResponse('bing-rss', '<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel><title>Bing: exact phrase</title><link>https://www.bing.com/search?q=exact</link><description>Search results</description></channel></rss>', 0), 'empty');
});

test('empty bodies, unexpected HTML, error pages and rate limits are unavailable rather than no-results success', () => {
  for (const provider of providers) {
    for (const body of ['', '  ', '<html><body>Search</body></html>', 'Too many requests', '<h1>Access Denied</h1>', '<h2>Rate limit exceeded</h2>', '<div id="captcha">Complete the CAPTCHA</div>']) {
      assert.equal(classifySearchResponse(provider, body, 0), 'unavailable', `${provider}: ${body}`);
    }
  }
});

test('challenges beyond the former first-12KB scan cannot masquerade as an empty page', () => {
  const lateChallenge = `${'<!-- padding -->'.repeat(1500)}${ddgEmpty}<form id="challenge-form" action="/anomaly.js"></form>`;
  assert.equal(classifySearchResponse('duckduckgo', lateChallenge, 0), 'unavailable');
  assert.equal(classifySearchResponse('duckduckgo-lite', `${ddgEmpty}<script src="https://example.org/anomaly.js"></script>`, 0), 'unavailable');
  assert.equal(classifySearchResponse('bing', '<h1>Verify you are human</h1><ol id="b_results"><li class="b_no">No results found</li></ol>', 0), 'unavailable');
});

test('query echoes and script strings do not count as explicit provider no-results markers', () => {
  const body = '<form><input name="q" value="No results found"></form><script>const message="No results found";</script><footer>No results found</footer>';
  for (const provider of providers) assert.equal(classifySearchResponse(provider, body, 0), 'unavailable', provider);
  assert.equal(classifySearchResponse('seznam', '<h3>Bohužel jsem nic nenašel</h3>', 0), 'unavailable');
  assert.equal(classifySearchResponse('unknown-provider', ddgEmpty, 0), 'unavailable');
});

test('RSS error payloads, unparsed items and incomplete XML are unavailable rather than valid empty feeds', () => {
  for (const body of [
    '<rss><channel><error>Rate limited</error></channel></rss>',
    '<rss><channel><title>Too many requests</title></channel></rss>',
    '<rss><channel><item><title>Invalid result</title><link>javascript:invalid()</link></item></channel></rss>',
    '<rss><channel>', '<rss><channel></channel>', '<html><rss><channel></channel></rss></html>',
  ]) assert.equal(classifySearchResponse('bing-rss', body, 0), 'unavailable', body);
  assert.equal(classifySearchResponse('bing-rss', '<rss><channel></channel></rss>', 0), 'empty');
});
