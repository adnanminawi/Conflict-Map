// news: URL definitions + middlewares (auth, validate). No logic.
import { Router } from 'express';
import { deleteNews, getAdminNews, getNews, updateNewsStatus } from '../controllers/news.controller';
import { requireAdmin } from '../utils/requireAdmin';

export const newsRoutes = Router();

// Public
newsRoutes.get('/', getNews);

// Admin only. requireAdmin runs first: without a valid token → 401, nothing else runs.
newsRoutes.get('/admin', requireAdmin, getAdminNews);
newsRoutes.patch('/:id/status', requireAdmin, updateNewsStatus);
newsRoutes.delete('/:id', requireAdmin, deleteNews);