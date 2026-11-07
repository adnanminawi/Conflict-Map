// The RSS feeds the news job reads, and the words that decide what's kept.
// Items are published automatically, so keep this list narrow.

export interface NewsFeed {
  url: string;
  sourceName: string; // shown on the site under each item
  lang: 'en' | 'ar';
}

export const NEWS_FEEDS: NewsFeed[] = [
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', sourceName: 'Al Jazeera', lang: 'en' },
  {
    url: 'https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9',
    sourceName: 'الجزيرة',
    lang: 'ar',
  },
];

// An item is kept if its title or summary contains at least one of these (lowercase for English).
// Matching is "contains", so 'israel' also matches 'Israeli', and 'الحوثي' matches 'الحوثيين'.
export const KEYWORDS: Record<'en' | 'ar', string[]> = {
  en: [
    'iran', 'israel', 'gaza', 'lebanon', 'hezbollah', 'houthi', 'yemen', 'syria', 'iraq',
    'tehran', 'tel aviv', 'beirut', 'red sea', 'idf', 'irgc',
    'missile', 'rocket', 'drone', 'airstrike', 'air strike', 'ceasefire', 'interceptor',
  ],
  ar: [
    'إيران', 'إسرائيل', 'الاحتلال', 'غزة', 'لبنان', 'حزب الله', 'الحوثي', 'اليمن', 'سوريا', 'العراق',
    'طهران', 'تل أبيب', 'بيروت', 'البحر الأحمر', 'الحرس الثوري',
    'صاروخ', 'صواريخ', 'مسيرات', 'طائرة مسيرة', 'غارة', 'غارات', 'قصف', 'وقف إطلاق النار',
  ],
};

// ...but dropped if it also contains one of these. Catches the obvious junk that auto-publish would let through.
export const BLOCK_WORDS: Record<'en' | 'ar', string[]> = {
  en: ['football', 'world cup', 'olympic', 'match report', 'stock market'],
  ar: ['كرة القدم', 'كأس العالم', 'الدوري', 'مباراة', 'البورصة'],
};