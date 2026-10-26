import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { scrapeNewsForQuery, scrapeTrendingNews } from '../src/services/newsScraper.ts';
import { setServerFetchForTests } from '../src/services/serverTransport.ts';
import type { SearchOptions } from '../src/services/searchOptions.ts';

const options: SearchOptions = { safeSearch: true, region: 'sk', timeFilter: 'anytime' };
const publisherHosts = ['feeds.bbci.co.uk', 'www.theguardian.com', 'www.aktuality.sk'];
afterEach(() => setServerFetchForTests(null));

function feed(items: string): string {
  return `<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:image="http://web.resource.org/rss/1.0/modules/image"><channel>${items}</channel></rss>`;
}

function story(title: string, url: string, metadata = ''): string {
  return `<item><title>${title}</title><link>${url}</link>${metadata}</item>`;
}

test('Home news fetches fixed real publishers in parallel and interleaves the first eight cards', async () => {
  const requests: string[] = [];
  const release: Array<() => void> = [];
  setServerFetchForTests(async (input, request) => {
    const url = new URL(input);
    requests.push(url.hostname);
    assert.equal(request?.maxBytes, 2 * 1024 * 1024);
    assert.equal(request?.timeoutMs, 3500);
    assert.ok(request?.signal);
    await new Promise<void>((resolve) => release.push(resolve));
    const items = Array.from({ length: 10 }, (_, index) => story(`${url.hostname} story ${index}`, `https://${url.hostname}/article/${index}`));
    return new Response(feed(items.join('')));
  });
  const pending = scrapeTrendingNews('trending', options);
  assert.deepEqual(requests, publisherHosts, 'All three feeds start before the first response completes');
  release.forEach((resolve) => resolve());
  const items = await pending;
  assert.equal(items.length, 15);
  assert.deepEqual(items.slice(0, 8).map((item) => item.source), [
    'BBC News', 'The Guardian', 'Aktuality.sk', 'BBC News', 'The Guardian', 'Aktuality.sk', 'BBC News', 'The Guardian',
  ]);
  assert.equal(new Set(items.map((item) => item.id)).size, items.length);
});

test('Publisher metadata preserves real titles, annotations, dates and the largest supplied photograph', async () => {
  const photo = 'https://i.guim.co.uk/img/media/photo.jpg?width=700&s=signature';
  setServerFetchForTests(async (input) => new Response(feed(new URL(input).hostname !== 'www.theguardian.com' ? '' : story(
    'Real story - explanation', 'https://www.theguardian.com/world/2026/oct/24/real-story', `
      <description><![CDATA[<b>Real annotation.</b>]]></description>
      <pubDate>Sat, 24 Oct 2026 14:30:00 +0000</pubDate>
      <media:content url="https://i.guim.co.uk/img/media/photo.jpg?width=140" width="140"/>
      <media:content url="${photo.replace(/&/g, '&amp;')}" width="700"/>
    `,
  ))));
  const [item] = await scrapeTrendingNews('trending', options);
  assert.equal(item.title, 'Real story - explanation');
  assert.equal(item.query, item.title);
  assert.equal(item.source, 'The Guardian');
  assert.equal(item.snippet, 'Real annotation.');
  assert.equal(item.imageUrl, photo, 'Uses an exact publisher image URL without inventing a larger rendition');
  assert.equal(item.publishedAt, '2026-10-24T14:30:00.000Z');
});

test('Feed images skip unsafe and nonimage candidates and accept enclosures and image:url', async () => {
  setServerFetchForTests(async (input) => new Response(feed(new URL(input).hostname !== 'feeds.bbci.co.uk' ? '' : `
    ${story('Enclosure', 'https://www.bbc.co.uk/news/articles/enclosure', `
      <media:thumbnail url="javascript:alert(1)"/><media:content type="video/mp4" url="https://example.org/movie.mp4"/>
      <media:content medium="video" url="https://example.org/video"/>
      <enclosure type="image/jpeg" url="https://ichef.bbci.co.uk/actual-photo.jpg"/>
    `)}
    ${story('Image extension', 'https://www.bbc.co.uk/news/articles/image', '<image:image><image:url><![CDATA[ https://ichef.bbci.co.uk/another-photo.jpg ]]></image:url></image:image>')}
    ${story('Unsafe image', 'https://www.bbc.co.uk/news/articles/no-image', '<media:thumbnail url="http://ichef.bbci.co.uk/insecure.jpg"/><enclosure type="image/svg+xml" url="javascript:alert(1)"/>')}
  `)));
  const items = await scrapeTrendingNews('all', options);
  assert.deepEqual(items.map((item) => item.imageUrl), [
    'https://ichef.bbci.co.uk/actual-photo.jpg', 'https://ichef.bbci.co.uk/another-photo.jpg', undefined,
  ]);
});

test('One failed publisher does not replace remaining real feeds with Google News', async () => {
  const requests: string[] = [];
  setServerFetchForTests(async (input) => {
    const hostname = new URL(input).hostname;
    requests.push(hostname);
    if (hostname === 'feeds.bbci.co.uk') throw new Error('unavailable');
    return new Response(feed(hostname === 'www.theguardian.com' ? story('Guardian story', 'https://www.theguardian.com/world/actual-story') : ''));
  });
  const [item] = await scrapeTrendingNews('trending', options);
  assert.deepEqual(requests, publisherHosts);
  assert.equal(item.source, 'The Guardian');
});

test('Only when all publisher feeds are empty or unavailable does localized Google fallback run', async () => {
  for (const failure of ['empty', 'http', 'transport']) {
    const calls: string[] = [];
    setServerFetchForTests(async (input, request) => {
      const url = new URL(input);
      calls.push(url.hostname);
      if (publisherHosts.includes(url.hostname)) {
        if (failure === 'transport') throw new Error('upstream failed');
        return new Response(failure === 'empty' ? feed('') : 'unavailable', { status: failure === 'http' ? 503 : 200 });
      }
      assert.equal(url.hostname, 'news.google.com');
      assert.equal(url.pathname, '/rss');
      assert.equal(url.searchParams.get('ceid'), 'SK:sk');
      assert.equal(request?.timeoutMs, 2500);
      return new Response(feed(story('Správa - Iný vydavateľ', 'https://news.google.com/articles/real-item')));
    });
    const [item] = await scrapeTrendingNews('trending', options);
    assert.deepEqual(calls, [...publisherHosts, 'news.google.com']);
    assert.equal(item.title, 'Správa');
    assert.equal(item.source, 'Iný vydavateľ');
    assert.equal(item.imageUrl, undefined, 'No substitute image is invented');
  }
});

test('Query-news preserves regional and date filters independently of home feed aggregation', async () => {
  const requests: URL[] = [];
  setServerFetchForTests(async (input) => { requests.push(new URL(input)); return new Response(feed('')); });
  await scrapeNewsForQuery('  Microsoft  ', { ...options, region: 'cz', timeFilter: 'week' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].hostname, 'news.google.com');
  assert.equal(requests[0].pathname, '/rss/search');
  assert.equal(requests[0].searchParams.get('q'), 'Microsoft when:7d');
  assert.equal(requests[0].searchParams.get('ceid'), 'CZ:cs');
});

test('Other home regions retain world publishers and use their locale only for an empty-feed fallback', async () => {
  const requests: URL[] = [];
  setServerFetchForTests(async (input) => { requests.push(new URL(input)); return new Response(feed('')); });
  await scrapeTrendingNews('trending', { ...options, region: 'cz' });
  assert.deepEqual(requests.map((url) => url.hostname), ['feeds.bbci.co.uk', 'www.theguardian.com', 'news.google.com']);
  assert.equal(requests[2].searchParams.get('ceid'), 'CZ:cs');
});

test('Publisher items retain date filtering, URL validation and deduplication across feeds', async () => {
  const date = new Date().toUTCString();
  setServerFetchForTests(async () => new Response(feed(`
    ${story('Current', 'https://www.bbc.co.uk/news/articles/current', `<pubDate>${date}</pubDate>`)}
    ${story('Duplicate', 'https://www.bbc.co.uk/news/articles/current', `<pubDate>${date}</pubDate>`)}
    ${story('Old', 'https://www.bbc.co.uk/news/articles/old', '<pubDate>Mon, 01 Jan 2001 00:00:00 GMT</pubDate>')}
    ${story('Unsafe', 'javascript:alert(1)', `<pubDate>${date}</pubDate>`)}
  `)));
  assert.deepEqual((await scrapeTrendingNews('trending', { ...options, timeFilter: 'day' })).map((item) => item.title), ['Current']);
});

test('Cancelled homepage request never starts or falls back to another provider', async () => {
  let calls = 0;
  const controller = new AbortController();
  setServerFetchForTests(async () => { calls++; controller.abort(); throw new Error('cancelled'); });
  await assert.rejects(scrapeTrendingNews('trending', { ...options, signal: controller.signal }));
  assert.equal(calls, 1);
  await assert.rejects(scrapeTrendingNews('trending', { ...options, signal: controller.signal }));
  assert.equal(calls, 1);
});
