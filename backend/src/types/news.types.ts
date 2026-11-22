// news: TypeScript types/interfaces.

// One item read from a feed, ready to save
export interface NewNewsItem {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  lang: 'en' | 'ar';
  publishedAt: Date;
  countryCodes: string[]; // the countries it's about, e.g. ['YE', 'IL'] (empty = none found)
}

// One news item as sent to the site
export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  url: string | null;
  source_name: string;
  lang: 'en' | 'ar';
  published_at: Date;
}

export type NewsStatus = 'draft' | 'published';

// What's needed to find an item's countries again
export interface NewsText {
  id: number;
  title: string;
  summary: string;
  lang: 'en' | 'ar';
  country_codes: string[];
}

// What the admin sees: same as the site, plus the status
export interface AdminNewsItem extends NewsItem {
  status: NewsStatus;
}