import * as layersRepository from '../repositories/layers.repository';
import type { ImportLayerInput, SaveLayerInput, SaveLayerResult } from '../types/layers.types';
import { AppError } from '../utils/AppError';
import { parseKmlShapes } from '../utils/kml';
import { cleanShapes, type CleanShapes } from '../utils/shapes';
import * as sidesRepository from '../repositories/sides.repository';

export async function getLatestLayers() {
  return layersRepository.findLatest();
}

export async function getLayerVersions() {
  return layersRepository.findVersions();
}

// Uploaded KML/KMZ file → one version of the layer
export async function importLayer(input: ImportLayerInput, adminId: number): Promise<SaveLayerResult> {
  const shapes = parseKmlShapes(input.file, input.fileName);
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
  
  const side = await sidesRepository.findById(sideId);
  if (!side) throw AppError.badRequest('This side does not exist');

  // A layer name always stays with the same side
  const nameSideId = await layersRepository.findSideIdByName(name);
  if (nameSideId !== null && nameSideId !== sideId) {
    throw AppError.conflict(`"${name}" already belongs to another side. Use a different layer name.`);
  }
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