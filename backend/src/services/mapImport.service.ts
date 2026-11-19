// The "Import map" tab: one KML/KMZ file with bases, frontlines and strikes, sorted folder by folder.
// Step 1 previewMap(): reads the file and guesses what each folder is. Saves nothing.
// Step 2 importMap():  saves every folder the way the admin chose, in ONE transaction (all or nothing).
import type { Feature } from 'geojson';
import { db } from '../config/db';
import * as eventsRepository from '../repositories/events.repository';
import * as layersRepository from '../repositories/layers.repository';
import * as locationsRepository from '../repositories/locations.repository';
import * as mapImportRepository from '../repositories/mapImport.repository';
import * as sidesRepository from '../repositories/sides.repository';
import * as weaponsRepository from '../repositories/weapons.repository';
import {FOLDER_ACTIONS, type FolderAction, type FolderChoice, type MapImportPreview, type MapImportResult, type PreviewFolder,} from '../types/mapImport.types';
import { AppError } from '../utils/AppError';
import { classifyIcon, classifySite, systemNameOf } from '../utils/classifySite';
import { readFolders, type KmlFolder } from '../utils/kml';
import { frontlineIcon, guessSide, isSkipFolder, isStrikeFolder } from '../utils/mapImportRules';
import { cleanShapes, cleanText } from '../utils/shapes';
import { checkCountry } from './countries.service';

const DUPLICATE_METERS = 50; // same type closer than this = the same base / strike
const DEFAULT_BASE_TYPE = 'military_base';
const DEFAULT_NAMES = /^(untitled placemark|unnamed|placemark)$/i; // Google Earth's name for a new pin = no name

// ---------- Reading the folders ----------

// One pin (point) of the file
interface Pin {
  name: string | null;
  description: string | null;
  lng: number;
  lat: number;
  type: string | null; // the base type read from its name, else its icon (null = unclear)
}

// The valid pins of a folder. Pins with bad coordinates or at 0,0 (a "read me" note) are counted as invalid.
function readPins(folder: KmlFolder): { pins: Pin[]; invalid: number } {
  const pins: Pin[] = [];
  let invalid = 0;

  for (const placemark of folder.placemarks) {
    if (placemark.geometry?.type !== 'Point') continue;
    const [lng, lat] = placemark.geometry.coordinates;
    const ok = Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
    if (!ok || (lng === 0 && lat === 0)) {
      invalid++;
      continue;
    }

    const p = placemark.properties ?? {};
    let name = cleanText(p.name)?.slice(0, 150) ?? null;
    if (name && DEFAULT_NAMES.test(name)) name = null;
    const type = classifySite(name) ?? classifyIcon(p.styleUrl, p.icon);
    pins.push({ name, description: cleanText(p.description), lng, lat, type });
  }
  return { pins, invalid };
}

// How many pins, areas and lines a folder has (a MultiGeometry counts each of its parts)
function countShapes(folder: KmlFolder) {
  const counts = { points: 0, areas: 0, lines: 0 };
  const add = (type: string | undefined) => {
    if (type === 'Point' || type === 'MultiPoint') counts.points++;
    else if (type === 'LineString' || type === 'MultiLineString') counts.lines++;
    else if (type === 'Polygon' || type === 'MultiPolygon') counts.areas++;
  };
  for (const placemark of folder.placemarks) {
    const g = placemark.geometry;
    if (g?.type === 'GeometryCollection') g.geometries.forEach((part) => add(part.type));
    else add(g?.type);
  }
  return counts;
}

// Our guess for a folder, checked in this order:
// cities / mountains → skip; mostly areas and lines → frontline layer; strike words → events;
// a base word in the folder's name, or most pins have a base type → bases; some shapes → layer; else skip.
function guessAction(folder: KmlFolder, counts: ReturnType<typeof countShapes>, pins: Pin[]): FolderAction {
  const shapes = counts.areas + counts.lines;
  if (isSkipFolder(folder.name)) return 'skip';
  if (shapes > 0 && shapes >= counts.points) return 'layer';
  if (isStrikeFolder(folder.name)) return 'events';
  const typed = pins.filter((p) => p.type !== null).length;
  if (pins.length > 0 && (classifySite(folder.name) !== null || typed >= pins.length / 2)) return 'bases';
  if (shapes > 0) return 'layer';
  return 'skip';
}

// The type for a folder's unclear pins: from the folder's name ("Airports" → airport), else a military base
function folderType(folder: KmlFolder, typeCodes: Set<string>): string {
  const code = classifySite(folder.name);
  return code && typeCodes.has(code) ? code : DEFAULT_BASE_TYPE;
}

// The country of every pin (from the borders in PostGIS). Pins outside every border get the file's country.
async function countriesOf(pins: Pin[], fileCountry: string): Promise<string[]> {
  const found = await mapImportRepository.findCountries(pins);
  return found.map((code) => code ?? fileCountry);
}

async function checkFile(country: string, file: Buffer, fileName: string) {
  await checkCountry(country);
  const folders = readFolders(file, fileName);
  if (folders.length === 0) throw AppError.badRequest('No placemarks found. Is this a valid KML/KMZ file?');
  return folders;
}

// ---------- Step 1: preview ----------

export async function previewMap(file: Buffer, fileName: string, country: string): Promise<MapImportPreview> {
  const folders = await checkFile(country, file, fileName);
  const typeCodes = new Set((await locationsRepository.findTypes()).map((t) => t.code));
  const sides = await sidesRepository.findAll();

  // The country of every pin of the file, in one query
  const pinsPerFolder = folders.map((f) => readPins(f).pins);
  const allCountries = await countriesOf(pinsPerFolder.flat(), country);

  let next = 0; // position in allCountries
  const result: PreviewFolder[] = folders.map((folder, index) => {
    const pins = pinsPerFolder[index];
    const counts = countShapes(folder);

    const baseTypes: Record<string, number> = {};
    let unclear = 0;
    for (const pin of pins) {
      if (pin.type && typeCodes.has(pin.type)) baseTypes[pin.type] = (baseTypes[pin.type] ?? 0) + 1;
      else unclear++;
    }

    const countries: Record<string, number> = {};
    for (const code of allCountries.slice(next, next + pins.length)) countries[code] = (countries[code] ?? 0) + 1;
    next += pins.length;

    const shapeNames = folder.placemarks.map((p) => cleanText(p.properties?.name) ?? '');
    return {
      index,
      name: folder.name,
      ...counts,
      action: guessAction(folder, counts, pins),
      baseTypes,
      unclear,
      typeCode: folderType(folder, typeCodes),
      countries,
      sideId: guessSide(folder.name, shapeNames, sides, country),
      layerName: folder.name.slice(0, 150),
    };
  });

  return { found: folders.reduce((sum, f) => sum + f.placemarks.length, 0), folders: result };
}

// ---------- Step 2: import ----------

export interface ImportMapInput {
  file: Buffer;
  fileName: string;
  country: string; // the file's main country: for pins outside every border, and for guessing sides
  date: string; // "2026-11-19": the date of the frontline versions and of the strikes
  choices: FolderChoice[];
}

export async function importMap(input: ImportMapInput, adminId: number): Promise<MapImportResult> {
  const folders = await checkFile(input.country, input.file, input.fileName);

  const types = new Map((await locationsRepository.findTypes()).map((t) => [t.code, t]));
  const eventTypes = new Map((await eventsRepository.findTypes()).map((t) => [t.id, t]));
  const sides = new Map((await sidesRepository.findAll()).map((s) => [s.id, s]));

  // Air defence / radar systems by country, type and name: "IL:air_defence:iron dome" → weapon id
  const systems = new Map(
    (await weaponsRepository.findAll()).map((w) => [`${w.country_code}:${w.type_code}:${w.name.toLowerCase()}`, w.id]),
  );

  const result: MapImportResult = {
    bases: { saved: 0, duplicates: 0, linked: 0, byType: {} },
    layers: [],
    events: { saved: 0, duplicates: 0 },
    skipped: 0,
    invalid: 0,
  };

  // 1. Check every choice before saving anything. A folder with no choice is skipped.
  const choices = new Map<number, FolderChoice>();
  for (const choice of input.choices) {
    if (!Number.isInteger(choice.index) || !folders[choice.index]) throw AppError.badRequest('Unknown folder in the choices');
    if (!FOLDER_ACTIONS.includes(choice.action)) throw AppError.badRequest(`Unknown action "${choice.action}"`);
    const folderName = folders[choice.index].name;

    if (choice.action === 'bases' && !types.has(choice.typeCode ?? '')) {
      throw AppError.badRequest(`"${folderName}": choose a type for its unclear pins`);
    }
    if (choice.action === 'events' && !eventTypes.has(Number(choice.eventTypeId))) {
      throw AppError.badRequest(`"${folderName}": choose an event type`);
    }
    if (choice.action === 'layer') {
      if (!sides.has(Number(choice.sideId))) throw AppError.badRequest(`"${folderName}": choose a side`);
      const name = (choice.layerName ?? '').trim();
      if (name.length < 1 || name.length > 150) throw AppError.badRequest(`"${folderName}": the layer name is required (max 150)`);
      choice.layerName = name;
    }
    choices.set(choice.index, choice);
  }

  // 2. Frontline layers: folders with the same layer name are joined into one layer
  const layers = new Map<string, { name: string; sideId: number; features: Feature[] }>();
  for (const [index, choice] of choices) {
    if (choice.action !== 'layer') continue;
    const key = choice.layerName!.toLowerCase(); // layer names ignore upper / lower case, like the database
    const layer = layers.get(key) ?? { name: choice.layerName!, sideId: Number(choice.sideId), features: [] };
    if (layer.sideId !== Number(choice.sideId)) {
      throw AppError.badRequest(`Two folders use the layer name "${layer.name}" with different sides`);
    }
    // Pins in a frontline folder become an explosion / fighting icon, or just their name on the map
    for (const placemark of folders[index].placemarks) {
      const p = placemark.properties ?? {};
      const isPoint = placemark.geometry?.type === 'Point';
      layer.features.push(isPoint ? { ...placemark, properties: { ...p, icon: frontlineIcon(p.styleUrl, p.icon) } } : placemark);
    }
    layers.set(key, layer);
  }
  // A layer name always stays with the same side (like the Frontlines tab)
  for (const layer of layers.values()) {
    const nameSideId = await layersRepository.findSideIdByName(layer.name);
    if (nameSideId !== null && nameSideId !== layer.sideId) {
      throw AppError.conflict(`The layer "${layer.name}" already belongs to another side. Use a different layer name.`);
    }
  }
  const cleanLayers = [...layers.values()].map((layer) => ({ ...layer, shapes: cleanShapes(layer.features) }));

  // 3. Pins of the bases and strikes folders, with their country (one query for all of them)
  const pinFolders: { choice: FolderChoice; pins: Pin[] }[] = [];
  folders.forEach((folder, index) => {
    const choice = choices.get(index);
    if (!choice || choice.action === 'skip') {
      result.skipped += folder.placemarks.length;
      return;
    }
    if (choice.action === 'layer') return;
    const { pins, invalid } = readPins(folder);
    result.invalid += invalid;
    result.skipped += folder.placemarks.length - pins.length - invalid; // its lines / areas
    pinFolders.push({ choice, pins });
  });
  const countries = await countriesOf(pinFolders.flatMap((f) => f.pins), input.country);

  // 4. Save everything in one transaction
  const occurredAt = `${input.date}T00:00:00.000Z`;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let next = 0; // position in countries
    for (const { choice, pins } of pinFolders) {
      for (const pin of pins) {
        const found = countries[next++];
        // Near a border the simplified borders can be wrong: the admin can put the whole folder in the file's country
        const countryCode = choice.fileCountry ? input.country : found;

        if (choice.action === 'bases') {
          // Its type: from its name or icon, else the folder's type
          const type = types.get(pin.type && types.has(pin.type) ? pin.type : choice.typeCode!)!;
          if (await mapImportRepository.locationExistsNear(client, pin.lng, pin.lat, type.id, DUPLICATE_METERS)) {
            result.bases.duplicates++;
            continue;
          }
          // An air defence / radar pin named after a known system ("THAAD") → linked to it.
          // The system of the pin's country first, else of the file's country.
          const system = pin.name ? `${type.code}:${systemNameOf(pin.name)}` : null;
          const weaponId = system ? systems.get(`${countryCode}:${system}`) ?? systems.get(`${input.country}:${system}`) ?? null : null;
          if (weaponId !== null) result.bases.linked++;

          await mapImportRepository.insertLocation(client, {
            typeId: type.id,
            weaponId,
            name: pin.name ?? type.name,
            countryCode,
            lng: pin.lng,
            lat: pin.lat,
            description: pin.description,
          });
          result.bases.saved++;
          result.bases.byType[type.name] = (result.bases.byType[type.name] ?? 0) + 1;
        } else {
          // A strike → an event of the chosen type, on the chosen date
          const eventType = eventTypes.get(Number(choice.eventTypeId))!;
          if (await mapImportRepository.eventExistsNear(client, pin.lng, pin.lat, eventType.id, occurredAt, DUPLICATE_METERS)) {
            result.events.duplicates++;
            continue;
          }
          await mapImportRepository.insertEvent(
            client,
            {
              typeId: eventType.id,
              title: (pin.name ?? eventType.name).slice(0, 200),
              description: pin.description,
              occurredAt,
              lng: pin.lng,
              lat: pin.lat,
              countryCode,
            },
            adminId,
          );
          result.events.saved++;
        }
      }
    }

    for (const layer of cleanLayers) {
      if (layer.shapes.features.length === 0) continue; // nothing drawable in it
      const geojson = { type: 'FeatureCollection' as const, features: layer.shapes.features };
      const replaced = await mapImportRepository.saveLayerVersion(client, layer.name, layer.sideId, input.date, geojson, adminId);
      result.layers.push({ name: layer.name, replaced, areas: layer.shapes.areas, lines: layer.shapes.lines, icons: layer.shapes.icons });
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK'); // nothing half-imported stays in the database
    throw err;
  } finally {
    client.release();
  }
}