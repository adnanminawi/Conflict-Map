import type { FeatureCollection } from 'geojson';

// The latest version of one layer, for the public map (GET /api/layers).
export interface MapLayer {
  id: number;
  name: string; // e.g. "Taiz front"
  side_id: number;
  side_name: string; // "Houthis"
  side_color: string; // "#A52714"
  country_code: string; // "YE" — comes from the side
  snapshot_date: string; // "2026-10-24" — the date this version shows
  geojson: FeatureCollection;
}

// One saved version, for the admin list (GET /api/layers/versions). No geojson: it can be big.
export interface LayerVersion {
  id: number;
  name: string;
  side_id: number;
  side_name: string;
  side_color: string;
  country_code: string;
  snapshot_date: string;
  shape_count: number;
  created_by_username: string;
}

// What the map editor sends: shapes drawn on the map (POST /api/layers).
export interface SaveLayerInput {
  name: string;
  sideId: number;
  snapshotDate: string; // "YYYY-MM-DD"
  features: unknown[]; // checked and cleaned by utils/shapes.ts before saving
}

// What the admin sends to upload a KML/KMZ layer.
export interface ImportLayerInput {
  file: Buffer;
  fileName: string;
  name: string;
  sideId: number;
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