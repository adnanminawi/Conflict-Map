import type { FeatureCollection } from 'geojson';
import type { PoolClient } from 'pg';
import { db } from '../config/db';
import type { LayerVersion, MapLayer } from '../types/layers.types';


// ---------- Shapes ----------

// Reads the shapes of these versions in ONE query, as GeoJSON geometry.
// = ANY($1) means "layer_id is one of these ids". ST_AsGeoJSON(geom, 7) = 7 decimals, same as saved.
async function findShapes(layerIds: number[]) {
  const { rows } = await db.query(
    `SELECT layer_id, properties, ST_AsGeoJSON(geom, 7)::json AS geometry
       FROM map_layer_features
      WHERE layer_id = ANY($1::int[])
      ORDER BY id`,
    [layerIds],
  );
  return rows;
}

// Saves all the shapes of one version in ONE query.
// jsonb_array_elements splits the list into one row per shape (f).
// WITH ORDINALITY gives each shape its position (n), ORDER BY n saves them in the same order.
async function saveShapes(client: PoolClient, layerId: number, geojson: FeatureCollection): Promise<void> {
  await client.query(
    `INSERT INTO map_layer_features (layer_id, properties, geom)
     SELECT $1,
            COALESCE(f -> 'properties', '{}'::jsonb),
            ST_SetSRID(ST_GeomFromGeoJSON(f ->> 'geometry'), 4326)
       FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(f, n)
      ORDER BY n`,
    [layerId, JSON.stringify(geojson.features)],
  );
}

// ---------- Reading ----------

// The newest version of every layer, with its side and its shapes.
// to_char returns the date as plain text ("2026-10-24") so it never shifts by timezone.
export async function findLatest(): Promise<MapLayer[]> {
  const { rows } = await db.query(
    `SELECT l.id, l.name, l.side_id, s.name AS side_name, s.color AS side_color, s.country_code,
            to_char(l.snapshot_date, 'YYYY-MM-DD') AS snapshot_date
       FROM map_layers l
       JOIN sides s ON s.id = l.side_id
      WHERE l.snapshot_date = (SELECT MAX(m.snapshot_date) FROM map_layers m WHERE m.name = l.name)
      ORDER BY l.snapshot_date DESC`,
  );

  const shapes = await findShapes(rows.map((layer) => layer.id));

  // No database query here: just give each layer its own shapes (JavaScript only)
  for (const layer of rows) {
    const features = shapes
      .filter((shape) => shape.layer_id === layer.id)
      .map((shape) => ({ type: 'Feature', properties: shape.properties, geometry: shape.geometry }));
    layer.geojson = { type: 'FeatureCollection', features };
  }
  return rows;
}

// Every version of every layer (for the admin list). shape_count = how many shapes it has.
export async function findVersions(): Promise<LayerVersion[]> {
  const { rows } = await db.query<LayerVersion>(
    `SELECT l.id, l.name, l.side_id, s.name AS side_name, s.color AS side_color, s.country_code,
            to_char(l.snapshot_date, 'YYYY-MM-DD') AS snapshot_date,
            (SELECT COUNT(*) FROM map_layer_features f WHERE f.layer_id = l.id) AS shape_count,
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
  const { rows } = await db.query('SELECT id FROM map_layers WHERE name = $1 AND snapshot_date = $2', [name, snapshotDate]);
  return rows[0]?.id ?? null;
}

// The side this layer name already belongs to, or null if the name is new.
export async function findSideIdByName(name: string): Promise<number | null> {
  const { rows } = await db.query('SELECT side_id FROM map_layers WHERE name = $1 LIMIT 1', [name]);
  return rows[0]?.side_id ?? null;
}

// ---------- Writing ----------
// Saving takes several queries (the version + its shapes), so they run in a transaction:
// BEGIN … COMMIT = all saved together; if one fails, ROLLBACK = nothing is saved.
// A transaction must use one connection (client), not the pool.

// Saves a new version with its shapes and returns its id.
export async function insert(name: string,sideId: number, snapshotDate: string, geojson: FeatureCollection, createdBy: number,): Promise<number> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'INSERT INTO map_layers (name, side_id, snapshot_date, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [name, sideId, snapshotDate, createdBy],
    );
    await saveShapes(client, rows[0].id, geojson);
    await client.query('COMMIT');
    return rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release(); // give the connection back to the pool
  }
}

// Same name + date uploaded again: delete the old shapes, save the new ones.
export async function replaceShapes(id: number, geojson: FeatureCollection, createdBy: number): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM map_layer_features WHERE layer_id = $1', [id]);
    await saveShapes(client, id, geojson);
    await client.query('UPDATE map_layers SET created_by = $1 WHERE id = $2', [createdBy, id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Returns how many rows were deleted (0 = no version with that id).
// Its shapes are deleted automatically (ON DELETE CASCADE).
export async function deleteById(id: number): Promise<number> {
  const result = await db.query('DELETE FROM map_layers WHERE id = $1', [id]);
  return result.rowCount ?? 0;
}