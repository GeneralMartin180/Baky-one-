import { FormEvent, useEffect, useState } from 'react';
import { Search, X, Mic, LayoutGrid, Loader2, Settings, Shield, ExternalLink, SlidersHorizontal, Newspaper, Maximize2 } from 'lucide-react';
import type { SearchTab, SearchResult, AppSettings, ActiveModal, YouTubeVideoItem, SearchOverview, TrendingNewsItem } from '../types';
import SearchResultItem from './SearchResultItem';
import YouTubeVideoCard from './YouTubeVideoCard';
import YouTubePlayerModal from './YouTubePlayerModal';
import YouTubeShortsCard from './YouTubeShortsCard';
import BrandLogo from './BrandLogo';
import ImageViewerModal from './ImageViewerModal';
import BakyAiPill from './BakyAiPill';
import BakyAiOverviewCard from './BakyAiOverviewCard';
import { useVoiceSearch } from './useVoiceSearch';

interface SearchResultsProps {
  initialQuery: string;
  initialTab?: SearchTab;
  searchTimestamp?: number;
  onSearchAgain: (query: string) => void;
  onBackToHome: () => void;
  settings: AppSettings;
  brandTitle?: string;
  onOpenModal?: (modal: ActiveModal) => void;
  aiMode?: boolean;
  onToggleAiMode?: (active: boolean) => void;
}

interface SearchData {
  key: string;
  results: SearchResult[];
  images: SearchResult[];
  videos: YouTubeVideoItem[];
  shorts: YouTubeVideoItem[];
  news: TrendingNewsItem[];
  overview: SearchOverview | null;
  hasMore: boolean;
  elapsedMs?: number;
  error?: string;
  degraded?: boolean;
  correctedQuery?: string;
}
const emptyData = (key: string): SearchData => ({ key, results: [], images: [], videos: [], shorts: [], news: [], overview: null, hasMore: false });
const tabs: Array<{ id: SearchTab; label: string }> = [
  { id: 'all', label: 'Všetko' }, { id: 'images', label: 'Obrázky' },
  { id: 'videos', label: 'Videá' }, { id: 'news', label: 'Správy' }, { id: 'shorts', label: 'Krátke videá' },
];
const endpoints: Record<SearchTab, string> = { all: 'search', images: 'images', videos: 'videos', news: 'news', shorts: 'shorts' };
const resultKeys: Record<SearchTab, string> = { all: 'results', images: 'images', videos: 'videos', news: 'items', shorts: 'shorts' };
const timeFilterLabels: Record<string, string> = { day: 'Posledných 24 hodín', week: 'Posledný týždeň', month: 'Posledný mesiac' };

export default function SearchResults({ initialQuery, initialTab = 'all', searchTimestamp, onSearchAgain, onBackToHome, settings, onOpenModal, aiMode = false, onToggleAiMode }: SearchResultsProps) {
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<SearchTab>(initialTab);
  const [currentPage, setCurrentPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [timeFilter, setTimeFilter] = useState('anytime');
  const [showTools, setShowTools] = useState(false);
  const [showApps, setShowApps] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideoItem | null>(null);
  const [data, setData] = useState<SearchData>(() => emptyData(''));
  const [completedKey, setCompletedKey] = useState('');
  const params = new URLSearchParams({ q: initialQuery.trim(), page: String(activeTab === 'all' ? currentPage : 1), safeSearch: settings.safeSearch ? '1' : '0', region: settings.region, time: timeFilter });
  const requestKey = `${activeTab}:${params}:${searchTimestamp}:${refresh}`;
  const visible = data.key === requestKey ? data : emptyData(requestKey);
  const loading = data.key !== requestKey || completedKey !== requestKey;

  useEffect(() => {
    setQueryInput(initialQuery);
    setCurrentPage(1);
  }, [initialQuery, searchTimestamp]);
  useEffect(() => { setCurrentPage(1); }, [settings.safeSearch, settings.region, timeFilter]);
  useEffect(() => {
    setSelectedImageIndex(null);
    setSelectedVideo(null);
  }, [requestKey]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setData(emptyData(requestKey));
    setCompletedKey('');
    async function load() {
      try {
        const response = await fetch(`/api/${endpoints[activeTab]}?${params}`, { signal: controller.signal, cache: 'no-store' });
        let body;
        try { body = await response.json(); }
        catch { throw new Error('Vyhľadávanie vrátilo neplatnú odpoveď. Skúste to znova.'); }
        if (!active) return;
        if (!response.ok || body?.error) throw new Error(typeof body?.error === 'string' ? body.error : 'Vyhľadávanie je dočasne nedostupné. Skúste to znova.');
        if (!body || typeof body !== 'object' || !Array.isArray(body[resultKeys[activeTab]])) throw new Error('Vyhľadávanie vrátilo neplatnú odpoveď. Skúste to znova.');
        setData({
          key: requestKey,
          results: Array.isArray(body.results) ? body.results : [],
          images: Array.isArray(body.images) ? body.images : [],
          videos: Array.isArray(body.videos) ? body.videos : [],
          shorts: Array.isArray(body.shorts) ? body.shorts : [],
          news: Array.isArray(body.items) ? body.items : [],
          overview: body.overview || null,
          hasMore: body.hasMore === true,
          elapsedMs: typeof body.elapsedMs === 'number' ? body.elapsedMs : undefined,
          degraded: body.degraded === true,
          correctedQuery: activeTab === 'all' && typeof body.correctedQuery === 'string' && body.correctedQuery.trim().length > 0 && body.correctedQuery.length <= 500 ? body.correctedQuery.trim() : undefined,
        });
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setData({ ...emptyData(requestKey), error: error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Nepodarilo sa pripojiť k vyhľadávaniu. Skúste to znova.' });
        }
      } finally {
        if (active) setCompletedKey(requestKey);
      }
    }
    load();
    return () => { active = false; controller.abort(); };
  }, [requestKey]);

  const submitQuery = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setCurrentPage(1);
    if (trimmed === initialQuery) setRefresh((value) => value + 1);
    else onSearchAgain(trimmed);
  };
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); submitQuery(queryInput); };
  const { isListening, voiceError, startVoiceSearch, isSupported: voiceSupported } = useVoiceSearch((text) => { setQueryInput(text); submitQuery(text); });
  const images = visible.images.filter((image) => Boolean(image.thumbnail));
  const resultCount = activeTab === 'all' ? visible.results.length : activeTab === 'images' ? images.length : activeTab === 'videos' ? visible.videos.length : activeTab === 'shorts' ? visible.shorts.length : visible.news.length;

  return (
    <div id="search-results-page" className="min-h-screen bg-white text-[#202124] flex flex-col font-sans" style={{ fontFamily: 'Arial, Roboto, Helvetica, sans-serif' }}>
      <header id="search-header" className="sticky top-0 bg-white z-40 border-b border-[#dadce0]">
        <div className="grid grid-cols-[minmax(0,1fr)_44px] sm:flex items-center gap-x-3 gap-y-4 sm:gap-5 px-4 sm:px-6 md:px-8 pt-3 sm:pt-4 pb-4 sm:pb-3">
          <BrandLogo size="md" onClick={onBackToHome} className="col-start-1 col-span-2 row-start-1 justify-self-center shrink-0" />
          <form onSubmit={handleSubmit} role="search" autoComplete="off" className="col-start-1 col-span-2 row-start-2 sm:flex-1 min-w-0 w-full sm:max-w-[692px]">
            <div className="baky-search-field flex items-center rounded-full bg-[#f8f9fa] sm:bg-white border border-[#dfe1e5] pl-4 pr-2 h-12 sm:h-11 gap-0.5">
              <input id="search-input" name="ephemeral_search_query" type="search" value={queryInput} onChange={(event) => setQueryInput(event.target.value)} aria-label="Hľadaný výraz" className="min-w-0 flex-1 w-full bg-transparent text-base outline-none" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-lpignore="true" data-1p-ignore="true" />
              {queryInput && <button type="button" onClick={() => setQueryInput('')} aria-label="Vymazať výraz" className="grid place-items-center shrink-0 w-8 h-10 sm:h-8 rounded-full text-[#70757a]"><X className="w-4 h-4" /></button>}
              {voiceSupported && <button type="button" onClick={startVoiceSearch} aria-label={isListening ? 'Zastaviť hlasové vyhľadávanie' : 'Hlasové vyhľadávanie'} aria-pressed={isListening} title="Hlas rozpoznáva služba vášho prehliadača" className={`grid place-items-center shrink-0 w-8 h-10 sm:h-8 rounded-full ${isListening ? 'text-red-600 animate-pulse' : 'text-[#4285f4]'}`}><Mic className="w-4 h-4" /></button>}
              <button type="submit" aria-label="Hľadať" className="grid place-items-center shrink-0 w-8 h-10 sm:h-8 rounded-full text-[#4285f4]"><Search className="w-5 h-5" /></button>
              <BakyAiPill size="sm" isActive={aiMode} onToggle={onToggleAiMode} className="shrink-0" />
            </div>
          </form>
          <div className="col-start-2 row-start-1 justify-self-end sm:ml-auto relative shrink-0">
            <button type="button" id="search-apps-btn" onClick={() => setShowApps((value) => !value)} aria-label="Aplikácie a nastavenia" aria-expanded={showApps} aria-controls="search-apps-dropdown" className="w-11 h-11 sm:w-9 sm:h-9 grid place-items-center text-[#5f6368] rounded-full hover:bg-neutral-100"><LayoutGrid className="w-5 h-5" /></button>
            {showApps && <div id="search-apps-dropdown" className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-xl border border-[#dadce0] p-3 z-50" onKeyDown={(event) => { if (event.key === 'Escape') { setShowApps(false); (event.currentTarget.previousElementSibling as HTMLElement)?.focus(); } }}>
              <a href="https://www.bakyos.com" target="_blank" rel="noopener noreferrer" className="block p-2 hover:bg-neutral-50 rounded-lg">Baky OS</a>
              <a href="https://bakyfinance-sk.vercel.app/" target="_blank" rel="noopener noreferrer" className="block p-2 hover:bg-neutral-50 rounded-lg">Financie</a>
              <a href="https://baky-ai-your-smart-partner.vercel.app/" target="_blank" rel="noopener noreferrer" className="block p-2 hover:bg-neutral-50 rounded-lg">Baky AI</a>
              <a href="https://baky-news.vercel.app/" target="_blank" rel="noopener noreferrer" className="block p-2 hover:bg-neutral-50 rounded-lg">Baky News</a>
              <button type="button" onClick={() => { setShowApps(false); onOpenModal?.('settings'); }} className="flex items-center gap-2 w-full p-2 hover:bg-neutral-50 rounded-lg"><Settings className="w-4 h-4" />Nastavenia</button>
              <button type="button" onClick={() => { setShowApps(false); onOpenModal?.('privacy'); }} className="flex items-center gap-2 w-full p-2 hover:bg-neutral-50 rounded-lg"><Shield className="w-4 h-4" />Súkromie</button>
            </div>}
          </div>
        </div>
        {voiceError && <p role="alert" className="px-4 pb-2 text-xs text-red-700">{voiceError}</p>}
        <div className="flex items-stretch gap-1 pl-2 pr-3 sm:px-6 md:px-8 text-sm">
          <div className="search-category-scroll flex items-stretch flex-1 min-w-0 overflow-x-auto">
          <div className="flex items-center shrink-0 gap-1 sm:gap-0" role="tablist" aria-label="Typ výsledkov">
            {tabs.map((tab) => <button key={tab.id} type="button" id={`search-tab-${tab.id}`} role="tab" aria-selected={activeTab === tab.id} aria-controls="search-tabpanel" onClick={() => { setActiveTab(tab.id); setCurrentPage(1); }} onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const index = tabs.findIndex((item) => item.id === activeTab);
              const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
              setActiveTab(tabs[next].id); setCurrentPage(1); document.getElementById(`search-tab-${tabs[next].id}`)?.focus();
            }} tabIndex={activeTab === tab.id ? 0 : -1} className={`min-h-12 px-3 py-3 whitespace-nowrap border-b-[3px] transition-colors ${activeTab === tab.id ? 'border-[#1a73e8] text-[#1a73e8] font-medium' : 'border-transparent text-[#4d5156] hover:text-[#202124]'}`}>{tab.label}</button>)}
          </div>
          <a href={`https://openlibrary.org/search?q=${encodeURIComponent(initialQuery)}`} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="hidden sm:flex items-center px-3 py-3 text-[#4d5156] shrink-0">Knihy</a>
          <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(initialQuery)}`} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="hidden sm:flex items-center px-3 py-3 text-[#4d5156] shrink-0">Mapy</a>
          </div>
          <button type="button" id="search-tab-tools" onClick={() => setShowTools((value) => !value)} aria-label="Nástroje" aria-expanded={showTools} aria-controls="search-tools" className={`flex items-center justify-center gap-2 self-center w-10 h-10 sm:w-auto sm:px-3 rounded-full shrink-0 ${showTools ? 'bg-[#e8f0fe] text-[#1a73e8]' : 'text-[#4d5156] hover:bg-[#f1f3f4]'}`}><SlidersHorizontal className="w-4 h-4" /><span className="hidden sm:inline">Nástroje</span></button>
        </div>
        {showTools && <div id="search-tools" className="flex flex-wrap items-center gap-3 px-4 sm:px-6 py-2 bg-neutral-50 border-t text-xs">
          <label className="flex items-center gap-2">Obdobie<select value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)} className="border rounded-lg p-1.5 bg-white"><option value="anytime">Kedykoľvek</option><option value="day">Posledných 24 hodín</option><option value="week">Posledný týždeň</option><option value="month">Posledný mesiac</option></select></label>
          <button type="button" onClick={() => onOpenModal?.('settings')} className="text-[#1a73e8] flex items-center gap-1"><Settings className="w-3.5 h-3.5" />Nastavenia</button>
          <a href={`https://openlibrary.org/search?q=${encodeURIComponent(initialQuery)}`} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="sm:hidden py-2 text-[#4d5156]">Knihy ↗</a>
          <a href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(initialQuery)}`} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="sm:hidden py-2 text-[#4d5156]">Mapy ↗</a>
        </div>}
      </header>
      <div className={`flex-1 px-4 sm:px-6 md:px-8 py-5 ${activeTab === 'images' ? '' : 'sm:pl-12 md:pl-32'}`}>
        <div id="search-tabpanel" role="tabpanel" aria-labelledby={`search-tab-${activeTab}`} aria-busy={loading} className={activeTab === 'images' ? 'w-full' : 'w-full max-w-[692px]'}>
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-xs text-[#70757a]" aria-live="polite">{loading ? 'Načítavam výsledky…' : visible.error ? 'Výsledky sa nepodarilo načítať.' : visible.degraded && resultCount === 0 ? 'Vyhľadávanie je neúplné.' : `${resultCount} načítaných výsledkov${activeTab === 'all' ? ` • Strana ${currentPage}` : ''}${visible.elapsedMs === undefined ? '' : ` • ${(visible.elapsedMs / 1000).toLocaleString('sk-SK', { maximumFractionDigits: 2 })} s`}`}</p>
            {timeFilter !== 'anytime' && <button type="button" aria-label="Zrušiť časový filter" aria-describedby="active-time-filter-label" onClick={() => { setCurrentPage(1); setTimeFilter('anytime'); }} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#d2e3fc] bg-[#e8f0fe] py-1.5 pl-3 pr-2 text-xs text-[#174ea6] hover:bg-[#d2e3fc]">
              <span id="active-time-filter-label">Obdobie: {timeFilterLabels[timeFilter]}</span><X className="h-4 w-4 shrink-0" aria-hidden="true" />
            </button>}
          </div>
          {!loading && !visible.error && visible.correctedQuery && <p className="mb-4 text-sm text-[#5f6368]" aria-live="polite">Výsledky pre <button type="button" onClick={() => submitQuery(visible.correctedQuery!)} className="text-[#1a0dab] hover:underline">{visible.correctedQuery}</button></p>}
          {loading && <div role="status" className="flex gap-3 py-12 items-center text-[#5f6368]"><Loader2 className="w-5 h-5 animate-spin text-[#1a73e8]" />Vyhľadávam „{initialQuery}“…</div>}
          {!loading && visible.error && <div role="alert" className="p-4 bg-red-50 border border-red-200 text-red-800 rounded-xl mb-5"><p>{visible.error}</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="underline mt-2 text-sm">Skúsiť znova</button></div>}
          {!loading && !visible.error && <>
            {activeTab === 'all' && <div id="all-results-view">
              {visible.results[0] && <SearchResultItem item={visible.results[0]} settings={settings} index={0} />}
              {currentPage === 1 && aiMode && <BakyAiOverviewCard query={initialQuery} results={visible.results} wikiSummary={visible.overview} openInNewTab={settings.openInNewTab} />}
              {visible.results.slice(1).map((item, index) => <SearchResultItem key={item.id} item={item} settings={settings} index={index + 1} />)}
            </div>}
            {activeTab === 'images' && <div id="images-results-view" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {images.map((item, index) => <article key={item.id || index} className="rounded-xl border border-[#dadce0] overflow-hidden bg-white">
                <button type="button" onClick={() => setSelectedImageIndex(index)} aria-label={`Zväčšiť obrázok: ${item.title}`} className="relative w-full aspect-4/3 bg-neutral-100 group block"><img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" /><Maximize2 className="absolute bottom-2 right-2 text-white drop-shadow-md w-5 h-5" /></button>
                <div className="p-2.5"><p className="text-xs font-medium truncate" title={item.title}>{item.title}</p><a href={item.url} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="text-xs text-[#5f6368] flex gap-1 items-center mt-1"><span className="truncate">{item.siteName || item.displayUrl}</span><ExternalLink className="w-3 h-3 shrink-0" /></a></div>
              </article>)}
            </div>}
            {activeTab === 'videos' && <div id="videos-results-view">{visible.videos.map((video) => <YouTubeVideoCard key={video.id} video={video} settings={settings} onPlayModal={setSelectedVideo} />)}</div>}
            {activeTab === 'shorts' && <div id="shorts-results-view" className="grid grid-cols-2 sm:grid-cols-3 gap-3">{visible.shorts.map((short) => <YouTubeShortsCard key={short.id} short={short} onPlay={setSelectedVideo} settings={settings} />)}</div>}
            {activeTab === 'news' && <div id="news-results-view" className="space-y-4">{visible.news.map((item) => <article key={item.id} className="p-4 rounded-xl border border-[#dadce0] flex gap-3">
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-xs text-[#5f6368] mb-1"><Newspaper className="w-3.5 h-3.5" />{item.source}{item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) && <time dateTime={item.publishedAt}>{new Date(item.publishedAt).toLocaleDateString('sk-SK')}</time>}</div><h2 className="text-base text-[#1a0dab] font-medium"><a href={item.url} target={settings.openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="hover:underline">{item.title}</a></h2><p className="mt-1.5 text-sm text-[#4d5156] line-clamp-3">{item.snippet}</p></div>
              {item.imageUrl && <img src={item.imageUrl} alt="" className="w-20 h-20 sm:w-24 object-cover rounded-lg shrink-0" loading="lazy" referrerPolicy="no-referrer" />}
            </article>)}</div>}
            {resultCount === 0 && (visible.degraded ? <div role="status" className="py-12 text-sm text-[#5f6368]"><p>Výsledky sa zatiaľ nepodarilo načítať. Niektoré zdroje sú dočasne nedostupné.</p><button type="button" onClick={() => setRefresh((value) => value + 1)} className="mt-3 min-h-10 rounded-full border border-[#dadce0] px-4 text-[#1a73e8] hover:bg-[#f8f9fa]">Skúsiť znova</button></div> : <p className="py-12 text-sm text-[#5f6368]">Pre „{initialQuery}“ sa nenašli výsledky. Skúste upraviť dopyt alebo filtre.</p>)}
          </>}
          {activeTab === 'all' && !loading && (currentPage > 1 || visible.hasMore) && <nav id="search-pagination" aria-label="Stránkovanie výsledkov" className="flex items-center gap-4 justify-center py-8 text-sm text-[#1a73e8]">
            {currentPage > 1 && <button id="pagination-prev" type="button" onClick={() => { setCurrentPage((page) => page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="border rounded-full px-4 py-2">Späť</button>}
            <span aria-current="page">Strana {currentPage}</span>
            {visible.hasMore && !visible.error && <button id="pagination-next" type="button" onClick={() => { setCurrentPage((page) => page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="border rounded-full px-4 py-2">Ďalej</button>}
          </nav>}
        </div>
      </div>
      {selectedVideo && <YouTubePlayerModal video={selectedVideo} onClose={() => setSelectedVideo(null)} settings={settings} />}
      {selectedImageIndex !== null && images.length > 0 && <ImageViewerModal images={images} initialIndex={selectedImageIndex} onClose={() => setSelectedImageIndex(null)} settings={settings} />}
    </div>
  );
}
