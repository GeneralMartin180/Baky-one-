import { useState, useRef, useEffect, FormEvent } from 'react';
import { Mic, Search, X, LayoutGrid, Sparkles, TrendingUp, Newspaper, SlidersHorizontal } from 'lucide-react';
import { ActiveModal, AppSettings, SearchTab } from '../types';
import BrandLogo from './BrandLogo';
import BakyAiPill from './BakyAiPill';
import bakyLogo from '../assets/baky-one-256.png';
import { useVoiceSearch } from './useVoiceSearch';
import MobileHomeFeed from './MobileHomeFeed';

export function BakyOneLogo({ className = 'w-10 h-10' }: { className?: string }) {
  return (
    <img
      src={bakyLogo}
      alt="Baky One"
      className={`${className} object-contain select-none`}
      draggable={false}
    />
  );
}

interface SearchHomeProps {
  onSearch: (query: string, isAiMode?: boolean, tab?: SearchTab) => void;
  onOpenModal?: (modal: ActiveModal) => void;
  brandTitle?: string;
  onSelectBrandTitle?: (title: string) => void;
  aiMode?: boolean;
  onToggleAiMode?: (active: boolean) => void;
  settings?: AppSettings;
}

export default function SearchHome({
  onSearch,
  onOpenModal,
  aiMode = false,
  onToggleAiMode,
  settings,
}: SearchHomeProps) {
  const [query, setQuery] = useState('');
  const [showAppsDropdown, setShowAppsDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [searchTab, setSearchTab] = useState<SearchTab>('all');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && Boolean(window.matchMedia?.('(max-width: 639px)').matches));
  useEffect(() => {
    const media = window.matchMedia?.('(max-width: 639px)');
    if (!media) return;
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const { isListening, voiceError, startVoiceSearch, isSupported: voiceSupported } = useVoiceSearch((text) => {
    setQuery(text);
    onSearch(text, aiMode, searchTab);
  });

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), aiMode, searchTab);
    }
  };

  return (
    <div
      id="search-home-container"
      className="min-h-screen w-full flex flex-col items-center bg-white text-[#202124] select-text"
      style={{ fontFamily: 'Arial, Roboto, Helvetica, sans-serif' }}
    >
      <header
        id="search-home-header"
        className="w-full flex items-center justify-between sm:justify-end z-20 px-4 sm:px-6 h-14 sm:h-auto sm:py-4 select-none"
      >
        <button type="button" onClick={() => onOpenModal?.('settings')} aria-label="Nastavenia" className="sm:hidden flex h-10 w-10 items-center justify-center rounded-full text-[#3c4043] hover:bg-[#f1f3f4]"><SlidersHorizontal className="h-5 w-5" /></button>
        <div className="flex items-center gap-4 text-[13px] text-[#202124]">
          <button
            type="button"
            onClick={() => {
              setSearchTab('images');
              if (query.trim()) onSearch(query.trim(), aiMode, 'images');
              else inputRef.current?.focus();
            }}
            aria-pressed={searchTab === 'images'}
            className="hidden sm:block hover:underline cursor-pointer"
          >
            Obrázky
          </button>

          {/* 9-dots Apps button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAppsDropdown(!showAppsDropdown)}
              className="flex h-10 w-10 items-center justify-center text-[#5f6368] hover:text-[#202124] hover:bg-[#f1f3f4] rounded-full transition-colors cursor-pointer"
              title="Aplikácie"
                aria-label="Aplikácie"
                aria-expanded={showAppsDropdown}
                aria-controls="search-home-apps-dropdown"
            >
              <LayoutGrid className="hidden sm:block w-5 h-5" />
              <span className="sm:hidden flex h-8 w-8 items-center justify-center rounded-full border border-[#dadce0] bg-white"><BakyOneLogo className="h-6 w-6" /></span>
            </button>

            {showAppsDropdown && (
              <div
                id="search-home-apps-dropdown"
                className="absolute right-0 mt-2 w-72 bg-white rounded-3xl shadow-xl border border-[#dadce0] p-4 z-50 animate-in fade-in duration-100"
                onKeyDown={(event) => { if (event.key === 'Escape') { setShowAppsDropdown(false); (event.currentTarget.previousElementSibling as HTMLElement)?.focus(); } }}
              >
                <div className="text-[12px] font-medium text-[#5f6368] uppercase px-2 mb-2">
                  Aplikácie a ekosystém
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <a
                    href="https://www.bakyos.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-2xl hover:bg-[#f8f9fa] flex flex-col items-center gap-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-[#1a73e8] flex items-center justify-center font-bold text-sm">
                      B
                    </div>
                    <span className="text-[11px] font-medium">Baky OS</span>
                  </a>
                  <a
                    href="https://bakyfinance-sk.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-2xl hover:bg-[#f8f9fa] flex flex-col items-center gap-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium">Financie</span>
                  </a>
                  <a
                    href="https://baky-ai-your-smart-partner.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-2xl hover:bg-[#f8f9fa] flex flex-col items-center gap-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-purple-50 text-[#9334e8] flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium">Baky AI</span>
                  </a>
                  <a
                    href="https://baky-news.vercel.app/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-2xl hover:bg-[#f8f9fa] flex flex-col items-center gap-1"
                  >
                    <div className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center">
                      <Newspaper className="w-5 h-5" />
                    </div>
                    <span className="text-[11px] font-medium">Baky News</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAppsDropdown(false);
                      onOpenModal?.('settings');
                    }}
                    className="p-2.5 rounded-2xl hover:bg-[#f8f9fa] flex flex-col items-center gap-1 cursor-pointer"
                  >
                    <div className="w-10 h-10 rounded-full bg-neutral-100 text-neutral-700 flex items-center justify-center text-xs">
                      ⚙️
                    </div>
                    <span className="text-[11px] font-medium">Nastavenia</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="sm:flex-1 w-full flex flex-col items-center sm:justify-center px-4 z-10 pt-2 sm:pt-0 sm:-mt-14">
        <div className="w-full max-w-[650px] sm:max-w-[680px] flex flex-col items-center">
          {/* Brand Center Logo & Title */}
          <div className="mb-6 sm:mb-8 flex items-center justify-center">
            <BrandLogo size="lg" className="[&_span]:text-[34px] sm:[&_span]:text-5xl sm:scale-125" />
          </div>

          {/* Search Input Box */}
          <form onSubmit={handleSubmit} className="w-full" autoComplete="off" noValidate>
            <div
              id="search-home-search-pill"
              className="baky-search-field w-full flex items-center bg-[#f3f4f5] sm:bg-white border border-transparent sm:border-[#dfe1e5] hover:shadow-[0_1px_6px_rgba(32,33,36,0.14)] rounded-full pl-5 pr-3 sm:px-4 h-14 sm:h-[50px] transition-all duration-150"
            >
              {/* Search Glass Icon */}
              <button type="submit" aria-label="Hľadať" className="hidden sm:flex mr-3 h-8 w-5 items-center justify-center text-[#9aa0a6] shrink-0"><Search className="w-5 h-5" /></button>

              <input
                ref={inputRef}
                id="search-home-input"
                name="ephemeral_home_search_query"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchTab === 'images' ? 'Hľadať obrázky…' : isMobile ? 'Hľadať' : ''}
                aria-label={searchTab === 'images' ? 'Hľadaný výraz pre obrázky' : 'Hľadaný výraz'}
                className="w-full bg-transparent text-[#202124] text-[16px] outline-none min-w-0 pr-2"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-form-type="other"
                data-1p-ignore="true"
                aria-autocomplete="none"
              />

              {/* Clear Button */}
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    inputRef.current?.focus();
                  }}
                  className="p-1 text-[#70757a] hover:text-[#202124] rounded-full transition-colors cursor-pointer mr-1.5 shrink-0"
                  aria-label="Vymazať"
                >
                  <X className="w-4.5 h-4.5" />
                </button>
              )}

              {/* Microphone Voice Search */}
              {voiceSupported && <button
                type="button"
                onClick={startVoiceSearch}
                className="flex h-10 w-9 items-center justify-center text-[#3c4043] sm:text-[#4285f4] hover:text-[#1a73e8] transition-colors cursor-pointer shrink-0 sm:mr-2"
                title="Hlas rozpoznáva služba vášho prehliadača"
                aria-label={isListening ? 'Zastaviť hlasové vyhľadávanie' : 'Hlasové vyhľadávanie'}
                aria-pressed={isListening}
              >
                <Mic className="w-5 h-5" />
              </button>}

              {/* Ask AI Mode Pill - on the RIGHT */}
              <div className="hidden sm:block shrink-0">
                <BakyAiPill
                  isActive={aiMode}
                  onToggle={onToggleAiMode}
                  size="md"
                />
              </div>
            </div>

            {/* Centered Search Action Buttons */}
            <div className="hidden sm:flex items-center justify-center gap-3 mt-6 sm:mt-7 select-none">
              <button
                type="submit"
                className="h-9 px-4 bg-[#f8f9fa] hover:bg-[#f1f3f4] border border-[#f8f9fa] hover:border-[#dadce0] rounded text-[14px] text-[#3c4043] transition-colors cursor-pointer font-normal"
              >
                {searchTab === 'images' ? 'Vyhľadať obrázky' : 'Vyhľadať v Baky One'}
              </button>
              <button
                type="button"
                onClick={() => onToggleAiMode?.(!aiMode)}
                className="h-9 px-4 bg-[#f8f9fa] hover:bg-[#f1f3f4] border border-[#f8f9fa] hover:border-[#dadce0] rounded text-[14px] text-[#3c4043] flex items-center gap-1.5 transition-colors cursor-pointer font-normal"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#1a73e8]" />
                <span>{aiMode ? 'Prehľad zapnutý' : 'Prehľad zdrojov'}</span>
              </button>
            </div>
          </form>
          <div className="mt-3 flex w-full items-center gap-2 sm:hidden">
            <a id="mobile-ai-mode" href="https://baky-ai-your-smart-partner.vercel.app/" target={settings?.openInNewTab === false ? '_self' : '_blank'} rel="noopener noreferrer" className="flex h-12 flex-[1.35] items-center justify-center gap-2 rounded-full bg-[#f3f4f5] text-[13px] font-medium text-[#202124]"><Sparkles className="h-4 w-4" />AI Mode</a>
            <button type="button" onClick={() => document.getElementById('mobile-news')?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#f3f4f5] text-[13px] text-[#3c4043]"><Newspaper className="h-4 w-4" />Novinky</button>
          </div>
          {voiceError && <p role="alert" className="mt-3 text-xs text-red-700">{voiceError}</p>}
          {searchTab === 'images' && <button type="button" className="mt-3 text-xs text-blue-700 underline" onClick={() => setSearchTab('all')}>Prepnúť na webové vyhľadávanie</button>}
        </div>
      </div>

      {isMobile && <MobileHomeFeed region={settings?.region} safeSearch={settings?.safeSearch} openInNewTab={settings?.openInNewTab} />}

      {/* Subtle Bottom Bar to keep center alignment mathematically balanced */}
      <footer className="mt-auto hidden w-full py-4 text-center text-[11px] sm:block sm:text-xs text-[#70757a] select-none shrink-0 opacity-80">
        Baky One • Vyhľadávanie bez ukladania histórie dotazov
      </footer>
    </div>
  );
}
