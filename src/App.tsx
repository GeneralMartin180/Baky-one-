import { useState, useEffect } from 'react';
import SearchHome from './components/SearchHome';
import SearchResults from './components/SearchResults';
import Footer from './components/Footer';
import InfoModals from './components/InfoModals';
import { ActiveModal, AppSettings, SearchTab } from './types';
import { initPrivacyWatchdogs } from './services/privacyEphemeralManager';
import EscapeFloatingButton from './components/EscapeFloatingButton';

export default function App() {
  const [activeQuery, setActiveQuery] = useState<string>('');
  const [searchTimestamp, setSearchTimestamp] = useState<number>(Date.now());
  const [brandTitle, setBrandTitle] = useState<string>('baky one');
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [aiMode, setAiMode] = useState<boolean>(false);
  const [initialTab, setInitialTab] = useState<SearchTab>('all');
  const [privacySession, setPrivacySession] = useState(0);
  const [settings, setSettings] = useState<AppSettings>({
    safeSearch: true,
    openInNewTab: true,
    region: 'sk',
    privacyBadgeEnabled: true,
  });

  useEffect(() => {
    // 1. Initialize privacy watchdogs (tab blur, visibility hidden, pagehide, bfcache)
    const cleanupWatchdogs = initPrivacyWatchdogs();

    // 2. Listen for search purge events to instantly return to pristine homepage
    const handlePurge = () => {
      setActiveQuery('');
      setActiveModal(null);
      setInitialTab('all');
      setPrivacySession((value) => value + 1);
    };

    window.addEventListener('baky:purge-search', handlePurge);

    return () => {
      cleanupWatchdogs();
      window.removeEventListener('baky:purge-search', handlePurge);
    };
  }, []);

  const handleSearch = (query: string, withAiMode?: boolean, tab?: SearchTab) => {
    if (withAiMode !== undefined) {
      setAiMode(withAiMode);
    }
    setActiveQuery(query);
    if (tab) setInitialTab(tab);
    setSearchTimestamp(Date.now());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBackToHome = () => {
    setActiveQuery('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return (
    <div
      id="baky-one-app-root"
      className="min-h-screen bg-white text-neutral-900 flex flex-col font-sans antialiased selection:bg-orange-500 selection:text-white"
    >
      {/* Main View: Clean Baky One Homepage or Yahoo-style Search Results */}
      <main className="flex-1 flex flex-col bg-white">
        {!activeQuery ? (
          <SearchHome
            key={privacySession}
            onSearch={handleSearch}
            onOpenModal={(modal) => setActiveModal(modal)}
            brandTitle={brandTitle}
            onSelectBrandTitle={setBrandTitle}
            aiMode={aiMode}
            onToggleAiMode={setAiMode}
            settings={settings}
          />
        ) : (
          <SearchResults
            initialQuery={activeQuery}
            initialTab={initialTab}
            searchTimestamp={searchTimestamp}
            onSearchAgain={handleSearch}
            onBackToHome={handleBackToHome}
            settings={settings}
            brandTitle={brandTitle}
            onOpenModal={(modal) => setActiveModal(modal)}
            aiMode={aiMode}
            onToggleAiMode={setAiMode}
          />
        )}
      </main>

      {/* Footer only on search results page (SearchHome has its own Brave footer matching screenshot) */}
      {Boolean(activeQuery) && (
        <Footer onOpenModal={(modal) => setActiveModal(modal)} />
      )}

      {/* Emergency Escape Button: Bottom-Right floating button during search results */}
      {Boolean(activeQuery) && (
        <EscapeFloatingButton query={activeQuery} />
      )}

      {/* Modals for Menu items */}
      <InfoModals
        activeModal={activeModal}
        onClose={() => setActiveModal(null)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />
    </div>
  );
}
