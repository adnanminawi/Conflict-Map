import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { FeatureCollection } from 'geojson';
import { db } from '../config/db';
import type { LayerVersion, MapLayer } from '../types/layers.types';

// The newest version of every layer (one row per layer name).
// DATE_FORMAT returns the date as plain text ("2026-10-24") so it never shifts by timezone.
// mysql2 turns the JSON column into a normal object automatically.
export async function findLatest(): Promise<MapLayer[]> {
  const [rows] = await db.execute<(MapLayer & RowDataPacket)[]>(
    `SELECT l.id, l.name, DATE_FORMAT(l.snapshot_date, '%Y-%m-%d') AS snapshot_date, l.geojson
       FROM map_layers l
      WHERE l.snapshot_date = (SELECT MAX(m.snapshot_date)
                                 FROM map_layers m
                                WHERE m.name = l.name)`,
  );
  return rows.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date));
}

// Every version of every layer, newest first (for the admin list).
export async function findVersions(): Promise<LayerVersion[]> {
  const [rows] = await db.execute<(LayerVersion & RowDataPacket)[]>(
    `SELECT l.id, l.name, DATE_FORMAT(l.snapshot_date, '%Y-%m-%d') AS snapshot_date,
            JSON_LENGTH(l.geojson, '$.features') AS shape_count,
            a.username AS created_by_username
       FROM map_layers l
       JOIN admins a ON a.id = l.created_by
      ORDER BY l.name, l.snapshot_date DESC`,
  );
  return rows;
}

// The id of the version with this name + date, or null if there is none.
export async function findIdByNameAndDate(name: string, snapshotDate: string): Promise<number | null> {
  const [rows] = await db.execute<({ id: number } & RowDataPacket)[]>(
    'SELECT id FROM map_layers WHERE name = ? AND snapshot_date = ?',
    [name, snapshotDate],
  );
  return rows[0]?.id ?? null;
}

// Saves a new version and returns its id.
export async function insert(
  name: string,
  snapshotDate: string,
  geojson: FeatureCollection,
  createdBy: number,
): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO map_layers (name, snapshot_date, geojson, created_by) VALUES (?, ?, ?, ?)',
    [name, snapshotDate, JSON.stringify(geojson), createdBy],
  );
  return result.insertId;
}

// Overwrites the shapes of an existing version (same name + date uploaded again).
export async function replaceShapes(id: number, geojson: FeatureCollection, createdBy: number): Promise<void> {
  await db.execute('UPDATE map_layers SET geojson = ?, created_by = ? WHERE id = ?', [
    JSON.stringify(geojson),
    createdBy,
    id,
  ]);
}

// Returns how many rows were deleted (0 = no version with that id).
export async function deleteById(id: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('DELETE FROM map_layers WHERE id = ?', [id]);
  return result.affectedRows;
}