// news: SQL queries only.
import { db } from '../config/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { NewNewsItem, NewsItem, NewsStatus,AdminNewsItem } from '../types/news.types';

export async function insertFromFeed(item: NewNewsItem): Promise<boolean> {
  try {
    await db.execute(
      `INSERT INTO news (title, summary, url, source_name, lang, published_at, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'published', NULL)`,
      [item.title, item.summary, item.url, item.sourceName, item.lang, item.publishedAt],
    );
    return true;
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return false; // the url column is UNIQUE
    throw err;
  }
}
export async function findPublished(lang: 'en' | 'ar' | null): Promise<NewsItem[]> {
  const [rows] = await db.execute<(NewsItem & RowDataPacket)[]>(
    `SELECT id, title, summary, url, source_name, lang, published_at
       FROM news
      WHERE status = 'published' AND (? IS NULL OR lang = ?)
      ORDER BY published_at DESC
      LIMIT 50`,
    [lang, lang],
  );
  return rows;
}

export async function updateStatus(id: number, status: NewsStatus): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('UPDATE news SET status = ? WHERE id = ?',
    [status, id]);
  return result.affectedRows;
}

// Returns how many rows were deleted (0 = no news with that id).
// Links in event_news are removed automatically (ON DELETE CASCADE).
export async function deleteById(id: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('DELETE FROM news WHERE id = ?', [id]);
  return result.affectedRows;
}

// For the admin: the latest 100, published and hidden, newest first
export async function findForAdmin(): Promise<AdminNewsItem[]> {
  const [rows] = await db.execute<(AdminNewsItem & RowDataPacket)[]>(
    `SELECT id, title, summary, url, source_name, lang, published_at, status
       FROM news
      ORDER BY published_at DESC
      LIMIT 100`,
  );
  return rows;
}