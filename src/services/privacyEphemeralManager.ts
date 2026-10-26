/** Leave the current search without keeping query state in the application. */
export const ACCUWEATHER_ESCAPE_URL = 'https://www.accuweather.com/';
const legacySearchKeys = ['fufu_recent_searches', 'fufu_history', 'baky_search_history', 'recentSearches', 'searchQuery', 'baky_last_query'];

export function purgeEntireSearchSession(reason = 'page_departure'): void {
  // Also remove query keys left by older versions, while preserving other site data.
  for (const key of legacySearchKeys) {
    try { localStorage.removeItem(key); } catch {}
    try { sessionStorage.removeItem(key); } catch {}
  }
  window.dispatchEvent(new CustomEvent('baky:purge-search', { detail: { reason } }));
}

export function executeEmergencyEscape(): void {
  purgeEntireSearchSession('emergency_escape');
  try { window.history.replaceState(null, '', '/'); } catch {}
  // noopener intentionally returns null in some browsers; it does not indicate failure.
  // A single user-initiated attempt avoids opening two tabs.
  window.open(ACCUWEATHER_ESCAPE_URL, '_blank', 'noopener,noreferrer');
}

export function initPrivacyWatchdogs(): () => void {
  const visibility = () => { if (document.visibilityState === 'hidden') purgeEntireSearchSession('visibility_hidden'); };
  const pageHide = () => purgeEntireSearchSession('pagehide');
  const pageShow = (event: PageTransitionEvent) => { if (event.persisted) purgeEntireSearchSession('bfcache_restore'); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', pageHide);
  window.addEventListener('pageshow', pageShow);
  return () => {
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('pagehide', pageHide);
    window.removeEventListener('pageshow', pageShow);
  };
}
