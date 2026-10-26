import type { MarketQuote, MarketSnapshot, MarketSymbol } from '../types.ts';
import { serverFetch } from './serverTransport.ts';

const instruments: ReadonlyArray<{ symbol: MarketSymbol; label: string; kind: MarketQuote['kind'] }> = [
  { symbol: 'MSFT', label: 'Microsoft', kind: 'stock' },
  { symbol: '^GSPC', label: 'S&P 500', kind: 'index' },
  { symbol: '^IXIC', label: 'Nasdaq', kind: 'index' },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function unavailableQuote(symbol: MarketSymbol): MarketQuote {
  const instrument = instruments.find(entry => entry.symbol === symbol)!;
  return {
    ...instrument, currency: 'USD', price: null, changePercent: null, updatedAt: null,
    url: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`, status: 'unavailable',
  };
}

/** The one-day chart supplies the previous session's close; a longer range does not. */
export function parseMarketQuote(value: unknown, symbol: MarketSymbol): MarketQuote {
  const quote = unavailableQuote(symbol);
  if (!isRecord(value) || !isRecord(value.chart) || value.chart.error != null) return quote;
  const result = Array.isArray(value.chart.result) ? value.chart.result[0] : undefined;
  if (!isRecord(result) || !isRecord(result.meta)) return quote;
  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const time = meta.regularMarketTime;
  if (meta.symbol !== symbol || !finite(price) || price <= 0 || !finite(time) || time <= 0) return quote;
  const updated = new Date(time * 1000);
  if (!Number.isFinite(updated.getTime()) || typeof meta.currency !== 'string' || !/^[A-Z]{3}$/.test(meta.currency)) return quote;

  // Prefer the provider's daily percentage. A missing change stays unknown rather than becoming zero.
  const previousClose = finite(meta.previousClose) ? meta.previousClose
    : meta.range === '1d' && finite(meta.chartPreviousClose) ? meta.chartPreviousClose : null;
  const calculatedChange = previousClose !== null && previousClose > 0 ? (price / previousClose - 1) * 100 : null;
  const changePercent = finite(meta.regularMarketChangePercent) ? meta.regularMarketChangePercent
    : finite(calculatedChange) ? calculatedChange : null;
  return { ...quote, price, currency: meta.currency, changePercent, updatedAt: updated.toISOString(), status: 'available' };
}

async function fetchQuote(symbol: MarketSymbol, signal?: AbortSignal): Promise<MarketQuote> {
  // Only these three server-owned instruments can be requested; query parameters cannot select a host or symbol.
  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.search = new URLSearchParams({ interval: '1d', range: '1d' }).toString();
  try {
    const response = await serverFetch(url, {
      signal, timeoutMs: 3500, maxBytes: 200_000,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; BakyOne/1.0)' },
    });
    if (!response.ok) return unavailableQuote(symbol);
    return parseMarketQuote(await response.json(), symbol);
  } catch { return unavailableQuote(symbol); }
}

/** Informational quotes, possibly delayed or from the last market session. No invented fallback prices. */
export async function fetchMarketQuotes(signal?: AbortSignal): Promise<MarketSnapshot> {
  const quotes = await Promise.all(instruments.map(instrument => fetchQuote(instrument.symbol, signal)));
  const unavailable = quotes.filter(quote => quote.status === 'unavailable').map(quote => quote.symbol);
  return { quotes, source: 'Yahoo Finance', informational: true, checkedAt: new Date().toISOString(), unavailable, degraded: unavailable.length > 0 };
}
