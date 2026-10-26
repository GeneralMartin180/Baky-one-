export type SearchRegion = 'sk' | 'cz' | 'eu' | 'global';
export type SearchTimeFilter = 'anytime' | 'day' | 'week' | 'month';

export interface SearchOptions {
  safeSearch: boolean;
  region: SearchRegion;
  timeFilter: SearchTimeFilter;
  signal?: AbortSignal;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  safeSearch: true,
  region: 'sk',
  timeFilter: 'anytime',
};

export function resolveSearchOptions(options: Partial<SearchOptions> = {}): SearchOptions {
  return { ...DEFAULT_SEARCH_OPTIONS, ...options };
}
