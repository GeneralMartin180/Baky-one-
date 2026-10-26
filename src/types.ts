export type SearchTab = 'all' | 'images' | 'news' | 'videos' | 'shorts';

export interface SearchOverviewSource {
  title: string;
  url: string;
  domain?: string;
  favicon?: string;
}

export interface SearchOverview {
  title: string;
  subtitle?: string;
  description?: string;
  extract: string;
  bullets?: Array<{ title?: string; text: string }>;
  sources?: SearchOverviewSource[];
  thumbnailUrl?: string;
  pageUrl?: string;
  sourceName?: string;
  isCurated?: boolean;
}

export type WikipediaSummary = SearchOverview;

export interface YouTubeVideoItem {
  id: string;
  videoId: string;
  title: string;
  url: string;
  channel: string;
  duration?: string;
  views?: string;
  published?: string;
  thumbnail: string;
  snippet?: string;
  isShort?: boolean;
}

export interface SearchResult {
  id: string;
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
  siteName?: string;
  favicon?: string;
  thumbnail?: string;
  date?: string;
  breadcrumbs?: string[];
  category?: string;
  publishedDate?: string;
  video?: YouTubeVideoItem;
}

export interface AppSettings {
  safeSearch: boolean;
  openInNewTab: boolean;
  region: string;
  privacyBadgeEnabled: boolean;
}

export interface TrendingNewsItem {
  id: string;
  query: string;
  title: string;
  snippet: string;
  url: string;
  imageUrl?: string;
  source: string;
  publishedAt?: string;
}

export type MarketSymbol = 'MSFT' | '^GSPC' | '^IXIC';

export interface MarketQuote {
  symbol: MarketSymbol;
  label: string;
  price: number | null;
  currency: string;
  changePercent: number | null;
  updatedAt: string | null;
  url: string;
  kind: 'stock' | 'index';
  status: 'available' | 'unavailable';
}

export interface MarketSnapshot {
  quotes: MarketQuote[];
  source: 'Yahoo Finance';
  informational: true;
  checkedAt: string;
  unavailable: MarketSymbol[];
  degraded: boolean;
}

export type ActiveModal =
  | 'about'
  | 'privacy'
  | 'opensource'
  | 'settings'
  | 'ads'
  | 'api'
  | 'news'
  | 'faq'
  | 'security'
  | 'fufu'
  | null;

