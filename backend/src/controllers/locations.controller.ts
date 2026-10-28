import type { Request, Response, NextFunction } from 'express';
import * as locationsService from '../services/locations.service';
import { AppError } from '../utils/AppError';

// GET /api/locations — all bases and airports
export async function getLocations(_req: Request, res: Response, next: NextFunction) {
  try {
    const locations = await locationsService.getLocations();
    res.json(locations);
  } catch (err) {
    next(err);
  }
}

// GET /api/locations/types — for the import form's dropdown
export async function getLocationTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await locationsService.getLocationTypes());
  } catch (err) {
    next(err);
  }
}

// POST /api/locations/import  (admin only, multipart form)
// Fields: file (.kml/.kmz), type (e.g. military_base), country (e.g. IR), dryRun ("true" / "false")
export async function importKml(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file; // added by multer
    if (!file) throw AppError.badRequest('Choose a .kml or .kmz file');

    const fileName = file.originalname.toLowerCase();
    if (!fileName.endsWith('.kml') && !fileName.endsWith('.kmz')) {
      throw AppError.badRequest('Only .kml and .kmz files are allowed');
    }

    const type = typeof req.body.type === 'string' ? req.body.type : '';
    const country = typeof req.body.country === 'string' ? req.body.country.trim() : '';
    if (!type) throw AppError.badRequest('type is required');

    const dryRun = req.body.dryRun === 'true'; // form fields always arrive as text

    const summary = await locationsService.importKml(file.buffer, fileName, type, country, dryRun);
    res.json(summary);
  } catch (err) {
    next(err);
  }
}