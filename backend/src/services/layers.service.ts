import * as layersRepository from '../repositories/layers.repository';
import * as sidesRepository from '../repositories/sides.repository';
import type { ImportLayerInput, SaveLayerInput, SaveLayerResult } from '../types/layers.types';
import { AppError } from '../utils/AppError';
import { parseKmlShapes } from '../utils/kml';
import { cleanShapes, type CleanShapes } from '../utils/shapes';

export async function getLatestLayers() {
  return layersRepository.findLatest();
}

export async function getLayerVersions() {
  return layersRepository.findVersions();
}

// Uploaded KML/KMZ file → one version of the layer
export async function importLayer(input: ImportLayerInput, adminId: number): Promise<SaveLayerResult> {
  const shapes = parseKmlShapes(input.file, input.fileName);

  // A file that is almost only pins is a list of sites (bases, air defence…), not a frontline.
  // Here every pin would become an explosion icon, so send the admin to the right import.
  if (shapes.icons >= 30 && shapes.areas + shapes.lines < shapes.icons / 10) {
    throw AppError.badRequest(
      `This file is a list of ${shapes.icons} places (pins), not frontlines. Import it in the Bases tab instead, so each place keeps its own icon.`,
    );
  }

  return saveVersion(input.name, input.sideId, input.snapshotDate, shapes, adminId);
}

// Shapes drawn in the map editor → one version of the layer
export async function saveLayer(input: SaveLayerInput, adminId: number): Promise<SaveLayerResult> {
  const shapes = cleanShapes(input.features);
  return saveVersion(input.name, input.sideId, input.snapshotDate, shapes, adminId);
}

// Used by both: same name + same date → replace that version. Otherwise → new version.
async function saveVersion(
  name: string,
  sideId: number,
  snapshotDate: string,
  shapes: CleanShapes,
  adminId: number,
): Promise<SaveLayerResult> {
  if (shapes.features.length === 0) throw AppError.badRequest('There are no shapes to save');

  // 1. The side must exist
  const side = await sidesRepository.findById(sideId);
  if (!side) throw AppError.badRequest('This side does not exist');

  // 2. A layer name always stays with the same side
  const nameSideId = await layersRepository.findSideIdByName(name);
  if (nameSideId !== null && nameSideId !== sideId) {
    throw AppError.conflict(`"${name}" already belongs to another side. Use a different layer name.`);
  }

  // 3. Save: replace the version with the same name + date, or add a new one
  const geojson = { type: 'FeatureCollection' as const, features: shapes.features };

  let id = await layersRepository.findIdByNameAndDate(name, snapshotDate);
  const replaced = id !== null;
  if (id !== null) {
    await layersRepository.replaceShapes(id, geojson, adminId);
  } else {
    id = await layersRepository.insert(name, sideId, snapshotDate, geojson, adminId);
  }

  return { id, replaced, areas: shapes.areas, lines: shapes.lines, icons: shapes.icons };
}

export async function deleteLayerVersion(id: number) {
  const deleted = await layersRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Layer version not found');
}