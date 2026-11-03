import type { Request, Response, NextFunction } from 'express';
import * as countriesService from '../services/countries.service';

// GET /api/countries — every country (public: for the admin forms' country lists)
export async function getCountries(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await countriesService.getCountries());
  } catch (err) {
    next(err);
  }
}