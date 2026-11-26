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
import {
  FOLDER_ACTIONS,
  type FolderAction,
  type FolderChoice,
  type MapImportPreview,
  type MapImportResult,
  type PreviewFolder,
} from '../types/mapImport.types';
import { AppError } from '../utils/AppError';
import { classifyFolder, classifyIcon, classifySite } from '../utils/classifySite';
import { pinPoint, readFolders, type KmlFolder } from '../utils/kml';
import { frontlineIcon, guessSide, isSkipFolder, isStrikeFolder } from '../utils/mapImportRules';
import { cleanShapes, cleanText } from '../utils/shapes';
import { makeSystemFinder } from '../utils/systemMatch';
import { checkCountry } from './countries.service';
import { fileIcons } from './fileIcons.service';

const DUPLICATE_METERS = 50; // same type closer than this = the same base / strike
const DEFAULT_BASE_TYPE = 'military_base';
const DEFAULT_NAMES = /^(untitled placemark|unnamed|placemark)$/i; // Google Earth's name for a new pin = no name
const SYSTEM_TYPES = ['air_defence', 'radar']; // site types that are linked to a system of the weapons table

// The name shown for a pin's system when it isn't in the weapons table: its name, else its folder's last part.
// The start of its description is added: "EWR" alone doesn't say which radar, "EWR (1 x 36D6)" does.
function systemLabel(pin: Pin, folderName: string): string {
  const name = pin.name ?? folderName.split(' / ').pop() ?? folderName;
  if (!pin.description) return name;
  const start = pin.description.length > 30 ? `${pin.description.slice(0, 30).trim()}…` : pin.description;
  return `${name} (${start})`;
}

// ---------- Reading the folders ----------

// One pin (point) of the file
interface Pin {
  name: string | null;
  description: string | null;
  lng: number;
  lat: number;
  type: string | null; // the base type read from its name, else its icon (null = unclear)
  iconLink: string | null; // its icon: a link, or a picture inside the KMZ (files/tank.png)
}

// The valid pins of a folder. Pins with bad coordinates or at 0,0 (a "read me" note) are counted as invalid.
function readPins(folder: KmlFolder): { pins: Pin[]; invalid: number } {
  const pins: Pin[] = [];
  let invalid = 0;

  for (const placemark of folder.placemarks) {
    const point = pinPoint(placemark.geometry); // a point, or a point with its site's outline
    if (!point) continue;
    const [lng, lat] = point;
    const ok = Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
    if (!ok || (lng === 0 && lat === 0)) {
      invalid++;
      continue;
    }

    const p = placemark.properties ?? {};
    let name = cleanText(p.name)?.slice(0, 150) ?? null;
    if (name && DEFAULT_NAMES.test(name)) name = null;
    const type = classifySite(name) ?? classifyIcon(p.styleUrl, p.icon);
    pins.push({ name, description: cleanText(p.description), lng, lat, type, iconLink: typeof p.icon === 'string' ? p.icon : null });
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
    if (g?.type === 'GeometryCollection' && pinPoint(g)) counts.points++; // a pin with its site's outline = one pin
    else if (g?.type === 'GeometryCollection') g.geometries.forEach((part) => add(part.type));
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
  if (pins.length > 0 && (classifyFolder(folder.name) !== null || typed >= pins.length / 2)) return 'bases';
  if (shapes > 0) return 'layer';
  return 'skip';
}

// The type for a folder's unclear pins: from the folder's name ("Airports" → airport), else a military base
function folderType(folder: KmlFolder, typeCodes: Set<string>): string {
  const code = classifyFolder(folder.name);
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
  const icons = fileIcons(file, fileName); // the pictures inside a KMZ (none in a .kml)
  const findSystem = makeSystemFinder(await weaponsRepository.findAll());

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

    const pinCountries = allCountries.slice(next, next + pins.length);
    next += pins.length;
    const countries: Record<string, number> = {};
    for (const code of pinCountries) countries[code] = (countries[code] ?? 0) + 1;

    // Air defence / radar pins: found in the weapons table (their range will show), or missing from it
    const unclearType = folderType(folder, typeCodes);
    const systems = { linked: 0, missing: {} as Record<string, number> };
    pins.forEach((pin, i) => {
      const type = pin.type && typeCodes.has(pin.type) ? pin.type : unclearType;
      if (!SYSTEM_TYPES.includes(type)) return;
      if (findSystem([pin.name, pin.description, folder.name], type, [pinCountries[i], country]) !== null) systems.linked++;
      else {
        const label = systemLabel(pin, folder.name);
        systems.missing[label] = (systems.missing[label] ?? 0) + 1;
      }
    });

    const shapeNames = folder.placemarks.map((p) => cleanText(p.properties?.name) ?? '');
    return {
      index,
      name: folder.name,
      ...counts,
      action: guessAction(folder, counts, pins),
      baseTypes,
      unclear,
      fileIcons: pins.filter((pin) => icons.has(pin.iconLink)).length,
      typeCode: unclearType,
      systems,
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

  // Finds an air defence / radar pin's system in the weapons table ("SA-2" → the weapon "S-75")
  const findSystem = makeSystemFinder(await weaponsRepository.findAll());

  const result: MapImportResult = {
    bases: { saved: 0, duplicates: 0, linked: 0, missing: {}, byType: {} },
    layers: [],
    events: { saved: 0, duplicates: 0 },
    skipped: 0,
    invalid: 0,
    fileIcons: 0,
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
      // iconLink keeps the file's own icon, so a picture inside a KMZ can still be found later (markPins)
      layer.features.push(
        isPoint ? { ...placemark, properties: { ...p, icon: frontlineIcon(p.styleUrl, p.icon), iconLink: p.icon } } : placemark,
      );
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
  // Checked now (too many shapes → error before anything is saved). Saved inside the transaction below.
  for (const layer of layers.values()) cleanShapes(layer.features);
  const icons = fileIcons(input.file, input.fileName); // the pictures inside a KMZ (none in a .kml)

  // 3. Pins of the bases and strikes folders, with their country (one query for all of them)
  const pinFolders: { choice: FolderChoice; pins: Pin[]; folderName: string }[] = [];
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
    pinFolders.push({ choice, pins, folderName: folder.name });
  });
  const countries = await countriesOf(pinFolders.flatMap((f) => f.pins), input.country);

  // 4. Save everything in one transaction
  const occurredAt = `${input.date}T00:00:00.000Z`;
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    let next = 0; // position in countries
    for (const { choice, pins, folderName } of pinFolders) {
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
          // An air defence / radar pin → linked to its system, found in its name, description or folder
          // ("SA-2" → S-75). The system of the pin's country first, else of the file's country.
          let weaponId: number | null = null;
          if (SYSTEM_TYPES.includes(type.code)) {
            weaponId = findSystem([pin.name, pin.description, folderName], type.code, [countryCode, input.country]);
            if (weaponId !== null) result.bases.linked++;
            else {
              const label = systemLabel(pin, folderName);
              result.bases.missing[label] = (result.bases.missing[label] ?? 0) + 1;
            }
          }

          // Its own icon from the KMZ: the picture is saved (once) and linked to the base
          const iconId = await icons.idFor(client, pin.iconLink);
          if (iconId !== null) result.fileIcons++;

          await mapImportRepository.insertLocation(client, {
            typeId: type.id,
            weaponId,
            iconId,
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

    for (const layer of layers.values()) {
      // Pins with their own picture in the KMZ keep it (icon "file"), then the shapes are cleaned
      const marked = await icons.markPins(client, layer.features);
      result.fileIcons += marked.filter((f) => f.properties?.icon === 'file').length;
      const shapes = cleanShapes(marked);
      if (shapes.features.length === 0) continue; // nothing drawable in it

      const geojson = { type: 'FeatureCollection' as const, features: shapes.features };
      const replaced = await mapImportRepository.saveLayerVersion(client, layer.name, layer.sideId, input.date, geojson, adminId);
      result.layers.push({ name: layer.name, replaced, areas: shapes.areas, lines: shapes.lines, icons: shapes.icons });
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