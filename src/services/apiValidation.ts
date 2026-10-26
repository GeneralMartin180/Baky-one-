import type { SearchOptions } from './searchOptions.ts';

export class ApiInputError extends Error {
  readonly status = 400;
  readonly code = 'INVALID_INPUT';
}

export const MAX_QUERY_LENGTH = 512;
export const MAX_SEARCH_PAGE = 100;

function scalar(value: unknown, name: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ApiInputError(`Parameter ${name} musí byť jeden textový údaj.`);
  return value;
}

export function readQuery(value: unknown): string {
  const query = (scalar(value, 'q') ?? '').trim();
  if (query.length > MAX_QUERY_LENGTH) throw new ApiInputError(`Dotaz môže mať najviac ${MAX_QUERY_LENGTH} znakov.`);
  if (/[\u0000-\u001f\u007f]/.test(query)) throw new ApiInputError('Dotaz obsahuje nepovolené riadiace znaky.');
  return query;
}

export function readPage(value: unknown): number {
  const text = scalar(value, 'page');
  if (text === undefined) return 1;
  if (!/^[1-9]\d{0,2}$/.test(text) || Number(text) > MAX_SEARCH_PAGE) {
    throw new ApiInputError(`Strana musí byť celé číslo od 1 do ${MAX_SEARCH_PAGE}.`);
  }
  return Number(text);
}

export function readSearchOptions(query: Record<string, unknown>): SearchOptions {
  const safe = scalar(query.safeSearch, 'safeSearch');
  if (safe !== undefined && !['true', 'false', '1', '0'].includes(safe)) {
    throw new ApiInputError('Neplatná hodnota safeSearch.');
  }
  const region = scalar(query.region, 'region') ?? 'sk';
  if (!['sk', 'cz', 'eu', 'global'].includes(region)) throw new ApiInputError('Neplatný región.');
  const time = scalar(query.time, 'time');
  const timeFilter = scalar(query.timeFilter, 'timeFilter');
  if (time !== undefined && timeFilter !== undefined && time !== timeFilter) {
    throw new ApiInputError('Parametre time a timeFilter si odporujú.');
  }
  const selectedTime = time ?? timeFilter ?? 'anytime';
  if (!['anytime', 'day', 'week', 'month'].includes(selectedTime)) throw new ApiInputError('Neplatný časový filter.');
  return {
    safeSearch: safe !== 'false' && safe !== '0',
    region: region as SearchOptions['region'],
    timeFilter: selectedTime as SearchOptions['timeFilter'],
  };
}

export function readCategory(value: unknown): string {
  const category = scalar(value, 'cat') ?? 'trending';
  if (!['trending', 'all'].includes(category)) {
    throw new ApiInputError('Neplatná kategória správ.');
  }
  return category;
}
