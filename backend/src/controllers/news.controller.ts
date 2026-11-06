// news: reads req, calls service, sends res. No SQL, no business rules.
import type { Request, Response, NextFunction } from 'express';
import * as newsService from '../services/news.service';
import { AppError } from '../utils/AppError';
import type { NewsStatus } from '../types/news.types';

export async function getNews(req: Request, res: Response, next: NextFunction) {
  try {
    const lang = req.query.lang;
    if (lang !== undefined && lang !== 'en' && lang !== 'ar') {
      throw AppError.badRequest('lang must be en or ar');
    }
    res.json(await newsService.getNews(lang ?? null));
  } catch (err) {
    next(err);
  }
}
const STATUSES: NewsStatus[] = ['draft', 'published'];

// GET /api/news/admin  (admin only) — published and hidden
export async function getAdminNews(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await newsService.getAdminNews());
  } catch (err) {
    next(err);
  }
}

// PATCH /api/news/:id/status  { status: 'draft' | 'published' }  (admin only)
export async function updateNewsStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const id = readId(req.params.id);
    const status = req.body?.status;
    if (!STATUSES.includes(status)) {
      throw AppError.badRequest(`status must be one of: ${STATUSES.join(', ')}`);
    }
    await newsService.setNewsStatus(id, status);
    res.json({ id, status });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/news/:id  (admin only)
export async function deleteNews(req: Request, res: Response, next: NextFunction) {
  try {
    await newsService.deleteNews(readId(req.params.id));
    res.status(204).end(); // 204 = done, nothing to send back
  } catch (err) {
    next(err);
  }
}

// The :id in the URL must be a positive whole number
function readId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('Invalid news id');
  return id;
}
