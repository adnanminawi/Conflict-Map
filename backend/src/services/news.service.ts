// news: business logic. Never touches req/res.
import { BLOCK_WORDS, KEYWORDS, type NewsFeed } from '../config/newsFeeds';
import * as newsRepository from '../repositories/news.repository';
import { AppError } from '../utils/AppError';
import type { NewsStatus } from '../types/news.types';


const MAX_AGE_DAYS = 1; // older items are skipped, so the first run doesn't publish last week's news

// What we use from one feed item (rss-parser gives these fields)
export interface FeedItem {
  title?: string;
  link?: string;
  contentSnippet?: string; // the summary without HTML tags
  isoDate?: string; // the date, already as '2026-11-06T13:20:00.000Z'
}

// For the site: the latest published news (lang = null → both languages)
export async function getNews(lang: 'en' | 'ar' | null) {
  return newsRepository.findPublished(lang);
}

export async function getAdminNews() {
  return newsRepository.findForAdmin();
}

export async function setNewsStatus(id: number, status: NewsStatus) {
  const changed = await newsRepository.updateStatus(id, status);
  if (changed === 0) throw AppError.notFound('News not found');
}

export async function deleteNews(id: number) {
  const deleted = await newsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('News not found');
}


// True if the text is about the conflict: has a keyword and no block word
export function isRelevant(text: string, lang: 'en' | 'ar'): boolean {
  const t = text.toLowerCase(); // does nothing to Arabic, which has no capitals
  const hasKeyword = KEYWORDS[lang].some((word) => t.includes(word));
  const blocked = BLOCK_WORDS[lang].some((word) => t.includes(word));
  return hasKeyword && !blocked;
}

// Checks, cleans and saves the items of one feed. Returns how many were new.
export async function saveFeedItems(feed: NewsFeed, items: FeedItem[]): Promise<number> {
  const oldest = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  let saved = 0;

  for (const item of items) {
    const title = (item.title ?? '').trim();
    const summary = (item.contentSnippet ?? '').trim();
    const url = (item.link ?? '').split('?')[0].trim(); // drop "?traffic_source=rss" so the same article is never saved twice

    // Without a title or a link there's nothing to show or click
    if (!title || !url || url.length > 700) continue; // 700 = the size of the url column
    if (url.includes('/opinions/')) continue; // opinion pieces aren't news

    // Without a title or a link there's nothing to show or click
    if (!title || !url || url.length > 700) continue; // 700 = the size of the url column

    const date = item.isoDate ? new Date(item.isoDate) : new Date();
    const publishedAt = isNaN(date.getTime()) ? new Date() : date; // a broken date → use now
    if (publishedAt.getTime() < oldest) continue;

    if (!isRelevant(`${title} ${summary}`, feed.lang)) continue;

    const isNew = await newsRepository.insertFromFeed({
      title: title.slice(0, 300), // 300 = the size of the title column
      summary,
      url,
      sourceName: feed.sourceName,
      lang: feed.lang,
      publishedAt,
    });
    if (isNew) saved++;
  }
  return saved;
}