import { Router } from 'express';
import { getAlerts } from '../controllers/alerts.controller';

export const alertsRoutes = Router();

// Public: the alerts are saved automatically by the Telegram listener, nobody posts them by hand
alertsRoutes.get('/', getAlerts);