import type { Request, Response, NextFunction } from 'express';
import * as weaponsService from '../services/weapons.service';
import type { WeaponInput } from '../types/weapons.types';
import { AppError } from '../utils/AppError';

// GET /api/weapons — every weapon (public: the map's weapons panel)
export async function getWeapons(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await weaponsService.getWeapons());
  } catch (err) {
    next(err);
  }
}

// GET /api/weapons/types — launcher, drone, fighter… (for the admin form)
export async function getWeaponTypes(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await weaponsService.getWeaponTypes());
  } catch (err) {
    next(err);
  }
}

// GET /api/weapons/:id — one weapon (for the admin edit form)
export async function getWeapon(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await weaponsService.getWeapon(readId(req.params.id)));
  } catch (err) {
    next(err);
  }
}

// POST /api/weapons  (admin only)
// Body: { name: "Burkan-2H", weapon_type_id: 1, country: "YE", side_id: 1, range_km: 1000, source: "CSIS", description: "" }
// side_id: null (or left out) for a country without sides
export async function createWeapon(req: Request, res: Response, next: NextFunction) {
  try {
    const weapon = await weaponsService.createWeapon(readWeaponBody(req.body));
    res.status(201).json(weapon);
  } catch (err) {
    next(err);
  }
}

// PUT /api/weapons/:id  (admin only) — same body as POST
export async function updateWeapon(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await weaponsService.updateWeapon(readId(req.params.id), readWeaponBody(req.body)));
  } catch (err) {
    next(err);
  }
}

// DELETE /api/weapons/:id  (admin only)
export async function deleteWeapon(req: Request, res: Response, next: NextFunction) {
  try {
    await weaponsService.deleteWeapon(readId(req.params.id));
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// ---------- Checking what was sent ----------

function readId(value: string): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw AppError.badRequest('Invalid weapon id');
  return id;
}

// A whole number between min and max, or a 400 error with this message
function readInt(value: unknown, min: number, max: number, message: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw AppError.badRequest(message);
  return n;
}

// 2 letters, uppercased ("ye" → "YE"). Whether it is a real country is checked by the service.
function readCountry(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!/^[A-Z]{2}$/.test(code)) throw AppError.badRequest('country must be a 2-letter code, e.g. YE');
  return code;
}

// Optional text: empty → null. Too long → 400.
function readOptionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw AppError.badRequest(`${field} must be text`);
  const text = value.trim();
  if (text.length > maxLength) throw AppError.badRequest(`${field} is too long (max ${maxLength} characters)`);
  return text === '' ? null : text;
}

// Used by create and update. Throws 400 if something is missing or wrong.
function readWeaponBody(body: any): WeaponInput {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (name.length < 1 || name.length > 100) throw AppError.badRequest('Weapon name is required (max 100 characters)');

  return {
    name,
    weaponTypeId: readInt(body?.weapon_type_id, 1, 65535, 'Choose a weapon type'),
    countryCode: readCountry(body?.country),
    // No side (null, empty or left out) is allowed here; the service decides if this country needs one
    sideId: body?.side_id == null || body?.side_id === '' ? null : readInt(body.side_id, 1, 4294967295, 'Invalid side'),
    rangeKm: readInt(body?.range_km, 1, 20000, 'Range must be a whole number of km, from 1 to 20000'),
    source: readOptionalText(body?.source, 'source', 255),
    description: readOptionalText(body?.description, 'description', 2000),
  };
}