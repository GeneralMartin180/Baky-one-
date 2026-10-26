/** Compatibility export; local and Vercel routes use the same web search service. */
export { searchWeb as scrapeDuckDuckGo } from './webSearchService.ts';
export { fetchFufuImages, fetchYouTubeVideos, fetchYouTubeShorts } from './fufuV12Scraper.ts';
export type { SearchResult, YouTubeVideoItem } from '../types.ts';
