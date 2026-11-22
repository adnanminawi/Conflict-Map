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
  // The New York Times. Its feeds are free for personal / non-commercial use; a commercial site needs its written permission.
  // Middle East + World: an article in both is saved once (the url column is UNIQUE).
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/MiddleEast.xml', sourceName: 'The New York Times', lang: 'en' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', sourceName: 'The New York Times', lang: 'en' },
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

// Which country a news item is about: if its title or summary has one of these words, it gets that country's code.
// One item can get several ("drone launched from Yemen over Eilat" → YE and IL).
// English: whole words, so 'oman' doesn't match 'woman'. Write each form: 'israel' and 'israeli'.
// Arabic: whole words too, but و / ف / ب / ل / ك in front and endings like ي / ية / يون are allowed,
// so 'اليمن' also matches 'واليمن', 'لليمن' and 'اليمنية'. ('مصر' must not match 'مصرع' or 'مصرف'.)
// ignore: phrases removed before looking, because they contain a word but aren't about the country
// ("Indian Ocean" isn't India, "روسيا البيضاء" is Belarus, not Russia).
// Avoid words with another meaning: 'us' (the word "us"), 'عمان' (Oman, but also Amman in Jordan),
// 'صور' (Tyre, but also "pictures").
// To cover a new country: add a line with its 2-letter code (the same code as in the countries table).
export const COUNTRY_WORDS: Record<string, { en: string[]; ar: string[]; ignore?: string[] }> = {
  // ----- Middle East -----
  YE: {
    en: ['yemen', 'yemeni', 'yemenis', 'houthi', 'houthis', 'ansar allah', 'sanaa', "sana'a", 'hodeidah', 'aden', 'marib', 'taiz', 'saada'],
    ar: ['اليمن', 'يمني', 'الحوثي', 'حوثي', 'أنصار الله', 'صنعاء', 'الحديدة', 'عدن', 'مأرب', 'تعز', 'صعدة'],
  },
  IL: {
    en: ['israel', 'israeli', 'israelis', 'idf', 'tel aviv', 'netanyahu', 'eilat', 'haifa'],
    ar: ['إسرائيل', 'الإسرائيلي', 'الاحتلال', 'تل أبيب', 'نتنياهو', 'إيلات', 'حيفا'],
  },
  IR: {
    en: ['iran', 'iranian', 'iranians', 'tehran', 'irgc', 'revolutionary guard', 'isfahan', 'khamenei'],
    ar: ['إيران', 'الإيراني', 'إيراني', 'طهران', 'الحرس الثوري', 'أصفهان', 'خامنئي'],
  },
  LB: {
    en: ['lebanon', 'lebanese', 'hezbollah', 'beirut', 'nabatieh', 'sidon'],
    ar: ['لبنان', 'اللبناني', 'لبناني', 'حزب الله', 'بيروت', 'النبطية', 'صيدا'],
  },
  SY: {
    en: ['syria', 'syrian', 'damascus', 'aleppo'],
    ar: ['سوريا', 'السوري', 'سوري', 'دمشق', 'حلب'],
  },
  IQ: {
    en: ['iraq', 'iraqi', 'baghdad'],
    ar: ['العراق', 'العراقي', 'عراقي', 'بغداد'],
  },
  EG: {
    en: ['egypt', 'egyptian', 'cairo', 'sinai', 'suez'],
    ar: ['مصر', 'المصري', 'مصري', 'القاهرة', 'سيناء', 'السويس'],
  },
  TR: {
    en: ['turkey', 'turkish', 'turkiye', 'türkiye', 'ankara', 'istanbul', 'erdogan'],
    ar: ['تركيا', 'التركي', 'تركي', 'أنقرة', 'إسطنبول', 'أردوغان'],
  },
  // ----- Gulf -----
  SA: {
    en: ['saudi', 'riyadh', 'jeddah'],
    ar: ['السعودية', 'السعودي', 'سعودي', 'الرياض', 'جدة'],
  },
  AE: {
    en: ['uae', 'emirates', 'emirati', 'abu dhabi', 'dubai'],
    ar: ['الإمارات', 'الإماراتي', 'إماراتي', 'أبوظبي', 'أبو ظبي', 'دبي'],
  },
  QA: {
    en: ['qatar', 'qatari', 'doha'],
    ar: ['قطر', 'القطري', 'قطري', 'الدوحة'],
    ignore: ['نصف قطر'], // "radius", as in a weapon's range
  },
  KW: {
    en: ['kuwait', 'kuwaiti'],
    ar: ['الكويت', 'الكويتي', 'كويتي'],
  },
  BH: {
    en: ['bahrain', 'bahraini', 'manama'],
    ar: ['البحرين', 'البحريني', 'بحريني', 'المنامة'],
  },
  OM: {
    en: ['oman', 'omani', 'muscat'],
    ar: ['سلطنة عمان', 'العماني', 'عماني', 'مسقط'], // not 'عمان' alone: it's also Amman, Jordan's capital
    ignore: ['gulf of oman', 'sea of oman', 'خليج عمان', 'بحر عمان'], // the sea, not the country
  },
  // ----- Caucasus -----
  AZ: {
    en: ['azerbaijan', 'azerbaijani', 'baku'],
    ar: ['أذربيجان', 'الأذربيجاني', 'أذربيجاني', 'باكو'],
  },
  AM: {
    en: ['armenia', 'armenian', 'yerevan'],
    ar: ['أرمينيا', 'الأرميني', 'أرميني', 'يريفان'],
  },
  // ----- Big powers -----
  US: {
    // not 'us': it's also the word "us"
    en: ['united states', 'u.s.', 'american', 'americans', 'washington', 'pentagon', 'white house'],
    ar: ['الولايات المتحدة', 'أمريكا', 'أميركا', 'الأمريكي', 'الأميركي', 'أمريكي', 'أميركي', 'واشنطن', 'البنتاغون', 'البيت الأبيض'],
  },
  RU: {
    en: ['russia', 'russian', 'russians', 'moscow', 'kremlin', 'putin'],
    ar: ['روسيا', 'الروسي', 'روسي', 'موسكو', 'الكرملين', 'بوتين'],
    ignore: ['روسيا البيضاء'], // Belarus
  },
  CN: {
    en: ['china', 'chinese', 'beijing'],
    ar: ['الصين', 'الصيني', 'صيني', 'بكين'],
  },
  IN: {
    en: ['india', 'indian', 'new delhi'],
    ar: ['الهند', 'هندي', 'نيودلهي'],
    ignore: ['indian ocean', 'المحيط الهندي'], // the ocean, not the country
  },
  // ----- Europe -----
  UA: {
    en: ['ukraine', 'ukrainian', 'ukrainians', 'kyiv', 'kiev'],
    ar: ['أوكرانيا', 'الأوكراني', 'أوكراني', 'كييف'],
  },
  BY: {
    en: ['belarus', 'belarusian', 'minsk'],
    ar: ['بيلاروسيا', 'البيلاروسي', 'روسيا البيضاء', 'مينسك'],
  },
  DE: {
    en: ['germany', 'german', 'berlin'],
    ar: ['ألمانيا', 'الألماني', 'ألماني', 'برلين'],
  },
  FR: {
    en: ['france', 'french', 'paris'],
    ar: ['فرنسا', 'الفرنسي', 'فرنسي', 'باريس'],
  },
  ES: {
    en: ['spain', 'spanish', 'madrid'],
    ar: ['إسبانيا', 'الإسباني', 'إسباني', 'مدريد'],
  },
  GR: {
    en: ['greece', 'greek', 'athens'],
    ar: ['اليونان', 'اليوناني', 'يوناني', 'أثينا'],
  },
};