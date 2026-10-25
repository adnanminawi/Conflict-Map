import type { Request, Response, NextFunction } from 'express';
import * as locationsService from '../services/locations.service';

// GET /api/locations — all bases and airports
export async function getLocations(_req: Request, res: Response, next: NextFunction) {
  try {
    const locations = await locationsService.getLocations();
    res.json(locations);
  } catch (err) {
    next(err);
  }
}