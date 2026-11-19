// SQL for the "Import map" tab.
// The write functions take the transaction's `client`: the whole import is saved together, or not at all.
import type { FeatureCollection } from 'geojson';
import type { PoolClient } from 'pg';
import { db } from '../config/db';
import { saveShapes } from './layers.repository';

// ---------- Countries (PostGIS) ----------

const NEAR_BORDER_METERS = 30_000; // a pin just outside every border (a port, a small island) → the nearest country within 30 km

// The country of each point, in the same order (null = no country found).
// One query for all points: unnest turns the two lists into rows (lng, lat, n).
// 1. ST_Intersects: the border that contains the point (fast: uses the spatial index).
// 2. If none: the nearest border within 30 km, because the borders are simplified and miss some coasts and islands.
export async function findCountries(points: { lng: number; lat: number }[]): Promise<(string | null)[]> {
  if (points.length === 0) return [];
  const { rows } = await db.query<{ code: string | null }>(
    `SELECT COALESCE(
              (SELECT b.code FROM country_borders b WHERE ST_Intersects(b.geom, p.geom) LIMIT 1),
              (SELECT b.code FROM country_borders b
                WHERE ST_DWithin(b.geom::geography, p.geom::geography, $3)
                ORDER BY ST_Distance(b.geom::geography, p.geom::geography)
                LIMIT 1)
            ) AS code
       FROM unnest($1::float8[], $2::float8[]) WITH ORDINALITY AS t(lng, lat, n)
      CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_MakePoint(t.lng, t.lat), 4326) AS geom) p
      ORDER BY t.n`,
    [points.map((p) => p.lng), points.map((p) => p.lat), NEAR_BORDER_METERS],
  );
  return rows.map((r) => r.code);
}

// ---------- Bases ----------

// Same type already within `meters`? (also sees the bases saved earlier in this import: same transaction)
export async function locationExistsNear(client: PoolClient, lng: number, lat: number, typeId: number, meters: number) {
  const { rows } = await client.query(
    `SELECT 1 FROM locations
      WHERE location_type_id = $1
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
      LIMIT 1`,
    [typeId, lng, lat, meters],
  );
  return rows.length > 0;
}

export async function insertLocation(
  client: PoolClient,
  loc: { typeId: number; weaponId: number | null; name: string; countryCode: string; lng: number; lat: number; description: string | null },
): Promise<void> {
  await client.query(
    `INSERT INTO locations (location_type_id, weapon_id, name, country_code, geom, description)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)`,
    [loc.typeId, loc.weaponId, loc.name, loc.countryCode, loc.lng, loc.lat, loc.description],
  );
}

// ---------- Strikes (events) ----------

// Same event type, same day, within `meters`? Then it's the same strike (the file was imported before).
export async function eventExistsNear(
  client: PoolClient,
  lng: number,
  lat: number,
  typeId: number,
  occurredAt: string,
  meters: number,
) {
  const { rows } = await client.query(
    `SELECT 1 FROM events
      WHERE event_type_id = $1
        AND occurred_at = $4
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $5)
      LIMIT 1`,
    [typeId, lng, lat, occurredAt, meters],
  );
  return rows.length > 0;
}

// Imported strikes are "confirmed": the admin checked them in the preview, and only confirmed events show on the map
export async function insertEvent(
  client: PoolClient,
  ev: { typeId: number; title: string; description: string | null; occurredAt: string; lng: number; lat: number; countryCode: string },
  createdBy: number,
): Promise<void> {
  await client.query(
    `INSERT INTO events (event_type_id, title, description, occurred_at, geom, country_code, status, created_by)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, 'confirmed', $8)`,
    [ev.typeId, ev.title, ev.description, ev.occurredAt, ev.lng, ev.lat, ev.countryCode, createdBy],
  );
}

// ---------- Frontline layers ----------

// Saves one layer version: same name + date already there → its shapes are replaced, else a new version.
// Returns true if it replaced one.
export async function saveLayerVersion(
  client: PoolClient,
  name: string,
  sideId: number,
  snapshotDate: string,
  geojson: FeatureCollection,
  createdBy: number,
): Promise<boolean> {
  const { rows } = await client.query<{ id: number }>('SELECT id FROM map_layers WHERE name = $1 AND snapshot_date = $2', [
    name,
    snapshotDate,
  ]);

  if (rows[0]) {
    await client.query('DELETE FROM map_layer_features WHERE layer_id = $1', [rows[0].id]);
    await client.query('UPDATE map_layers SET created_by = $1 WHERE id = $2', [createdBy, rows[0].id]);
    await saveShapes(client, rows[0].id, geojson);
    return true;
  }

  const inserted = await client.query<{ id: number }>(
    'INSERT INTO map_layers (name, side_id, snapshot_date, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
    [name, sideId, snapshotDate, createdBy],
  );
  await saveShapes(client, inserted.rows[0].id, geojson);
  return false;
}