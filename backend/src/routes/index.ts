import { Router } from 'express';
import { db } from '../config/db';
import { authRoutes } from './auth.routes';
import { eventsRoutes } from './events.routes';
import { locationsRoutes } from './locations.routes';
import { layersRoutes } from './layers.routes';
import { alertsRoutes } from './alerts.routes';
export const routes = Router();

routes.get('/health', async (_req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

routes.use('/auth', authRoutes);
routes.use('/events', eventsRoutes);
routes.use('/locations', locationsRoutes);
routes.use('/layers', layersRoutes);
routes.use('/alerts', alertsRoutes);