// Reads KML / KMZ files.
// - parseKml():       the pins (points) → bases / airports  (POST /api/locations/import)
// - readKmlShapes():  areas, lines and icons → frontline layers (POST /api/layers/import)
// - readFolders():    everything, grouped by folder → the "Import map" tab (POST /api/map-import)
import AdmZip from 'adm-zip';
import { DOMParser } from '@xmldom/xmldom';
import { kml, kmlWithFolders } from '@tmcw/togeojson';
import type { Feature, Geometry } from 'geojson';
import { AppError } from './AppError';
import { cleanText } from './shapes';

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

// Where a pin is: a Point, or a Point drawn together with the site's outline
// (Google Earth "MultiGeometry": one pin + one polygon around the site, as in GEOIMINT files).
// Returns [lng, lat], or null when it isn't a pin (a line, an area, or several points).
export function pinPoint(geometry: Geometry | null | undefined): number[] | null {
  if (geometry?.type === 'Point') return geometry.coordinates;
  if (geometry?.type === 'GeometryCollection') {
    const points = geometry.geometries.filter((g) => g.type === 'Point');
    if (points.length === 1) return (points[0] as { coordinates: number[] }).coordinates; // the outline is left out
  }
  return null;
}

export interface KmlPoint {
  name: string | null; // null = no real name in the file
  folder: string | null; // the Google Earth folder it was in, e.g. "Air defence / Iron Dome"
  description: string | null;
  lng: number;
  lat: number;
  iconLink: string | null; // the pin's icon (a link, or a picture inside the KMZ: files/tank.png)
}

export interface ParsedKml {
  found: number; // all placemarks in the file
  points: KmlPoint[]; // the valid pins
  notPoints: number; // lines / polygons (skipped)
  invalid: number; // bad coordinates, or 0,0 (skipped)
}

// Every placemark with the folder path it sits in ("Air defence / Iron Dome").
// The folders are how the file's author grouped the pins, so they help guess each pin's type.
type FolderNode = { type: string; meta?: { name?: unknown }; children?: FolderNode[] };
function readFeaturesWithFolders(file: Buffer, fileName: string): { feature: Feature; folder: string | null }[] {
  const dom = new DOMParser().parseFromString(toKmlText(file, fileName), 'text/xml');
  const root = kmlWithFolders(dom as any) as unknown as FolderNode;
  const out: { feature: Feature; folder: string | null }[] = [];

  function walk(node: FolderNode, path: string[]) {
    for (const child of node.children ?? []) {
      if (child.type === 'folder') {
        const name = cleanText(child.meta?.name);
        walk(child, name ? [...path, name] : path);
      } else if (child.type === 'Feature') {
        out.push({ feature: child as unknown as Feature, folder: path.length > 0 ? path.join(' / ') : null });
      }
    }
  }
  walk(root, []);
  return out;
}

export function parseKml(file: Buffer, fileName: string): ParsedKml {
  const features = readFeaturesWithFolders(file, fileName);
  const result: ParsedKml = { found: features.length, points: [], notPoints: 0, invalid: 0 };

  for (const { feature, folder } of features) {
    // Only pins (a point, or a point with its site's outline). Shapes like polygons are skipped here.
    const point = pinPoint(feature.geometry);
    if (!point) {
      result.notPoints++;
      continue;
    }

    const [lng, lat] = point; // KML = lng, lat, (altitude)
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      result.invalid++;
      continue;
    }
    // 0,0 ("Null Island", in the sea off Africa) is where tools put pins with no real place, e.g. a "READ ME" note
    if (lat === 0 && lng === 0) {
      result.invalid++;
      continue;
    }

    let name = cleanText(feature.properties?.name)?.slice(0, 150) ?? null;
    if (name && DEFAULT_NAMES.includes(name.toLowerCase())) name = null;

    const icon = feature.properties?.icon;
    result.points.push({
      name,
      folder,
      description: cleanText(feature.properties?.description),
      lng,
      lat,
      iconLink: typeof icon === 'string' ? icon : null,
    });
  }

  return result;
}

// ---------- Whole map (the "Import map" tab) ----------

export interface KmlFolder {
  name: string; // the folder path, e.g. "Bases / Airports", or "(no folder)"
  placemarks: Feature[];
}

// Every placemark of the file, grouped by its folder, in the file's order.
export function readFolders(file: Buffer, fileName: string): KmlFolder[] {
  const folders = new Map<string, Feature[]>();
  for (const { feature, folder } of readFeaturesWithFolders(file, fileName)) {
    const name = folder ?? '(no folder)';
    folders.set(name, [...(folders.get(name) ?? []), feature]);
  }

  // Nothing inside, but a <NetworkLink>: the file only points to an online map (e.g. Google My Maps)
  if (folders.size === 0 && toKmlText(file, fileName).includes('<NetworkLink')) {
    throw AppError.badRequest(
      'This file only links to an online map, it has no data inside. In Google My Maps: ⋮ → Download KML → untick "Keep data up to date with network link KML".',
    );
  }
  return [...folders].map(([name, placemarks]) => ({ name, placemarks }));
}

// ---------- Shapes (areas / lines / icons) ----------

// All shapes of the file, not cleaned yet: the frontline import first links the KMZ icons, then cleans (shapes.ts).
export function readKmlShapes(file: Buffer, fileName: string): Feature[] {
  return readFeatures(file, fileName);
}