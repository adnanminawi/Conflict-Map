import * as locationsRepository from '../repositories/locations.repository';
import type { SaveLocationInput, ImportSummary,LocationRow } from '../types/locations.types';
import { AppError } from '../utils/AppError';
import { parseKml } from '../utils/kml';
import { classifySite } from '../utils/classifySite';
import { checkCountry } from './countries.service';
import * as weaponsRepository from '../repositories/weapons.repository';

export async function getLocations() {
  return locationsRepository.findAll();
}

export async function getLocationTypes() {
  return locationsRepository.findTypes();
}

const DUPLICATE_METERS = 50; // same type closer than this = the same site

// Distance in meters between two points (haversine: the Earth as a sphere, like MySQL's ST_Distance_Sphere)
function meters(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371008 * Math.asin(Math.sqrt(h));
}

// "military_base" → "Military base"
function prettyType(code: string): string {
  const words = code.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Imports the pins of a KML/KMZ file into the locations table.
// Each pin's type is guessed from its name, then its KML folder (utils/classifySite.ts).
// typeCode = the admin's chosen type, used for pins no rule matches (e.g. pins with no name).
// dryRun = true → checks everything (types, duplicates) but saves nothing.
export async function importKml(
  file: Buffer,
  fileName: string,
  typeCode: string,
  countryCode: string,
  dryRun: boolean,
): Promise<ImportSummary> {
  const country = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw AppError.badRequest('Country must be a 2-letter code, e.g. IR');
  await checkCountry(country);

  // All types, by code: { military_base: { id: 1, name: 'Military base' }, ... }
  const types = new Map((await locationsRepository.findTypes()).map((t) => [t.code, t]));
  if (!types.has(typeCode)) throw AppError.badRequest(`Unknown location type "${typeCode}"`);

  const parsed = parseKml(file, fileName);
  if (parsed.found === 0) throw AppError.badRequest('No placemarks found. Is this a valid KML/KMZ file?');

  const summary: ImportSummary = {
    dryRun,
    found: parsed.found,
    saved: 0,
    duplicates: 0,
    notPoints: parsed.notPoints,
    invalid: parsed.invalid,
    autoNamed: 0,
    byType: {},
    guessed: 0,
  };
  const autoNamedPerType: Record<string, number> = {}; // for names like "Radar IL-003"

  // The pins accepted so far from this file. A preview saves nothing, so the database can't see
  // two close pins of the same file: this list does, so the preview and the import give the same numbers.
  const accepted: { lng: number; lat: number; typeId: number }[] = [];

  for (const point of parsed.points) {
    // Its type: from its name, else from its folder, else the admin's chosen type.
    // A guess for a type the database doesn't have (yet) also falls back to the chosen type.
    let code = classifySite(point.name) ?? classifySite(point.folder) ?? typeCode;
    if (!types.has(code)) code = typeCode;
    const type = types.get(code)!;

    // Same type already within 50 m (on the map, or earlier in this file)? Skip it.
    const nearInFile = accepted.some((a) => a.typeId === type.id && meters(a, point) < DUPLICATE_METERS);
    if (nearInFile || (await locationsRepository.existsNear(point.lng, point.lat, type.id, DUPLICATE_METERS))) {
      summary.duplicates++;
      continue;
    }
    accepted.push({ lng: point.lng, lat: point.lat, typeId: type.id });
    if (code !== typeCode) summary.guessed++;

    // No real name → give it one, e.g. "Radar IL-003"
    let name = point.name;
    if (!name) {
      summary.autoNamed++;
      autoNamedPerType[code] = (autoNamedPerType[code] ?? 0) + 1;
      name = `${prettyType(code)} ${country}-${String(autoNamedPerType[code]).padStart(3, '0')}`;
    }

    if (!dryRun) {
      await locationsRepository.insert({
        typeId: type.id,
        name,
        countryCode: country,
        weaponId : null,
        lng: point.lng,
        lat: point.lat,
        description: point.description,
      });
    }
    summary.saved++;
    summary.byType[type.name] = (summary.byType[type.name] ?? 0) + 1;
  }

  return summary;
}

// Admin: delete a base / airport
export async function deleteLocation(id: number) {
  const deleted = await locationsRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Location not found');
}

const MAX_DELETE = 5000; // one request can't delete more than this

// Admin: delete many at once (the "Delete selected" button). Returns how many were deleted.
export async function deleteLocations(ids: number[]) {
  if (ids.length === 0) throw AppError.badRequest('Choose at least one location');
  if (ids.length > MAX_DELETE) throw AppError.badRequest(`At most ${MAX_DELETE} locations at once`);
  return locationsRepository.deleteMany([...new Set(ids)]); // the same id twice counts once
}

// Checks the type and country, and turns the type code into its id
  async function toRow(input: SaveLocationInput): Promise<LocationRow> {
  const typeId = await locationsRepository.findTypeIdByCode(input.typeCode);
  if (typeId === null) throw AppError.badRequest(`Unknown location type "${input.typeCode}"`);
  await checkCountry(input.countryCode);

  // A site can only hold a system of its own kind (the type codes match on purpose):
  // an air defence site → an air defence system, a radar site → a radar. An airport → none.
  if (input.weaponId !== null) {
    const weaponType = await weaponsRepository.findTypeCodeById(input.weaponId);
    if (weaponType === null) throw AppError.badRequest('weapon_id does not exist');
    if (weaponType !== input.typeCode) {
      throw AppError.badRequest(`This system (${weaponType}) can't be placed on a ${input.typeCode} site`);
    }
  }

  return { typeId, weaponId: input.weaponId, name: input.name, countryCode: input.countryCode, lng: input.lng, lat: input.lat, description: input.description };
}

// Admin: add one location (placed by clicking the map). Returns its id.
export async function createLocation(input: SaveLocationInput) {
  try {
    const id = await locationsRepository.insert(await toRow(input));
    return { id };
  } catch (err: any) {
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') throw AppError.badRequest('weapon_id does not exist');
    throw err;
  }
}

// Admin: change one location (moved, renamed, other type…)
export async function updateLocation(id: number, input: SaveLocationInput) {
  let changed: number;
  try{
  changed = await locationsRepository.update(id, await toRow(input));
  }catch(err: any){
  if (err?.code === 'ER_NO_REFERENCED_ROW_2') throw AppError.badRequest('weapon_id does not exist');
      throw err;
    }
    if (changed === 0) throw AppError.notFound('Location not found');
  }