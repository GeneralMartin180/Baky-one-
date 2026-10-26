import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Newspaper, RefreshCw } from 'lucide-react';
import type { MarketQuote, MarketSnapshot, TrendingNewsItem } from '../types';

const placeholders: MarketQuote[] = [
  { symbol: 'MSFT', label: 'Microsoft', kind: 'stock', url: 'https://finance.yahoo.com/quote/MSFT/', price: null, changePercent: null, updatedAt: null, currency: 'USD', status: 'unavailable' },
  { symbol: '^GSPC', label: 'S&P 500', kind: 'index', url: 'https://finance.yahoo.com/quote/%5EGSPC/', price: null, changePercent: null, updatedAt: null, currency: 'USD', status: 'unavailable' },
  { symbol: '^IXIC', label: 'Nasdaq', kind: 'index', url: 'https://finance.yahoo.com/quote/%5EIXIC/', price: null, changePercent: null, updatedAt: null, currency: 'USD', status: 'unavailable' },
];

function quotePrice(quote: MarketQuote): string {
  if (quote.price === null || !Number.isFinite(quote.price)) return '—';
  return new Intl.NumberFormat('sk-SK', quote.kind === 'stock'
    ? { style: 'currency', currency: quote.currency, currencyDisplay: 'narrowSymbol', maximumFractionDigits: 2 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quote.price);
}

function shortDate(value?: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('sk-SK', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function NewsCard({ item, openInNewTab }: { item: TrendingNewsItem; openInNewTab: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article className="overflow-hidden rounded-[22px] border border-[#e8eaed] bg-white">
      <a href={item.url} target={openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="block">
        {item.imageUrl && !imageFailed && <div className="aspect-[1.75] overflow-hidden bg-[#f1f3f4]">
          <img src={`/api/news-proxy-image?url=${encodeURIComponent(item.imageUrl)}`} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
        </div>}
        <div className="px-4 pb-4 pt-3.5">
          <div className="mb-2 flex items-center gap-2 text-[11px] text-[#70757a]">
            <span className="font-semibold text-[#3c4043]">{item.source}</span>
            {item.publishedAt && <><span aria-hidden="true">·</span><time dateTime={item.publishedAt}>{shortDate(item.publishedAt)}</time></>}
          </div>
          <h3 className="text-[19px] font-semibold leading-[1.35] tracking-[-0.25px] text-[#202124]">{item.title}</h3>
        </div>
      </a>
    </article>
  );
}

export default function MobileHomeFeed({ region = 'sk', safeSearch = true, openInNewTab = true }: { region?: string; safeSearch?: boolean; openInNewTab?: boolean }) {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [news, setNews] = useState<TrendingNewsItem[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setMarketLoading(true);
    setNewsLoading(true);
    setNewsError(false);
    async function loadMarkets() {
      try {
        const response = await fetch('/api/markets', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('markets');
        const data: MarketSnapshot = await response.json();
        if (!Array.isArray(data.quotes)) throw new Error('markets');
        if (active) setSnapshot(data);
      } catch { if (active) setSnapshot(null); }
      finally { if (active) setMarketLoading(false); }
    }
    async function loadNews() {
      try {
        const params = new URLSearchParams({ cat: 'trending', region, safeSearch: safeSearch ? '1' : '0' });
        const response = await fetch(`/api/trending?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('news');
        const data = await response.json();
        if (!Array.isArray(data.items)) throw new Error('news');
        if (active) setNews(data.items.slice(0, 8));
      } catch { if (active) { setNews([]); setNewsError(true); } }
      finally { if (active) setNewsLoading(false); }
    }
    void loadMarkets();
    void loadNews();
    return () => { active = false; controller.abort(); };
  }, [region, safeSearch, refresh]);

  const quotes = placeholders.map(fallback => snapshot?.quotes.find(quote => quote.symbol === fallback.symbol) ?? fallback);

  return (
    <div id="mobile-home-feed" className="w-full pb-6 sm:hidden">
      <section aria-label="Burza" className="pb-5 pt-5">
        <div className="search-category-scroll flex gap-2 overflow-x-auto px-4 pb-1">
          {quotes.map(quote => {
            const change = quote.changePercent;
            const rising = change !== null && change >= 0;
            const color = change === null ? 'text-[#70757a]' : rising ? 'text-[#188038]' : 'text-[#c5221f]';
            const Direction = rising ? ArrowUpRight : ArrowDownRight;
            return <a key={quote.symbol} href={quote.url} target={openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" aria-label={`${quote.label}: ${marketLoading ? 'načítavam' : quotePrice(quote)}`} className="min-w-[136px] flex-1 rounded-2xl border border-[#e2e5e9] bg-white px-3 py-3" title={quote.updatedAt ? `Cena k ${shortDate(quote.updatedAt)}` : 'Údaje momentálne nie sú dostupné'}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="whitespace-nowrap font-medium text-[#3c4043]">{quote.symbol === 'MSFT' ? 'MSFT' : quote.label}</span>
                {change !== null && <span className={`whitespace-nowrap text-[10px] ${color}`}>{change >= 0 ? '+' : ''}{change.toLocaleString('sk-SK', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}%</span>}
              </div>
              <div className="mt-2 flex items-center justify-between gap-1">
                <span className="whitespace-nowrap text-[17px] font-medium tracking-[-0.5px] text-[#202124]">{marketLoading ? '—' : quotePrice(quote)}</span>
                {change !== null && <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${rising ? 'bg-[#e6f4ea]' : 'bg-[#fce8e6]'} ${color}`}><Direction className="h-3.5 w-3.5" aria-hidden="true" /></span>}
              </div>
            </a>;
          })}
        </div>
        {!marketLoading && snapshot && snapshot.quotes.some(quote => quote.status !== 'unavailable') && <span className="sr-only">Posledné dostupné ceny · Yahoo Finance</span>}
        {!marketLoading && (!snapshot || snapshot.quotes.every(quote => quote.status === 'unavailable')) && <p className="mt-2 px-4 text-[11px] text-[#70757a]" aria-live="polite">Ceny teraz nie sú dostupné.</p>}
      </section>

      <section id="mobile-news" aria-labelledby="mobile-news-heading" className="border-t border-[#f1f3f4] bg-[#f8f9fa] px-4 pb-4 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="mobile-news-heading" className="flex items-center gap-2 text-[17px] font-semibold text-[#202124]"><Newspaper className="h-4 w-4 text-[#5f6368]" />Novinky</h2>
          <button type="button" aria-label="Obnoviť burzu a novinky" onClick={() => setRefresh(value => value + 1)} disabled={newsLoading || marketLoading} className="flex h-9 w-9 items-center justify-center rounded-full text-[#5f6368] hover:bg-[#e8eaed] disabled:opacity-40"><RefreshCw className={`h-4 w-4 ${newsLoading ? 'animate-spin' : ''}`} /></button>
        </div>
        {newsLoading && !news.length && <div role="status" className="rounded-[22px] border border-[#e8eaed] bg-white p-5 text-sm text-[#70757a]">Načítavam novinky…</div>}
        {!newsLoading && !news.length && <p role="status" className="rounded-[22px] border border-[#e8eaed] bg-white p-5 text-sm leading-relaxed text-[#70757a]">{newsError ? 'Novinky sa nepodarilo načítať. Skúste ich obnoviť.' : 'Momentálne nie sú dostupné žiadne novinky.'}</p>}
        <div className="space-y-4">{news.map(item => <NewsCard key={item.url} item={item} openInNewTab={openInNewTab} />)}</div>
      </section>
    </div>
  );
}
