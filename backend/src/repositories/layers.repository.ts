import type { FeatureCollection } from 'geojson';
import { db } from '../config/db';
import type { LayerVersion, MapLayer } from '../types/layers.types';

// The newest version of every layer (one row per layer name), with its side.
// to_char returns the date as plain text ("2026-10-24") so it never shifts by timezone.
// pg turns the jsonb column into a normal object automatically.
// Sorted in JS, like before (the rows hold the big geojson column).
export async function findLatest(): Promise<MapLayer[]> {
  const { rows } = await db.query<MapLayer>(
    `SELECT l.id, l.name, l.side_id, s.name AS side_name, s.color AS side_color, s.country_code,
            to_char(l.snapshot_date, 'YYYY-MM-DD') AS snapshot_date, l.geojson
       FROM map_layers l
       JOIN sides s ON s.id = l.side_id
      WHERE l.snapshot_date = (SELECT MAX(m.snapshot_date)
                                 FROM map_layers m
                                WHERE m.name = l.name)`,
  );
  return rows.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
}

// Every version of every layer, newest first (for the admin list).
export async function findVersions(): Promise<LayerVersion[]> {
  const { rows } = await db.query<LayerVersion>(
    `SELECT l.id, l.name, l.side_id, s.name AS side_name, s.color AS side_color, s.country_code,
            to_char(l.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
            jsonb_array_length(l.geojson -> 'features') AS shape_count,
            a.username AS created_by_username
       FROM map_layers l
       JOIN sides s ON s.id = l.side_id
       JOIN admins a ON a.id = l.created_by
      ORDER BY l.name COLLATE natural_sort, l.snapshot_date DESC`,
  );
  return rows;
}

// The id of the version with this name + date, or null if there is none.
export async function findIdByNameAndDate(name: string, snapshotDate: string): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM map_layers WHERE name = $1 AND snapshot_date = $2', [
    name,
    snapshotDate,
  ]);
  return rows[0]?.id ?? null;
}

// The side this layer name already belongs to, or null if the name is new.
export async function findSideIdByName(name: string): Promise<number | null> {
  const { rows } = await db.query<{ side_id: number }>('SELECT side_id FROM map_layers WHERE name = $1 LIMIT 1', [name]);
  return rows[0]?.side_id ?? null;
}

// Saves a new version and returns its id.
// JSON.stringify: sent as JSON text (pg would send a JS array as a Postgres array, not JSON).
export async function insert(
  name: string,
  sideId: number,
  snapshotDate: string,
  geojson: FeatureCollection,
  createdBy: number,
): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO map_layers (name, side_id, snapshot_date, geojson, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [name, sideId, snapshotDate, JSON.stringify(geojson), createdBy],
  );
  return rows[0].id;
}

// Overwrites the shapes of an existing version (same name + date uploaded again).
// The side is not changed: a layer name always stays with the same side.
export async function replaceShapes(id: number, geojson: FeatureCollection, createdBy: number): Promise<void> {
  await db.query('UPDATE map_layers SET geojson = $1, created_by = $2 WHERE id = $3', [JSON.stringify(geojson), createdBy, id]);
}

// Returns how many rows were deleted (0 = no version with that id).
export async function deleteById(id: number): Promise<number> {
  const result = await db.query('DELETE FROM map_layers WHERE id = $1', [id]);
  return result.rowCount ?? 0;
}
