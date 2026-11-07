// One item read from a feed, ready to save
export interface NewNewsItem {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  lang: 'en' | 'ar';
  publishedAt: Date;
}
export interface NewsItem {
  id: number;
  title: string;
  summary: string;
  url: string | null;
  source_name: string;
  lang: 'en' | 'ar';
  published_at: Date;
}
export interface AdminNewsItem extends NewsItem {
  status: NewsStatus;
}
export type NewsStatus = 'draft' | 'published';