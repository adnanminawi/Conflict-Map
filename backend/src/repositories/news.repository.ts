// news: SQL queries only.
import { db, UNIQUE_VIOLATION } from '../config/db';
import type { AdminNewsItem, NewNewsItem, NewsItem, NewsStatus } from '../types/news.types';

// The latest published news, newest first. lang = null → both languages.
// $1::text: Postgres must know the type of $1 to check "IS NULL" on it.
export async function findPublished(lang: 'en' | 'ar' | null): Promise<NewsItem[]> {
  const { rows } = await db.query<NewsItem>(
    `SELECT id, title, summary, url, source_name, lang, published_at
       FROM news
      WHERE status = 'published' AND ($1::text IS NULL OR lang = $1::text)
      ORDER BY published_at DESC
      LIMIT 50`,
    [lang],
  );
  return rows;
}

// Saves one item from a feed. Returns false if this url is already saved.
// Feeds return the same articles every time we read them, so duplicates are normal, not an error.
// created_by is NULL = it came from RSS, not from an admin.
export async function insertFromFeed(item: NewNewsItem): Promise<boolean> {
  try {
    await db.query(
      `INSERT INTO news (title, summary, url, source_name, lang, published_at, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'published', NULL)`,
      [item.title, item.summary, item.url, item.sourceName, item.lang, item.publishedAt],
    );
    return true;
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) return false; // the url column is UNIQUE
    throw err;
  }
}

// For the admin: the latest 100, published and hidden, newest first
export async function findForAdmin(): Promise<AdminNewsItem[]> {
  const { rows } = await db.query<AdminNewsItem>(
    `SELECT id, title, summary, url, source_name, lang, published_at, status
       FROM news
      ORDER BY published_at DESC
      LIMIT 100`,
  );
  return rows;
}

// Hide ('draft') or show ('published') one item. Returns how many rows matched (0 = no news with that id).
export async function updateStatus(id: number, status: NewsStatus): Promise<number> {
  const result = await db.query('UPDATE news SET status = $1 WHERE id = $2', [status, id]);
  return result.rowCount ?? 0;
}

// Returns how many rows were deleted (0 = no news with that id).
export async function deleteById(id: number): Promise<number> {
  const result = await db.query('DELETE FROM news WHERE id = $1', [id]);
  return result.rowCount ?? 0;
}
