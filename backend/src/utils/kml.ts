// Reads KML / KMZ files.
// - parseKml():       the pins (points) → bases / airports  (POST /api/locations/import)
// - parseKmlShapes(): areas and lines → frontline layers   (POST /api/layers/import)
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import type { Feature } from 'geojson';
import { AppError } from './AppError';
import { cleanShapes, cleanText, type CleanShapes } from './shapes';

const MAX_KML_BYTES = 20 * 1024 * 1024; // 20 MB after unzipping

// Google Earth gives every new pin this default name. Treat it as "no name".
const DEFAULT_NAMES = ['untitled placemark', 'unnamed', 'placemark'];

// ---------- Shared ----------

// A KMZ is just a zip with a .kml file inside.
function toKmlText(file: Buffer, fileName: string): string {
  if (!fileName.toLowerCase().endsWith('.kmz')) return file.toString('utf8');

  let zip: AdmZip;
  try {
    zip = new AdmZip(file);
  } catch {
    throw AppError.badRequest('This KMZ file is damaged or not a real KMZ');
  }

  const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith('.kml'));
  if (!entry) throw AppError.badRequest('No .kml file found inside the KMZ');
  if (entry.header.size > MAX_KML_BYTES) throw AppError.badRequest('The KML inside the KMZ is too big');
  return entry.getData().toString('utf8');
}

// KML file → list of GeoJSON features (one per placemark)
function readFeatures(file: Buffer, fileName: string): Feature[] {
  const dom = new DOMParser().parseFromString(toKmlText(file, fileName), 'text/xml');
  return kml(dom as any).features as Feature[];
}


// ---------- Points (bases / airports) ----------

export interface KmlPoint {
  name: string | null; // null = no real name in the file
  description: string | null;
  lng: number;
  lat: number;
}

export interface ParsedKml {
  found: number; // all placemarks in the file
  points: KmlPoint[]; // the valid pins
  notPoints: number; // lines / polygons (skipped)
  invalid: number; // bad coordinates (skipped)
}

export function parseKml(file: Buffer, fileName: string): ParsedKml {
  const features = readFeatures(file, fileName);
  const result: ParsedKml = { found: features.length, points: [], notPoints: 0, invalid: 0 };

  for (const feature of features) {
    // Only points (pins). Shapes like polygons are skipped here.
    if (feature.geometry?.type !== 'Point') {
      result.notPoints++;
      continue;
    }

    const [lng, lat] = feature.geometry.coordinates; // KML = lng, lat, (altitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      result.invalid++;
      continue;
    }

    let name = cleanText(feature.properties?.name)?.slice(0, 150) ?? null;
    if (name && DEFAULT_NAMES.includes(name.toLowerCase())) name = null;

    result.points.push({ name, description: cleanText(feature.properties?.description), lng, lat });
  }

  return result;
}

// ---------- Shapes (areas / lines) ----------
export function parseKmlShapes(file: Buffer, fileName: string): CleanShapes {
  return cleanShapes(readFeatures(file, fileName));
}