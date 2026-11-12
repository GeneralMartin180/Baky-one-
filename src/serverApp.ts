import express, { type Request, type Response } from 'express';
import { fetchFufuImages, fetchYouTubeVideos, fetchYouTubeShorts, clearFufuServerCache } from './services/fufuV12Scraper.ts';
import { scrapeTrendingNews, scrapeNewsForQuery } from './services/newsScraper.ts';
import { searchWeb } from './services/webSearchService.ts';
import { fetchSearchSuggestions } from './services/searchSuggestions.ts';
import { getNetworkStatus } from './services/serverTransport.ts';
import { ApiInputError, readCategory, readPage, readQuery, readSearchOptions } from './services/apiValidation.ts';
import { fetchNewsImage, ImageProxyError } from './services/imageProxy.ts';
import { fetchFavicon } from './services/faviconService.ts';
import { fetchMarketQuotes } from './services/marketService.ts';
import type { SearchOptions } from './services/searchOptions.ts';
import type { MarketSnapshot, SearchOverview, SearchResult, TrendingNewsItem, YouTubeVideoItem } from './types.ts';

export interface ApiServices {
  searchWeb(query: string, page: number, options: SearchOptions): Promise<{
    results: SearchResult[];
    overview?: SearchOverview | null;
    hasMore: boolean;
    elapsedMs: number;
    sources?: unknown;
    degraded?: boolean;
  }>;
  images(query: string, options: SearchOptions): Promise<SearchResult[]>;
  suggestions(query: string, options: SearchOptions): Promise<string[]>;
  videos(query: string, options: SearchOptions): Promise<YouTubeVideoItem[]>;
  shorts(query: string, options: SearchOptions): Promise<YouTubeVideoItem[]>;
  news(query: string, options: SearchOptions): Promise<TrendingNewsItem[]>;
  trending(category: string, options: SearchOptions): Promise<TrendingNewsItem[]>;
  imageProxy(value: unknown, signal?: AbortSignal): Promise<{ body: Buffer; contentType: string }>;
  favicon(value: unknown, signal?: AbortSignal): Promise<{ body: Buffer; contentType: string }>;
  markets(signal?: AbortSignal): Promise<MarketSnapshot>;
  clearLocalSession(): void;
  networkStatus(): { mode: string; configured: boolean };
}

const defaultServices: ApiServices = {
  searchWeb,
  suggestions: fetchSearchSuggestions,
  images: fetchFufuImages,
  videos: fetchYouTubeVideos,
  shorts: fetchYouTubeShorts,
  news: scrapeNewsForQuery,
  trending: scrapeTrendingNews,
  imageProxy: fetchNewsImage,
  favicon: fetchFavicon,
  markets: fetchMarketQuotes,
  clearLocalSession: clearFufuServerCache,
  networkStatus: getNetworkStatus,
};

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function sendApiError(res: Response, error: unknown): void {
  if (res.headersSent || res.destroyed) return;
  const failure = error as { status?: number; statusCode?: number; name?: string } | undefined;
  const status = error instanceof ApiInputError ? 400
    : [400, 502, 503].includes(failure?.status ?? failure?.statusCode ?? 0) ? (failure?.status ?? failure?.statusCode)!
      : failure?.name === 'AbortError' || failure?.name === 'TimeoutError' ? 503 : 502;
  const message = error instanceof ApiInputError || error instanceof ImageProxyError
    ? error.message
    : status === 503 ? 'Služba momentálne nie je dostupná. Skúste to neskôr.' : 'Zdroj výsledkov momentálne neodpovedá. Skúste to znova.';
  res.status(status).json({ success: false, error: message, code: status === 400 ? 'INVALID_INPUT' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'UPSTREAM_ERROR' });
}

type AsyncRoute = (req: Request, res: Response, signal: AbortSignal) => Promise<void>;
function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response): void => {
    const controller = new AbortController();
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    const onAbort = () => controller.abort();
    req.once('aborted', onAbort);
    res.once('close', onClose);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)]);
    Promise.resolve().then(() => handler(req, res, signal)).catch(error => {
      sendApiError(res, error);
    }).finally(() => {
      req.removeListener('aborted', onAbort);
      res.removeListener('close', onClose);
    });
  };
}

export function createApp(overrides: Partial<ApiServices> = {}) {
  const services = { ...defaultServices, ...overrides };
  const application = express();
  application.disable('x-powered-by');
  application.use((_req, res, next) => {
    noStore(res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  const router = express.Router();
  const status = () => {
    const network = services.networkStatus();
    return {
      status: 'ok', engine: 'Baky One Search',
      network: { mode: network.mode, configured: network.configured },
      storesQueries: false, controls: 'server-configured',
    };
  };
  router.get(['/health', '/fufu-status'], (_req, res) => { res.json(status()); });

  router.all(['/fufu-mutate', '/fufu-mode', '/fufu-download-proxies', '/fufu-rotate-proxy'], (_req, res) => {
    res.status(410).json({ success: false, code: 'REMOVED', error: 'Nastavenia siete spravuje prevádzkovateľ servera.' });
  });

  router.all('/clear-session', (req, res) => {
    if (!['GET', 'POST', 'HEAD'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST, HEAD');
      res.status(405).json({ error: 'Nepovolená metóda.' });
      return;
    }
    services.clearLocalSession();
    res.setHeader('Clear-Site-Data', '"cache"');
    res.json({ status: 'reset', scope: 'local-instance', message: 'Lokálna relácia bola resetovaná. Túto odpoveď nemožno použiť na vymazanie histórie prehliadača ani záznamov externých služieb.' });
  });

  router.get('/search', asyncRoute(async (req, res, signal) => {
    const query = readQuery(req.query.q);
    const page = readPage(req.query.page);
    const options = { ...readSearchOptions(req.query), signal };
    if (!query) {
      res.json({ query, page, count: 0, results: [], overview: null, images: [], videos: [], hasMore: false, elapsedMs: 0 });
      return;
    }
    const result = await services.searchWeb(query, page, options);
    res.json({ ...result, query, page, count: result.results.length, images: [], videos: [], overview: result.overview ?? null });
  }));

  router.get('/suggestions', asyncRoute(async (req, res, signal) => {
    const query = readQuery(req.query.q);
    const options = { ...readSearchOptions(req.query), signal };
    const suggestions = query.length < 2 ? [] : await services.suggestions(query, options);
    if (!signal.aborted) res.json({ suggestions });
  }));

  for (const [path, key] of [['/images', 'images'], ['/videos', 'videos'], ['/shorts', 'shorts']] as const) {
    router.get(path, asyncRoute(async (req, res, signal) => {
      const query = readQuery(req.query.q);
      const options = { ...readSearchOptions(req.query), signal };
      const list = query ? await services[key](query, options) : [];
      res.json({ success: true, query, count: list.length, [key]: list });
    }));
  }

  router.get('/news', asyncRoute(async (req, res, signal) => {
    const query = readQuery(req.query.q);
    const options = { ...readSearchOptions(req.query), signal };
    const items = query ? await services.news(query, options) : [];
    res.json({ success: true, query, count: items.length, items, timestamp: new Date().toISOString() });
  }));

  router.get('/trending', asyncRoute(async (req, res, signal) => {
    const category = readCategory(req.query.cat);
    const options = { ...readSearchOptions(req.query), signal };
    const items = await services.trending(category, options);
    res.json({ success: true, category, count: items.length, items, timestamp: new Date().toISOString() });
  }));

  router.get('/markets', asyncRoute(async (_req, res, signal) => {
    res.json(await services.markets(signal));
  }));

  router.get('/news-proxy-image', asyncRoute(async (req, res, signal) => {
    const image = await services.imageProxy(req.query.url, signal);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(image.body);
  }));

  router.get('/favicon', asyncRoute(async (req, res, signal) => {
    const image = await services.favicon(req.query.host, signal);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(image.body);
  }));

  router.all(['/health', '/fufu-status', '/search', '/suggestions', '/images', '/videos', '/shorts', '/news', '/trending', '/markets', '/news-proxy-image', '/favicon'], (_req, res) => {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).json({ success: false, error: 'Nepovolená metóda.' });
  });
  application.use('/api', router);
  application.use('/', router);
  application.all('/api/*', (_req, res) => { res.status(404).json({ error: 'Endpoint nenájdený.' }); });
  return application;
}

export const app = createApp();
export default app;
