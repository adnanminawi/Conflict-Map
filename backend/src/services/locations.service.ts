import * as locationsRepository from '../repositories/locations.repository';
import type { ImportSummary } from '../types/locations.types';
import { AppError } from '../utils/AppError';
import { parseKml } from '../utils/kml';

export async function getLocations() {
  return locationsRepository.findAll();
}

export async function getLocationTypes() {
  return locationsRepository.findTypes();
}

// "military_base" → "Military base"
function prettyType(code: string): string {
  const words = code.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Imports the pins of a KML/KMZ file into the locations table.
// dryRun = true → checks everything (type, duplicates) but saves nothing.
export async function importKml(
  file: Buffer,
  fileName: string,
  typeCode: string,
  countryCode: string,
  dryRun: boolean,
): Promise<ImportSummary> {
  const country = countryCode.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw AppError.badRequest('Country must be a 2-letter code, e.g. IR');

  const typeId = await locationsRepository.findTypeIdByCode(typeCode);
  if (typeId === null) throw AppError.badRequest(`Unknown location type "${typeCode}"`);

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
  };

  for (const point of parsed.points) {
    // Same place already saved (within 50 m)? Skip it.
    if (await locationsRepository.existsNear(point.lng, point.lat)) {
      summary.duplicates++;
      continue;
    }

    // No real name → give it one, e.g. "Military base EG-007"
    let name = point.name;
    if (!name) {
      summary.autoNamed++;
      name = `${prettyType(typeCode)} ${country}-${String(summary.autoNamed).padStart(3, '0')}`;
    }

    if (!dryRun) {
      await locationsRepository.insert({
        typeId,
        name,
        countryCode: country,
        lng: point.lng,
        lat: point.lat,
        description: point.description,
      });
    }
    summary.saved++;
  }

  return summary;
}