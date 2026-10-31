import type { FeatureCollection } from 'geojson';

// The latest version of one layer, for the public map (GET /api/layers).
export interface MapLayer {
  id: number;
  name: string; // e.g. "Yemen frontlines"
  country_code: string | null;
  snapshot_date: string; // "2026-10-24" — the date this version shows
  geojson: FeatureCollection;
}

// One saved version, for the admin list (GET /api/layers/versions). No geojson: it can be big.
export interface LayerVersion {
  id: number;
  name: string;
  snapshot_date: string;
  shape_count: number;
  created_by_username: string;
}
export interface SaveLayerInput {
  name: string;
  countryCode: string
  snapshotDate: string; // "YYYY-MM-DD"
  features: unknown[]; // checked and cleaned by utils/shapes.ts before saving
}

// What the admin sends to upload a layer.
export interface ImportLayerInput {
  file: Buffer;
  fileName: string;
  name: string;
  countryCode: string
  snapshotDate: string; // "YYYY-MM-DD"
}
// What a save or upload did.
export interface SaveLayerResult {
  id: number;
  replaced: boolean; // true = a version with the same name + date existed and was overwritten
  areas: number;
  lines: number;
  icons: number; // icons + text labels
}