import type { Request, Response, NextFunction } from 'express';
import * as alertsService from '../services/alerts.service';
import { AppError } from '../utils/AppError';

// GET /api/alerts?minutes=60 — alerts of the last N minutes (default 60, max 1440 = one day)
export async function getAlerts(req: Request, res: Response, next: NextFunction) {
  try {
    const minutes = req.query.minutes === undefined ? 60 : Number(req.query.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
      throw AppError.badRequest('minutes must be a whole number between 1 and 1440');
    }
    res.json(await alertsService.getRecentAlerts(minutes));
  } catch (err) {
    next(err);
  }
}