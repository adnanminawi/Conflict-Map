import { Router } from 'express';
import { db } from '../config/db';
import { authRoutes } from './auth.routes';
import { eventsRoutes } from './events.routes';
import { locationsRoutes } from './locations.routes';
import { layersRoutes } from './layers.routes';
import { alertsRoutes } from './alerts.routes';
import { sidesRoutes } from './sides.route';
import { countriesRoutes } from './countries.routes';
import { weaponsRoutes } from './weapons.routes';
import { newsRoutes } from './news.routes';
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
routes.use('/sides', sidesRoutes);
routes.use('/countries', countriesRoutes);
routes.use('/weapons', weaponsRoutes);
routes.use('/news', newsRoutes);