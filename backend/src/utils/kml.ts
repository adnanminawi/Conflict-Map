// Reads KML / KMZ files.
// - parseKml():       the pins (points) → bases / airports  (POST /api/locations/import)
// - parseKmlShapes(): areas and lines → frontline layers   (POST /api/layers/import)
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml } from '@tmcw/togeojson';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { AppError } from './AppError';

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

// KML descriptions often contain HTML. Keep plain text only.
function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '') // invisible direction marks (common in Arabic text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
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

export interface ParsedShapes {
  geojson: FeatureCollection; // what we save and send to the map
  areas: number;
  lines: number;
  skippedPoints: number; // pins in the file (they are events, not shapes)
}

// Only keep a color if it really is a color, e.g. "#a52714"
function readColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

// Only keep a number if it is inside [min, max]
function readNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && value >= min && value <= max ? value : null;
}

// Keep only the properties the map needs (name, text, colors). Drops everything else.
function cleanShapeProperties(props: Record<string, unknown> | null) {
  const p = props ?? {};
  return {
    name: cleanText(p.name)?.slice(0, 200) ?? null,
    description: cleanText(p.description)?.slice(0, 2000) ?? null,
    stroke: readColor(p.stroke),
    'stroke-width': readNumber(p['stroke-width'], 0.5, 20),
    'stroke-opacity': readNumber(p['stroke-opacity'], 0, 1),
    fill: readColor(p.fill),
    'fill-opacity': readNumber(p['fill-opacity'], 0, 1),
  };
}

export function parseKmlShapes(file: Buffer, fileName: string): ParsedShapes {
  const result: ParsedShapes = {
    geojson: { type: 'FeatureCollection', features: [] },
    areas: 0,
    lines: 0,
    skippedPoints: 0,
  };

  for (const feature of readFeatures(file, fileName)) {
    if (!feature.geometry) continue;
    const properties = cleanShapeProperties(feature.properties);

    // A KML "MultiGeometry" becomes a GeometryCollection: split it into separate shapes
    const geometries: Geometry[] =
      feature.geometry.type === 'GeometryCollection' ? feature.geometry.geometries : [feature.geometry];

    for (const geometry of geometries) {
      if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        result.areas++;
      } else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') {
        result.lines++;
      } else {
        result.skippedPoints++; // Point / MultiPoint
        continue;
      }
      result.geojson.features.push({ type: 'Feature', properties, geometry });
    }
  }

  return result;
}