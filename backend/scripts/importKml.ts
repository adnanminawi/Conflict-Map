// One-time import: KMZ -> KML -> GeoJSON -> locations table.
// Imports bases / airports from a KML or KMZ file into the locations table.
//
// Usage:
//   npm run import:kml -- <file> <type> <country> [--dry-run]
//
// <type>    = a code from location_types: military_base, airport, naval_base
// <country> = 2-letter country code, e.g. IR, SA, EG
import 'dotenv/config';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import { db } from '../src/config/db';
import * as locationsRepository from '../src/repositories/locations.repository';

// 1. Read the file. A KMZ is just a zip with a .kml file inside.
function readKmlText(filePath: string): string {
  if (filePath.toLowerCase().endsWith('.kmz')) {
    const zip = new AdmZip(filePath);
    const kmlEntry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.kml'));
    if (!kmlEntry) throw new Error('No .kml file found inside the KMZ');
    return kmlEntry.getData().toString('utf8');
  }
  return fs.readFileSync(filePath, 'utf8');
}

// Google Earth gives every new pin this default name. Treat it as "no name".
const DEFAULT_NAMES = ['untitled placemark', 'unnamed', 'placemark'];

// "military_base" → "Military base"
function prettyType(code: string): string {
  const words = code.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// KML descriptions often contain HTML. Keep plain text only.
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text === '' ? null : text;
}

async function main() {
  const [filePath, typeCode, countryArg] = process.argv.slice(2);
  const dryRun = process.argv.includes('--dry-run');

  if (!filePath || !typeCode || !countryArg) {
    console.log('Usage: npm run import:kml -- <file.kml|file.kmz> <type> <country> [--dry-run]');
    return;
  }
  const countryCode = countryArg.toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    console.log('Country must be a 2-letter code, e.g. IR');
    return;
  }

  // 2. Convert KML → GeoJSON
  const dom = new DOMParser().parseFromString(readKmlText(filePath), 'text/xml');
  const features = kml(dom as any).features;
  console.log(`Found ${features.length} placemarks in the file`);

  // 3. Find the type id (skip in dry-run so it works without a database)
  const typeId = dryRun ? 0 : await locationsRepository.findTypeIdByCode(typeCode);
  if (typeId === null) {
    console.log(`Unknown type "${typeCode}". Check the codes in the location_types table.`);
    return;
  }

  let saved = 0;
  let duplicates = 0;
  let notPoints = 0;
  let invalid = 0;
  let autoNamed = 0;

  // 4. Go through every placemark
  for (const feature of features) {
    // Only points (pins). Shapes like polygons are skipped for now.
    if (feature.geometry?.type !== 'Point') {
      notPoints++;
      continue;
    }

    const [lng, lat] = feature.geometry.coordinates; // KML = lng, lat, (altitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      invalid++;
      continue;
    }

    // No real name → give it one, e.g. "Military base EG-007"
    let name = cleanText(feature.properties?.name)?.slice(0, 150) ?? null;
    if (!name || DEFAULT_NAMES.includes(name.toLowerCase())) {
      autoNamed++;
      name = `${prettyType(typeCode)} ${countryCode}-${String(autoNamed).padStart(3, '0')}`;
    }
    const description = cleanText(feature.properties?.description);

    if (dryRun) {
      console.log(`  ${name}  (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
      saved++;
      continue;
    }

    if (await locationsRepository.existsNear(lng, lat)) {
      duplicates++;
      continue;
    }

    await locationsRepository.insert({ typeId, name, countryCode, lng, lat, description });
    saved++;
  }

  // 5. Summary
  console.log('');
  console.log(dryRun ? `Would save:        ${saved}` : `Saved:             ${saved}`);
  if (!dryRun) console.log(`Already existed:   ${duplicates}`);
  console.log(`Skipped (shapes):  ${notPoints}`);
  console.log(`Skipped (bad coordinates): ${invalid}`);
  if (autoNamed > 0) console.log(`Auto-named (no real name in the file): ${autoNamed}`);
  if (dryRun) console.log('\nDry run: nothing was saved. Run again without --dry-run to save.');
}

main()
  .catch((err) => console.error('Import failed:', err.message))
  .finally(() => db.end()); // close the database so the script can exit