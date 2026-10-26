import { useEffect, useState } from 'react';
import { X, ShieldCheck, Settings as SettingsIcon, Info, Network } from 'lucide-react';
import type { ActiveModal, AppSettings } from '../types';
import { useDialog } from './useDialog';

interface Props { activeModal: ActiveModal; onClose: () => void; settings: AppSettings; onUpdateSettings: (settings: Partial<AppSettings>) => void }
interface EngineStatus { status: string; engine: string; network?: { mode: string; configured: boolean }; storesQueries?: boolean; controls?: string }
const titles: Record<string, string> = { about: 'O projekte Baky One', privacy: 'Súkromie pri vyhľadávaní', settings: 'Nastavenia vyhľadávania', fufu: 'Pripojenie vyhľadávača', faq: 'Často kladené otázky', api: 'Vyhľadávacie API', ads: 'Reklama a financovanie', security: 'Bezpečnosť', news: 'Novinky', opensource: 'Zdrojový kód' };

export default function InfoModals({ activeModal, onClose, settings, onUpdateSettings }: Props) {
  const dialogRef = useDialog(onClose, Boolean(activeModal));
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  useEffect(() => {
    if (activeModal !== 'settings' && activeModal !== 'fufu') return;
    const controller = new AbortController();
    setStatus(null); setStatusError(false);
    fetch('/api/fufu-status', { signal: controller.signal, cache: 'no-store' }).then(async (response) => {
      if (!response.ok) throw new Error('Status unavailable');
      const body = await response.json();
      if (!controller.signal.aborted) setStatus(body);
    }).catch(() => { if (!controller.signal.aborted) setStatusError(true); });
    return () => controller.abort();
  }, [activeModal]);
  if (!activeModal) return null;
  const title = titles[activeModal] || 'Baky One';
  return <div id="modal-backdrop" className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-xs p-3 sm:p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} id="modal-content-card" role="dialog" aria-modal="true" aria-labelledby="info-dialog-title" tabIndex={-1} className="relative w-full max-w-lg max-h-[calc(100dvh-24px)] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-xl border border-neutral-200 text-neutral-900">
      <button type="button" id="modal-close-btn" onClick={onClose} aria-label="Zatvoriť" className="absolute top-3 right-3 p-2 text-neutral-500 hover:bg-neutral-100 rounded-full"><X className="w-5 h-5" /></button>
      <h2 id="info-dialog-title" className="text-xl font-semibold pr-10 mb-5 flex items-center gap-2">{activeModal === 'settings' ? <SettingsIcon className="w-5 h-5" /> : activeModal === 'privacy' ? <ShieldCheck className="w-5 h-5" /> : <Info className="w-5 h-5" />}{title}</h2>
      {activeModal === 'settings' && <div id="modal-settings-section" className="space-y-4 text-sm">
        <label className="flex items-center justify-between gap-4 p-3 border rounded-xl"><span><span className="block font-medium">Bezpečné vyhľadávanie (SafeSearch)</span><span className="text-xs text-neutral-500">Požiadať poskytovateľa o filtrovanie nevhodného obsahu</span></span><input id="toggle-safesearch-btn" type="checkbox" checked={settings.safeSearch} onChange={(event) => onUpdateSettings({ safeSearch: event.target.checked })} className="w-5 h-5 shrink-0 accent-neutral-900" /></label>
        <label className="flex items-center justify-between gap-4 p-3 border rounded-xl"><span>Otvárať výsledky v novej karte</span><input id="toggle-newtab-btn" type="checkbox" checked={settings.openInNewTab} onChange={(event) => onUpdateSettings({ openInNewTab: event.target.checked })} className="w-5 h-5 shrink-0 accent-neutral-900" /></label>
        <label className="flex flex-wrap items-center justify-between gap-3 p-3 border rounded-xl">Región hľadania<select id="select-region" value={settings.region} onChange={(event) => onUpdateSettings({ region: event.target.value })} className="max-w-full border rounded-lg px-2 py-1.5 bg-neutral-50"><option value="sk">Slovensko</option><option value="cz">Česká republika</option><option value="eu">Európa</option><option value="global">Celý svet</option></select></label>
      </div>}
      {(activeModal === 'settings' || activeModal === 'fufu') && <section className="mt-4 p-4 bg-neutral-50 border rounded-xl text-sm" aria-label="Stav vyhľadávača"><h3 className="font-medium flex items-center gap-2 mb-2"><Network className="w-4 h-4" />Pripojenie servera</h3>{statusError ? <p role="status">Stav pripojenia momentálne nie je dostupný.</p> : status ? <><p>{status.engine || 'Baky One Search'}</p><p className="text-neutral-600 text-xs mt-1">Režim: {status.network?.mode === 'http_proxy' ? 'Serverové HTTP proxy' : status.network?.mode === 'tor_socks' ? 'Serverové SOCKS/Tor proxy' : 'Priame pripojenie servera'}</p><p className="text-xs text-neutral-500 mt-2">Pripojenie nastavuje správca servera. Toto nastavenie nemení IP, systém ani MAC adresu vášho zariadenia.</p></> : <p role="status">Načítavam stav…</p>}</section>}
      {activeModal === 'privacy' && <div id="modal-privacy-section" className="space-y-3 text-sm text-neutral-600 leading-relaxed"><p>Dotazy spracuje náš server a odošle ich poskytovateľom vyhľadávania a zdrojom prehľadov. Prevádzkovatelia týchto služieb spracúvajú požiadavky podľa vlastných pravidiel.</p><p>Aplikácia neukladá históriu dotazov do lokálneho úložiska ani do serverových vyhľadávacích cache alebo aplikačných logov. Výsledky drží v pamäti počas zobrazenia; pri skrytí karty alebo použití Escape ich vymaže.</p><p>Náhľady, obrázky a ikony môžu byť načítané z webov tretích strán, ktoré pri požiadavke uvidia vašu IP adresu. Hlasové zadávanie zabezpečuje služba prehliadača.</p><p>Hosting, sieťový poskytovateľ a navštívené weby môžu spracúvať prevádzkové údaje. Vymazanie relácie v aplikácii nevymaže ich záznamy ani históriu iných webov v prehliadači.</p></div>}
      {activeModal === 'about' && <div className="space-y-3 text-sm text-neutral-600 leading-relaxed"><p>Baky One je rozhranie na vyhľadávanie webov, obrázkov, videí a správ cez externých poskytovateľov.</p><p>Voliteľný prehľad zobrazuje text verejných zdrojov s odkazmi na pôvodné stránky. Nie je označovaný ako generatívna odpoveď.</p></div>}
      {activeModal === 'faq' && <div className="space-y-3 text-sm"><h3 className="font-medium">Ukladá sa história dotazov?</h3><p className="text-neutral-600">Aplikácia ju neukladá. Dotazy sa počas vyhľadávania odosielajú poskytovateľom; podrobnosti sú v zásadách súkromia.</p><h3 className="font-medium">Čo robí Ask?</h3><p className="text-neutral-600">Zapína dostupný prehľad verejných zdrojov pre danú tému.</p></div>}
      {activeModal === 'api' && <p className="text-sm text-neutral-600">Webové výsledky poskytuje GET /api/search?q=:query. Endpoint podporuje parametre page, safeSearch, region a time.</p>}
      {activeModal === 'ads' && <p className="text-sm text-neutral-600">Toto rozhranie neobsahuje reklamné ani analytické skripty. Odkazy a obsah externých poskytovateľov sa riadia ich pravidlami.</p>}
      {activeModal === 'security' && <p className="text-sm text-neutral-600">Zistené bezpečnostné chyby oznámte správcovi tejto inštalácie spolu s postupom reprodukcie.</p>}
      {activeModal === 'news' && <p className="text-sm text-neutral-600">Vyhľadávanie podporuje samostatné karty webov, obrázkov, videí, krátkych videí a správ.</p>}
      {activeModal === 'opensource' && <p className="text-sm text-neutral-600">Informácie o zdrojovom kóde a licencii si vyžiadajte od správcu tejto inštalácie.</p>}
    </div>
  </div>;
}
