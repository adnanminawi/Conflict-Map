import { Router } from 'express';
import { db } from '../config/db';

export const routes = Router();

routes.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Feature routes are mounted here as they are written, e.g.:
// routes.use('/auth', authRoutes);
// routes.use('/events', eventsRoutes);
