import type { Request, Response, NextFunction } from 'express';
import * as locationsService from '../services/locations.service';
import type { SaveLocationInput } from '../types/locations.types';
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

// DELETE /api/locations/:id  (admin only)
export async function deleteLocation(req: Request, res: Response, next: NextFunction) {
  try {
    await locationsService.deleteLocation(readId(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// POST /api/locations/delete-many  { ids: [1, 2, 3] }  (admin only) → { deleted: 3 }
export async function deleteManyLocations(req: Request, res: Response, next: NextFunction) {
  try {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.every((id) => Number.isInteger(id) && id > 0)) {
      throw AppError.badRequest('ids must be a list of location ids');
    }
    const deleted = await locationsService.deleteLocations(ids);
    res.json({ deleted });
  } catch (err) {
    next(err);
  }
}

// POST /api/locations  (admin only): add one location placed on the map → { id }
export async function createLocation(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(201).json(await locationsService.createLocation(readLocationBody(req.body)));
  } catch (err) {
    next(err);
  }
}

// PUT /api/locations/:id  (admin only): change one location (moved, renamed, other type…)
export async function updateLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const id = readId(req.params.id);
    await locationsService.updateLocation(id, readLocationBody(req.body));
    res.json({ id });
  } catch (err) {
    next(err);
  }
}

// Checks the body of a create / update: { type, name, country_code, description?, lat, lng }
function readLocationBody(body: any): SaveLocationInput {
  if (!body || typeof body !== 'object') throw AppError.badRequest('Body must be JSON');

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 200) throw AppError.badRequest('name is required (max 200 characters)');

  const weaponId = body.weapon_id == null ? null : Number(body.weapon_id);
  if (weaponId !== null && (!Number.isInteger(weaponId) || weaponId < 1)) {
    throw AppError.badRequest('weapon_id must be a weapon id or null');
  }


  const typeCode = typeof body.type === 'string' ? body.type.trim() : '';
  if (!typeCode) throw AppError.badRequest('type is required, e.g. "air_defence"');

  const countryCode = typeof body.country_code === 'string' ? body.country_code.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(countryCode)) throw AppError.badRequest('country_code must be a 2-letter code, e.g. IL');

  const description = typeof body.description === 'string' && body.description.trim() !== '' ? body.description.trim() : null;

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (body.lat == null || !Number.isFinite(lat) || lat < -90 || lat > 90) throw AppError.badRequest('lat must be between -90 and 90');
  if (body.lng == null || !Number.isFinite(lng) || lng < -180 || lng > 180) throw AppError.badRequest('lng must be between -180 and 180');

  return { typeCode, name, countryCode, description, lat, lng };
}

// The :id in the URL must be a positive whole number
function readId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('Invalid location id');
  return id;
}