import type { Request, Response, NextFunction } from 'express';
import * as sidesService from '../services/sides.service';
import { AppError } from '../utils/AppError';

// GET /api/sides — every side (public: the map legend needs them)
export async function getSides(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await sidesService.getSides());
  } catch (err) {
    next(err);
  }
}

// POST /api/sides  (admin only)
// Body: { country: "YE", name: "Houthis", color: "#A52714" }
export async function createSide(req: Request, res: Response, next: NextFunction) {
  try {
    const country = typeof req.body?.country === 'string' ? req.body.country.trim().toUpperCase() : '';
    if (!/^[A-Z]{2}$/.test(country)) throw AppError.badRequest('country must be a 2-letter code, e.g. YE');

    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length < 1 || name.length > 100) throw AppError.badRequest('Side name is required (max 100 characters)');

    const color = typeof req.body?.color === 'string' ? req.body.color.trim().toUpperCase() : '';
    if (!/^#[0-9A-F]{6}$/.test(color)) throw AppError.badRequest('color must look like #A52714');

    const side = await sidesService.createSide({ countryCode: country, name, color });
    res.status(201).json(side);
  } catch (err) {
    next(err);
  }
}