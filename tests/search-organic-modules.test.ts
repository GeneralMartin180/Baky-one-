import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeznam } from '../src/services/webSearchService.ts';

test('Seznam video carousel cards do not displace organic web pages', () => {
  // Generated CSS names are deliberately absent; retain the live module shape.
  const html = `
    <div class="Layout--left">
      <div data-e-b-n="organic~a"><div><h3><a href="https://lovable.dev/">Lovable</a></h3></div><p>Build apps and websites.</p></div>
      <div data-e-b-n="random-video-family~a">
        <div><h3>Videa<span>›</span><a href="//search.seznam.cz/videa/?q=lovable">Lovable</a></h3></div>
        <div role="list" data-e-b-n="random-list">
          <div role="listitem" data-e-b-n="random-card~a"><div><h3><a href="https://www.youtube.com/watch?v=song">Lovable song</a></h3></div><span>youtube.com</span></div>
          <div role="listitem" data-e-b-n="random-card~b"><div><h3><a href="https://www.youtube.com/watch?v=tutorial">Lovable tutorial</a></h3></div><span>youtube.com</span></div>
        </div>
      </div>
      <div data-e-b-n="organic~b"><div><h3><a href="https://www.youtube.com/watch?v=organic">Official Lovable tutorial</a></h3></div><p>An ordinary organic result on YouTube.</p></div>
      <div data-e-b-n="organic~c"><div><h3><a href="https://example.com/lovable-review">Lovable review</a></h3></div><p>A detailed review.</p></div>
    </div>`;
  const rows = parseSeznam(html);
  assert.deepEqual(rows.map(row => row.url), [
    'https://lovable.dev/',
    'https://www.youtube.com/watch?v=organic',
    'https://example.com/lovable-review',
  ]);
  assert.equal(rows[1].snippet, 'An ordinary organic result on YouTube.');
});

test('clearly scoped image, news and related-query modules stay out of web results', () => {
  const html = `
    <main>
      <section><h3>Obrázky › <a href="https://search.seznam.cz/obrazky/?q=mars">Mars</a></h3><div><h3><a href="https://images.example.com/mars">Mars photo</a></h3></div></section>
      <div data-e-b-n="news-family~a"><h3>Zprávy › <a href="/zpravy/?q=mars">Mars</a></h3><div data-e-b-n="news-card~a"><h3><a href="https://news.example.com/mars">Mars news</a></h3></div></div>
      <section><h3>Lidé také hledají</h3><div><h3><a href="https://related.example.com/">Related query card</a></h3></div></section>
      <article><h3><a href="https://nasa.example.com/mars">Mars exploration</a></h3><p>Organic page after the modules.</p></article>
    </main>`;
  assert.deepEqual(parseSeznam(html).map(row => row.url), ['https://nasa.example.com/mars']);
});

test('category words in ordinary organic titles never exclude their neighbors', () => {
  const html = `
    <div class="Layout--left">
      <div data-e-b-n="organic~a"><h3><a href="https://example.com/videos">Videa › Mars</a></h3><p>Video archive on an ordinary website.</p></div>
      <div data-e-b-n="organic~b"><h3><a href="https://example.com/news">Zprávy</a></h3><p>An ordinary news website.</p></div>
      <div data-e-b-n="organic~c"><h3><a href="https://example.com/info">Mars information</a></h3><p>Another organic result.</p></div>
    </div>`;
  assert.equal(parseSeznam(html).length, 3);
});
