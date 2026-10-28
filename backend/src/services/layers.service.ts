import * as layersRepository from '../repositories/layers.repository';
import type { ImportLayerInput, ImportLayerResult } from '../types/layers.types';
import { AppError } from '../utils/AppError';
import { parseKmlShapes } from '../utils/kml';

export async function getLatestLayers() {
  return layersRepository.findLatest();
}

export async function getLayerVersions() {
  return layersRepository.findVersions();
}

// Reads the areas and lines from the file and saves them as one version of the layer.
export async function importLayer(input: ImportLayerInput, adminId: number): Promise<ImportLayerResult> {
  const parsed = parseKmlShapes(input.file, input.fileName);

  if (parsed.geojson.features.length === 0) {
    throw AppError.badRequest(
      parsed.skippedPoints > 0
        ? 'This file only has pins. Pins are events or bases, not frontlines.'
        : 'No areas or lines found. Is this a valid KML/KMZ file?',
    );
  }

  // Same layer name + same date uploaded again → replace it (e.g. fixing a mistake). Otherwise → new version.
  let id = await layersRepository.findIdByNameAndDate(input.name, input.snapshotDate);
  const replaced = id !== null;
  if (id !== null) {
    await layersRepository.replaceShapes(id, parsed.geojson, adminId);
  } else {
    id = await layersRepository.insert(input.name, input.snapshotDate, parsed.geojson, adminId);
  }

  return {
    id,
    replaced,
    areas: parsed.areas,
    lines: parsed.lines,
    skippedPoints: parsed.skippedPoints,
  };
}

export async function deleteLayerVersion(id: number) {
  const deleted = await layersRepository.deleteById(id);
  if (deleted === 0) throw AppError.notFound('Layer version not found');
}