// Checks and cleans map shapes (areas, lines, icons) before they are saved.
// Used for KML uploads AND for shapes drawn in the map editor.
// Never trust shapes from outside: wrong coordinates or huge files could break the map for everyone.
import type { Feature, Geometry, Position } from 'geojson';
import { AppError } from './AppError';

// The icons the map knows. 'text' = no icon, only the name written on the map.
export const ICONS = ['fighting', 'explosion', 'text'];

const MAX_SHAPES = 5000;
const MAX_POINTS = 200_000; // all coordinates together

// KML descriptions often contain HTML. Keep plain text only.
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '') // invisible direction marks (common in Arabic text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text === '' ? null : text;
}

// Only keep a color if it really is a color, e.g. "#a52714"
function readColor(value: unknown): string | null {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

// Only keep a number if it is inside [min, max]
function readNumber(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && value >= min && value <= max ? value : null;
}

// ---------- Coordinates ----------

let pointCount = 0; // counts coordinates while cleaning one file

// One [lng, lat]. Rounded to 7 decimals (about 1 cm) and without altitude. null = invalid.
function cleanPosition(p: unknown): Position | null {
  if (!Array.isArray(p) || p.length < 2) return null;
  const [lng, lat] = p;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) return null;
  pointCount++;
  return [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
}

// A list of positions with at least `min` items. null = invalid.
function cleanPositions(list: unknown, min: number): Position[] | null {
  if (!Array.isArray(list) || list.length < min) return null;
  const result = list.map(cleanPosition);
  return result.includes(null) ? null : (result as Position[]);
}

// A polygon = list of rings (outer border + optional holes). Each ring needs 4+ points.
function cleanRings(rings: unknown): Position[][] | null {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const result = rings.map((ring) => cleanPositions(ring, 4));
  return result.includes(null) ? null : (result as Position[][]);
}

// A list of parts, e.g. the lines of a MultiLineString. null = invalid.
function cleanParts<T>(parts: unknown, cleanPart: (part: unknown) => T | null): T[] | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const result = parts.map(cleanPart);
  return result.includes(null) ? null : (result as T[]);
}

// Returns a clean geometry, or null if it is broken or a type we don't support.
function cleanGeometry(geometry: any): Geometry | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const c = geometry.coordinates;

  switch (geometry.type) {
    case 'Point': {
      const coordinates = cleanPosition(c);
      return coordinates && { type: 'Point', coordinates };
    }
    case 'LineString': {
      const coordinates = cleanPositions(c, 2);
      return coordinates && { type: 'LineString', coordinates };
    }
    case 'MultiLineString': {
      const coordinates = cleanParts(c, (line) => cleanPositions(line, 2));
      return coordinates && { type: 'MultiLineString', coordinates };
    }
    case 'Polygon': {
      const coordinates = cleanRings(c);
      return coordinates && { type: 'Polygon', coordinates };
    }
    case 'MultiPolygon': {
      const coordinates = cleanParts(c, cleanRings);
      return coordinates && { type: 'MultiPolygon', coordinates };
    }
    default:
      return null;
  }
}

// ---------- Shapes ----------

export interface CleanShapes {
  features: Feature[];
  areas: number;
  lines: number;
  icons: number; // icons + text labels
}

// Keep only the properties the map uses. Everything else is dropped.
function cleanProperties(p: Record<string, unknown>, geometry: Geometry) {
  const isLine = geometry.type === 'LineString' || geometry.type === 'MultiLineString';
  const isPoint = geometry.type === 'Point';
  return {
    name: cleanText(p.name)?.slice(0, 200) ?? null,
    description: cleanText(p.description)?.slice(0, 2000) ?? null,
    stroke: readColor(p.stroke),
    'stroke-width': readNumber(p['stroke-width'], 0.5, 20),
    'stroke-opacity': readNumber(p['stroke-opacity'], 0, 1),
    fill: readColor(p.fill),
    'fill-opacity': readNumber(p['fill-opacity'], 0, 1),
    arrow: isLine && p.arrow === true, // lines only: draw an arrowhead at the end
    icon: isPoint ? (ICONS.includes(p.icon as string) ? (p.icon as string) : 'explosion') : null, // points only
  };
}

// Cleans a list of shapes. Broken shapes are skipped. Throws 400 if there are too many.
export function cleanShapes(input: unknown[]): CleanShapes {
  if (input.length > MAX_SHAPES) throw AppError.badRequest(`Too many shapes (max ${MAX_SHAPES})`);

  const result: CleanShapes = { features: [], areas: 0, lines: 0, icons: 0 };
  pointCount = 0;

  for (const item of input) {
    const feature = item as Feature;
    if (!feature || typeof feature !== 'object') continue;

    // A KML "MultiGeometry" becomes a GeometryCollection: split it into separate shapes
    const geometries: unknown[] =
      feature.geometry?.type === 'GeometryCollection' ? feature.geometry.geometries : [feature.geometry];

    for (const g of geometries) {
      const geometry = cleanGeometry(g);
      if (!geometry) continue; // broken or unsupported → skip

      if (geometry.type === 'Point') result.icons++;
      else if (geometry.type === 'LineString' || geometry.type === 'MultiLineString') result.lines++;
      else result.areas++;

      result.features.push({
        type: 'Feature',
        properties: cleanProperties(feature.properties ?? {}, geometry),
        geometry,
      });
    }
  }

  if (pointCount > MAX_POINTS) throw AppError.badRequest('The shapes are too detailed (too many points)');
  return result;
}