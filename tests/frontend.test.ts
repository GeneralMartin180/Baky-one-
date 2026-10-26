import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';


const require = createRequire(import.meta.url);
const components = new Map<string, any>();
async function loadComponent(file: string) {
  if (components.has(file)) return components.get(file);
  const output = await build({ entryPoints: [path.resolve(file)], bundle: true, write: false, format: 'cjs', platform: 'node', tsconfigRaw: {}, jsx: 'automatic', plugins: [{
    name: 'workspace-test-files',
    setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (!args.path.startsWith('.') && !path.isAbsolute(args.path)) return { path: args.path, external: true };
        const base = path.resolve(args.resolveDir || process.cwd(), args.path);
        const resolved = [base, `${base}.tsx`, `${base}.ts`, `${base}.js`].find((candidate) => existsSync(candidate));
        return resolved ? { path: resolved, namespace: 'workspace-files' } : { errors: [{ text: `Missing test module: ${base}` }] };
      });
      builder.onLoad({ filter: /.*/, namespace: 'workspace-files' }, (args) => ({ contents: readFileSync(args.path), loader: args.path.endsWith('.png') ? 'dataurl' : args.path.endsWith('.tsx') ? 'tsx' : 'ts', resolveDir: path.dirname(args.path) }));
    },
  }] });
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', output.outputFiles[0].text)(require, module, module.exports);
  components.set(file, module.exports);
  return module.exports;
}
const settings = { safeSearch: true, openInNewTab: true, region: 'sk', privacyBadgeEnabled: true };
const hit = (title: string) => ({ id: title, title, url: `https://example.com/${title}`, displayUrl: 'example.com', siteName: 'Example', snippet: `${title} snippet` });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const tick = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); };
async function setup() {
  const dom = new JSDOM('<!doctype html><html><body><button id="trigger">Open</button><div id="root"></div></body></html>', { url: 'http://localhost/' });
  for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'CustomEvent', 'Event', 'MouseEvent', 'KeyboardEvent', 'localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: (dom.window as any)[name] });
  }
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.scrollTo = () => {};
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  return { dom, root, close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}
function props(overrides: Record<string, unknown> = {}) { return { initialQuery: 'alpha', settings, onSearchAgain: () => {}, onBackToHome: () => {}, ...overrides }; }

function mobileViewport(initial = true) {
  let mobile = initial;
  const listeners = new Set<() => void>();
  const media = {
    get matches() { return mobile; },
    media: '(max-width: 639px)',
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
  };
  window.matchMedia = ((query: string) => query === media.media ? media : { ...media, matches: false }) as any;
  return {
    resize: async (matches: boolean) => { await act(async () => { mobile = matches; listeners.forEach(listener => listener()); }); },
    get listenerCount() { return listeners.size; },
  };
}

const marketQuote = (symbol = 'MSFT', overrides: Record<string, unknown> = {}) => ({
  symbol, label: symbol === 'MSFT' ? 'Microsoft' : symbol === '^GSPC' ? 'S&P 500' : 'Nasdaq',
  kind: symbol === 'MSFT' ? 'stock' : 'index', price: 432.15, currency: 'USD', changePercent: 0.66,
  updatedAt: '2026-10-23T20:00:00Z', url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`, status: 'available', ...overrides,
});

test('mobile homepage loads markets and regional news, links AI Mode to Baky AI and leaves the keyboard closed', async () => {
  const { default: SearchHome } = await loadComponent('src/components/SearchHome.tsx');
  const env = await setup(); mobileViewport();
  const requests: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });
    return response(url === '/api/markets' ? { quotes: [] } : { items: [] });
  }) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchHome, { onSearch: () => {}, settings: { ...settings, region: 'cz', safeSearch: false, openInNewTab: false } })));
    await tick();
    assert.equal(requests.length, 2);
    assert.ok(requests.some(request => request.url === '/api/markets'));
    const news = new URL(requests.find(request => request.url.startsWith('/api/trending?'))!.url, 'http://localhost');
    assert.equal(news.searchParams.get('cat'), 'trending');
    assert.equal(news.searchParams.get('region'), 'cz');
    assert.equal(news.searchParams.get('safeSearch'), '0');
    assert.ok(requests.every(request => request.init.cache === 'no-store' && request.init.signal instanceof AbortSignal));
    const ai = document.querySelector('#mobile-ai-mode') as HTMLAnchorElement;
    assert.equal(ai.textContent, 'AI Mode');
    assert.equal(ai.href, 'https://baky-ai-your-smart-partner.vercel.app/');
    assert.equal(ai.target, '_self');
    const input = document.querySelector('#search-home-input')!;
    assert.equal(input.hasAttribute('autofocus'), false);
    assert.notEqual(document.activeElement, input);
    assert.equal(document.querySelector('#mobile-news-heading')?.textContent, 'Novinky');
    assert.equal(document.querySelector('button[aria-label="Hľadať obrázky"]'), null, 'mobile home must not add an image/lens action');
    assert.equal(document.querySelector('button[aria-label="Hlasové vyhľadávanie"]'), null, 'unsupported speech recognition must not expose an inert microphone');
    assert.equal(document.querySelector('button[aria-label="Baky One"]'), null, 'the homepage wordmark must not be a dead home button');
  } finally { await env.close(); }
});

test('mobile feed displays supplied prices and news while unavailable indices remain blank', async () => {
  const { default: MobileHomeFeed } = await loadComponent('src/components/MobileHomeFeed.tsx');
  const env = await setup();
  globalThis.fetch = (async (url: string) => response(url === '/api/markets'
    ? { quotes: [marketQuote(), marketQuote('^GSPC', { price: null, changePercent: null, updatedAt: null, status: 'unavailable' }), marketQuote('^IXIC', { price: 19876.54, changePercent: -1.25 })] }
    : { items: [{ id: 'news-1', title: 'Aktuálna správa z regiónu', source: 'Denník', url: 'https://news.example/article', imageUrl: 'https://images.example/story.jpg', publishedAt: '2026-10-23T12:00:00Z' }] })) as any;
  try {
    await act(async () => env.root.render(React.createElement(MobileHomeFeed, { openInNewTab: false })));
    await tick();
    const markets = Array.from(document.querySelectorAll('section[aria-label="Burza"] a'));
    assert.equal(markets.length, 3);
    assert.match(markets[0].textContent!, /MSFT.*\+0,66%.*432,15/s);
    assert.match(markets[1].textContent!, /S&P 500.*—/s);
    assert.doesNotMatch(markets[1].textContent!, /%|432/);
    assert.match(markets[2].textContent!, /Nasdaq.*-1,25%.*19\s*876,54/s);
    assert.match(document.body.textContent!, /Posledné dostupné ceny.*Yahoo Finance/);
    const article = document.querySelector('#mobile-news article')!;
    assert.match(article.textContent!, /Denník.*Aktuálna správa z regiónu/s);
    assert.equal(article.querySelector('a')?.getAttribute('target'), '_self');
    assert.equal(article.querySelector('time')?.getAttribute('datetime'), '2026-10-23T12:00:00Z');
    assert.equal(article.querySelector('img')?.getAttribute('src'), '/api/news-proxy-image?url=https%3A%2F%2Fimages.example%2Fstory.jpg');
  } finally { await env.close(); }
});

test('mobile feed failures show unavailable data and offer a retry without invented market prices or news', async () => {
  const { default: MobileHomeFeed } = await loadComponent('src/components/MobileHomeFeed.tsx');
  const env = await setup(); let calls = 0;
  globalThis.fetch = (async () => { calls++; return response({ error: 'upstream unavailable' }, 502); }) as any;
  try {
    await act(async () => env.root.render(React.createElement(MobileHomeFeed)));
    await tick();
    assert.match(document.body.textContent!, /Ceny teraz nie sú dostupné/);
    assert.match(document.body.textContent!, /Novinky sa nepodarilo načítať/);
    const markets = Array.from(document.querySelectorAll('section[aria-label="Burza"] a'));
    assert.equal(markets.length, 3);
    assert.ok(markets.every(market => market.textContent!.includes('—') && !market.textContent!.includes('%')));
    assert.equal(document.querySelector('#mobile-news article'), null);
    const refresh = document.querySelector('button[aria-label="Obnoviť burzu a novinky"]') as HTMLButtonElement;
    assert.equal(refresh.disabled, false);
    await act(async () => refresh.click());
    await tick();
    assert.equal(calls, 4);
  } finally { await env.close(); }
});

test('leaving the mobile viewport aborts feed requests and stale responses cannot replace a remounted feed', async () => {
  const { default: SearchHome } = await loadComponent('src/components/SearchHome.tsx');
  const env = await setup(); const viewport = mobileViewport(false);
  const pending: Array<{ url: string; signal: AbortSignal; resolve: (value: Response) => void }> = [];
  globalThis.fetch = ((url: string, init: RequestInit) => new Promise(resolve => pending.push({ url, signal: init.signal as AbortSignal, resolve }))) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchHome, { onSearch: () => {} })));
    assert.equal(pending.length, 0);
    await viewport.resize(true);
    assert.equal(pending.length, 2);
    await viewport.resize(false);
    assert.ok(pending.slice(0, 2).every(request => request.signal.aborted));
    assert.equal(document.querySelector('#mobile-home-feed'), null);
    await viewport.resize(true);
    assert.equal(pending.length, 4);
    await act(async () => {
      pending[2].resolve(response({ quotes: [marketQuote('MSFT', { price: 456.78 })] }));
      pending[3].resolve(response({ items: [{ id: 'current', title: 'Current news', source: 'Current source', url: 'https://news.example/current' }] }));
    });
    await act(async () => {
      pending[0].resolve(response({ quotes: [marketQuote('MSFT', { price: 111.11 })] }));
      pending[1].resolve(response({ items: [{ id: 'stale', title: 'Stale news', source: 'Old source', url: 'https://news.example/stale' }] }));
    });
    assert.match(document.body.textContent!, /456,78/);
    assert.match(document.body.textContent!, /Current news/);
    assert.doesNotMatch(document.body.textContent!, /111,11|Stale news/);
  } finally { await env.close(); }
  assert.equal(viewport.listenerCount, 0);
  assert.ok(pending.every(request => request.signal.aborted));
});

test('new searches discard old results and overview, and late responses cannot overwrite the active query', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  const pending: Array<{ url: string; signal: AbortSignal; resolve: (response: Response) => void }> = [];
  globalThis.fetch = ((url: string, init: RequestInit) => new Promise((resolve) => pending.push({ url, signal: init.signal as AbortSignal, resolve }))) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props({ aiMode: true }))));
    assert.equal(pending.length, 1);
    await act(async () => pending[0].resolve(response({ results: [hit('Alpha')], overview: { title: 'Alpha source', extract: 'Alpha overview', sources: [{ title: 'Alpha citation', url: 'https://source.example/alpha' }] }, hasMore: true, elapsedMs: 28 })));
    assert.match(document.body.textContent!, /Alpha overview/);
    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialQuery: 'beta', aiMode: true }))));
    assert.doesNotMatch(document.body.textContent!, /Alpha overview|Alpha snippet/);
    assert.equal(pending[0].signal.aborted, true);
    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialQuery: 'gamma', aiMode: true }))));
    await act(async () => pending[2].resolve(response({ results: [hit('Gamma')], overview: null, hasMore: false })));
    await act(async () => pending[1].resolve(response({ results: [hit('Beta')], overview: { extract: 'Stale beta overview' }, hasMore: false })));
    assert.match(document.body.textContent!, /Gamma snippet/);
    assert.doesNotMatch(document.body.textContent!, /Beta snippet|Stale beta overview/);
    assert.ok(pending.every((request) => request.url.startsWith('/api/search?')));
    assert.equal(document.querySelector('#pagination-next'), null);
  } finally { await env.close(); }
});

test('SafeSearch, region and time filter reach the server and media tabs use their own endpoint', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup(); const requests: string[] = [];
  globalThis.fetch = (async (url: string) => { requests.push(url); return response({ results: [hit('Result')], images: [], hasMore: false }); }) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props()))); await tick();
    await act(async () => env.root.render(React.createElement(SearchResults, props({ settings: { ...settings, safeSearch: false, region: 'cz' } })))); await tick();
    await act(async () => (document.querySelector('#search-tab-tools') as HTMLButtonElement).click());
    const select = document.querySelector('#search-tools select') as HTMLSelectElement;
    await act(async () => { select.value = 'week'; select.dispatchEvent(new Event('change', { bubbles: true })); }); await tick();
    await act(async () => (document.querySelector('#search-tab-images') as HTMLButtonElement).click()); await tick();
    const last = new URL(requests.at(-1)!, 'http://localhost');
    assert.equal(last.pathname, '/api/images');
    assert.equal(last.searchParams.get('safeSearch'), '0');
    assert.equal(last.searchParams.get('region'), 'cz');
    assert.equal(last.searchParams.get('time'), 'week');
    assert.equal(last.searchParams.get('q'), 'alpha');
    assert.ok(requests.length >= 4);
  } finally { await env.close(); }
});

test('a failed new media search shows an error and cannot expose the previous query results', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  globalThis.fetch = (async (url: string) => {
    if (url.includes('q=beta')) throw new TypeError('Failed to fetch');
    return response({ videos: [{ id: '1', videoId: 'abcdefghijk', title: 'Previous video', url: 'https://youtube.com/watch?v=abcdefghijk', channel: 'Channel', thumbnail: 'https://example.com/thumb.jpg' }] });
  }) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialTab: 'videos' })))); await tick();
    assert.match(document.body.textContent!, /Previous video/);
    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialQuery: 'beta', initialTab: 'videos' })))); await tick();
    assert.doesNotMatch(document.body.textContent!, /Previous video/);
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Nepodarilo sa pripojiť/);
  } finally { await env.close(); }
});

test('a successful HTTP response must contain the active endpoint result array before the UI can report zero matches', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  for (const initialTab of ['all', 'images', 'videos', 'shorts', 'news']) {
    const env = await setup();
    globalThis.fetch = (async () => response({ success: true, unrelated: [] })) as any;
    try {
      await act(async () => env.root.render(React.createElement(SearchResults, props({ initialTab }))));
      await tick();
      assert.match(document.querySelector('[role="alert"]')!.textContent!, /neplatnú odpoveď/);
      assert.doesNotMatch(document.querySelector('#search-tabpanel')!.textContent!, /sa nenašli výsledky|0 načítaných výsledkov/);
      assert.match(document.querySelector('[role="alert"]')!.textContent!, /Skúsiť znova/);
    } finally { await env.close(); }
  }
});

test('an incomplete empty search offers retry without claiming no matching pages exist, while a genuine empty response remains distinct', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return response(calls === 1 ? { results: [], degraded: true, hasMore: false } : { results: [hit('Recovered')], degraded: false, hasMore: false });
  }) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props())));
    await tick();
    const panel = document.querySelector('#search-tabpanel')!;
    assert.match(panel.textContent!, /Vyhľadávanie je neúplné|zdroje sú dočasne nedostupné/);
    assert.doesNotMatch(panel.textContent!, /sa nenašli výsledky|0 načítaných výsledkov/);
    const retry = Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Skúsiť znova')!;
    assert.ok(retry);
    await act(async () => retry.click());
    await tick();
    assert.equal(calls, 2);
    assert.match(panel.textContent!, /Recovered snippet/);
    assert.doesNotMatch(panel.textContent!, /Vyhľadávanie je neúplné|zdroje sú dočasne nedostupné/);

    globalThis.fetch = (async () => response({ results: [], degraded: false, hasMore: false })) as any;
    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialQuery: 'no matches' }))));
    await tick();
    assert.match(panel.textContent!, /Pre „no matches“ sa nenašli výsledky/);
    assert.equal(Array.from(panel.querySelectorAll('button')).some(button => button.textContent === 'Skúsiť znova'), false);
  } finally { await env.close(); }
});

test('provider correction appears only for completed web results, submits its actual query and clears on another tab, query or error', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  const pending: Array<(value: Response) => void> = [];
  const submitted: string[] = [];
  const searchProps = { initialQuery: 'bratyslava', onSearchAgain: (query: string) => submitted.push(query) };
  globalThis.fetch = (() => new Promise(resolve => pending.push(resolve))) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props(searchProps))));
    assert.doesNotMatch(document.body.textContent!, /Výsledky pre/);
    await act(async () => pending[0](response({ results: [hit('Bratislava')], correctedQuery: 'Bratislava' })));
    assert.equal((document.querySelector('#search-input') as HTMLInputElement).value, 'bratyslava');
    assert.match(document.body.textContent!, /Výsledky pre Bratislava/);
    const correction = Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Bratislava')!;
    await act(async () => correction.click());
    assert.deepEqual(submitted, ['Bratislava']);

    await act(async () => (document.querySelector('#search-tab-images') as HTMLButtonElement).click());
    assert.doesNotMatch(document.body.textContent!, /Výsledky pre/);
    await act(async () => pending[1](response({ images: [], correctedQuery: 'Ignored media correction' })));
    assert.doesNotMatch(document.body.textContent!, /Výsledky pre|Ignored media correction/);

    await act(async () => (document.querySelector('#search-tab-all') as HTMLButtonElement).click());
    await act(async () => pending[2](response({ results: [hit('Bratislava')], correctedQuery: 'Bratislava' })));
    assert.match(document.body.textContent!, /Výsledky pre Bratislava/);
    await act(async () => env.root.render(React.createElement(SearchResults, props({ ...searchProps, initialQuery: 'another query' }))));
    assert.doesNotMatch(document.body.textContent!, /Výsledky pre/);
    await act(async () => pending[3](response({ error: 'Zdroj neodpovedá.', correctedQuery: 'Must not appear' }, 502)));
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Zdroj neodpovedá/);
    assert.doesNotMatch(document.body.textContent!, /Výsledky pre|Must not appear/);
  } finally { await env.close(); }
});

test('web links respect same-tab setting and the overview cites its actual source', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  globalThis.fetch = (async () => response({ results: [hit('Web')], overview: { title: 'Source topic', extract: 'Original source text', sources: [{ title: 'Actual citation', url: 'https://citation.example/article' }] }, hasMore: false })) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props({ aiMode: true, settings: { ...settings, openInNewTab: false } })))); await tick();
    const web = document.querySelector('h2 a') as HTMLAnchorElement;
    assert.equal(web.target, '_self');
    const citation = document.querySelector('a[href="https://citation.example/article"]') as HTMLAnchorElement;
    assert.equal(citation.target, '_self');
    assert.doesNotMatch(document.body.textContent!, /Generatívna AI|overených|44\s?200|Často navštevujete/);
  } finally { await env.close(); }
});

test('settings dialog traps focus, supports Escape and restores focus after unmount', async () => {
  const { default: InfoModals } = await loadComponent('src/components/InfoModals.tsx');
  const env = await setup(); let closed = 0;
  globalThis.fetch = (async () => response({ status: 'ok', engine: 'Baky One Search', network: { mode: 'direct', configured: true } })) as any;
  const trigger = document.querySelector('#trigger') as HTMLButtonElement; trigger.focus();
  try {
    await act(async () => env.root.render(React.createElement(InfoModals, { activeModal: 'settings', settings, onClose: () => { closed++; }, onUpdateSettings: () => {} }))); await tick();
    const close = document.querySelector('#modal-close-btn') as HTMLButtonElement;
    assert.equal(document.activeElement, close);
    await act(async () => close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    assert.equal((document.activeElement as HTMLElement).id, 'select-region');
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    assert.equal(closed, 1);
    assert.equal(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal'), 'true');
    assert.doesNotMatch(document.body.textContent!, /Zmeniť IP|Stiahnuť proxy|Virtuálna MAC/);
    await act(async () => env.root.render(null));
    assert.equal(document.activeElement, trigger);
  } finally { await env.close(); }
});

test('homepage image mode and microphone submit the recognized query as an image search', async () => {
  const { default: SearchHome } = await loadComponent('src/components/SearchHome.tsx');
  const env = await setup(); const searches: unknown[][] = []; let recognition: any;
  class Recognition {
    onstart: any; onresult: any; onend: any; onerror: any;
    constructor() { recognition = this; }
    start() { this.onstart?.(); }
    abort() {} stop() { this.onend?.(); }
  }
  (window as any).SpeechRecognition = Recognition;
  try {
    await act(async () => env.root.render(React.createElement(SearchHome, { onSearch: (...args: unknown[]) => searches.push(args) })));
    const images = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Obrázky')!;
    await act(async () => images.click());
    assert.equal(searches.length, 0);
    const microphone = document.querySelector('button[aria-label="Hlasové vyhľadávanie"]') as HTMLButtonElement;
    await act(async () => microphone.click());
    assert.ok(recognition);
    await act(async () => recognition.onresult({ results: [[{ transcript: 'mačky' }]] }));
    assert.deepEqual(searches, [['mačky', false, 'images']]);
  } finally { await env.close(); }
});

test('Escape makes one popup attempt even when noopener returns null, and clears only query keys', async () => {
  const privacy = await loadComponent('src/services/privacyEphemeralManager.ts');
  const env = await setup(); let opens = 0; let purges = 0;
  window.open = (() => { opens++; return null; }) as any;
  window.addEventListener('baky:purge-search', () => purges++);
  sessionStorage.setItem('searchQuery', 'sensitive'); sessionStorage.setItem('unrelated', 'keep');
  try {
    privacy.executeEmergencyEscape();
    assert.equal(opens, 1); assert.equal(purges, 1);
    assert.equal(sessionStorage.getItem('searchQuery'), null);
    assert.equal(sessionStorage.getItem('unrelated'), 'keep');
  } finally { await env.close(); }
});


test('hiding the tab clears an unsent homepage query and aborts an active search', async () => {
  const { default: App } = await loadComponent('src/App.tsx');
  const env = await setup();
  let requestSignal: AbortSignal | undefined;
  globalThis.fetch = ((_url: string, init: RequestInit) => { requestSignal = init.signal as AbortSignal; return new Promise(() => {}); }) as any;
  const enter = async (value: string) => {
    const input = document.querySelector('#search-home-input') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return input;
  };
  try {
    await act(async () => env.root.render(React.createElement(App)));
    const original = await enter('private draft');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    assert.notEqual(document.querySelector('#search-home-input'), original);
    assert.equal((document.querySelector('#search-home-input') as HTMLInputElement).value, '');
    await enter('private search');
    await act(async () => document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    assert.ok(requestSignal);
    await act(async () => document.dispatchEvent(new Event('visibilitychange')));
    assert.equal(requestSignal!.aborted, true);
    assert.equal(document.querySelector('#search-results-page'), null);
    assert.equal((document.querySelector('#search-home-input') as HTMLInputElement).value, '');
  } finally { await env.close(); }
});

test('image link copying reports success only after a real write and offers the actual URL when the clipboard fails', async () => {
  const { default: ImageViewerModal } = await loadComponent('src/components/ImageViewerModal.tsx');
  const env = await setup();
  const images = [
    { ...hit('First image'), thumbnail: 'https://images.example/first.jpg' },
    { ...hit('Second image'), thumbnail: 'https://images.example/second.jpg' },
  ];
  const clipboard = (value: unknown) => Object.defineProperty(navigator, 'clipboard', { configurable: true, value });
  try {
    clipboard(undefined);
    await act(async () => env.root.render(React.createElement(ImageViewerModal, { images, initialIndex: 0, onClose: () => {}, settings })));
    const copy = document.querySelector('button[aria-label="Kopírovať odkaz"]') as HTMLButtonElement;
    await act(async () => copy.click());
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /Kopírovanie nie je dostupné/);
    assert.equal((document.querySelector('input[aria-label="Odkaz na zdrojový web"]') as HTMLInputElement).value, images[0].url);
    assert.equal(document.querySelector('[role="status"]'), null);

    const writes: string[] = [];
    clipboard({ writeText: async (value: string) => { writes.push(value); } });
    await act(async () => copy.click());
    assert.deepEqual(writes, [images[0].url]);
    assert.match(document.querySelector('[role="status"]')!.textContent!, /Odkaz bol skopírovaný/);
    assert.equal(document.querySelector('[role="alert"]'), null);

    clipboard({ writeText: async () => { throw new Error('Permission denied'); } });
    await act(async () => copy.click());
    assert.match(document.querySelector('[role="alert"]')!.textContent!, /skopírujte odkaz ručne/);
    assert.equal(document.querySelector('[role="status"]'), null);
    await act(async () => (document.querySelector('button[aria-label="Nasledujúci obrázok"]') as HTMLButtonElement).click());
    assert.equal(document.querySelector('[role="alert"]'), null);
    await act(async () => copy.click());
    assert.equal((document.querySelector('input[aria-label="Odkaz na zdrojový web"]') as HTMLInputElement).value, images[1].url);
  } finally { await env.close(); }
});

test('returning to a previously completed tab stays loading until its new request completes and ignores the abandoned tab response', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup();
  const pending: Array<{ url: string; signal: AbortSignal; resolve: (value: Response) => void }> = [];
  globalThis.fetch = ((url: string, init: RequestInit) => new Promise(resolve => pending.push({ url, signal: init.signal as AbortSignal, resolve }))) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props())));
    await act(async () => pending[0].resolve(response({ results: [hit('Original')], hasMore: false })));
    assert.match(document.body.textContent!, /Original snippet/);

    await act(async () => (document.querySelector('#search-tab-images') as HTMLButtonElement).click());
    await act(async () => (document.querySelector('#search-tab-all') as HTMLButtonElement).click());
    assert.equal(pending.length, 3);
    assert.equal(pending[1].signal.aborted, true);
    assert.equal(document.querySelector('#search-tabpanel')?.getAttribute('aria-busy'), 'true');
    assert.match(document.querySelector('#search-tabpanel')!.textContent!, /Načítavam výsledky/);
    assert.doesNotMatch(document.querySelector('#search-tabpanel')!.textContent!, /sa nenašli výsledky|0 načítaných výsledkov|Original snippet/);

    await act(async () => pending[1].resolve(response({ images: [{ ...hit('Abandoned image'), thumbnail: 'https://images.example/abandoned.jpg' }] })));
    assert.equal(document.querySelector('#search-tabpanel')?.getAttribute('aria-busy'), 'true');
    assert.doesNotMatch(document.body.textContent!, /Abandoned image/);
    await act(async () => pending[2].resolve(response({ results: [hit('Fresh')], hasMore: false })));
    assert.equal(document.querySelector('#search-tabpanel')?.getAttribute('aria-busy'), 'false');
    assert.match(document.body.textContent!, /Fresh snippet/);
    assert.doesNotMatch(document.body.textContent!, /Original snippet|Abandoned image|sa nenašli výsledky/);
  } finally { await env.close(); }
});

test('an active time filter stays visible with Tools closed and across queries until the user explicitly clears it', async () => {
  const { default: SearchResults } = await loadComponent('src/components/SearchResults.tsx');
  const env = await setup(); const requests: string[] = [];
  globalThis.fetch = (async (url: string) => { requests.push(url); return response({ results: [], hasMore: false }); }) as any;
  try {
    await act(async () => env.root.render(React.createElement(SearchResults, props())));
    await tick();
    await act(async () => (document.querySelector('#search-tab-tools') as HTMLButtonElement).click());
    const select = document.querySelector('#search-tools select') as HTMLSelectElement;
    await act(async () => { select.value = 'week'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await tick();
    await act(async () => (document.querySelector('#search-tab-tools') as HTMLButtonElement).click());
    assert.equal(document.querySelector('#search-tools'), null);
    let clear = document.querySelector('button[aria-label="Zrušiť časový filter"]') as HTMLButtonElement;
    assert.ok(clear);
    assert.match(clear.textContent!, /Obdobie: Posledný týždeň/);

    await act(async () => env.root.render(React.createElement(SearchResults, props({ initialQuery: 'baky os' }))));
    await tick();
    clear = document.querySelector('button[aria-label="Zrušiť časový filter"]') as HTMLButtonElement;
    assert.match(clear.textContent!, /Posledný týždeň/);
    let last = new URL(requests.at(-1)!, 'http://localhost');
    assert.equal(last.searchParams.get('q'), 'baky os');
    assert.equal(last.searchParams.get('time'), 'week');
    await act(async () => clear.click());
    await tick();
    last = new URL(requests.at(-1)!, 'http://localhost');
    assert.equal(last.searchParams.get('q'), 'baky os');
    assert.equal(last.searchParams.get('time'), 'anytime');
    assert.equal(last.searchParams.get('page'), '1');
    assert.equal(document.querySelector('button[aria-label="Zrušiť časový filter"]'), null);
  } finally { await env.close(); }
});
