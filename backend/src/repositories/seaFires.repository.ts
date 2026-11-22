// seaFires: SQL queries only.
import { db } from '../config/db';
import type { Hotspot } from '../types/seaFires.types';

// The point as PostGIS wants it: longitude first. Used in every query below as ($1 = lng, $2 = lat).
// ::float8 tells Postgres the type of $1 and $2 (they're used for a point and for numeric columns: it must be one type).
const POINT = 'ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)';

// True if no hot spot was ever saved (the very first run)
export async function isEmpty(): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM sea_hotspots LIMIT 1');
  return rows.length === 0;
}

// True if the point is at sea: no country border within `km`.
// ::geography = measure in meters on the Earth (geometry would measure in degrees).
export async function isAtSea(lng: number, lat: number, km: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM country_borders
      WHERE ST_DWithin(geom::geography, ${POINT}::geography, $3)
      LIMIT 1`,
    [lng, lat, km * 1000],
  );
  return rows.length === 0;
}

// Saves one hot spot. Returns its new id, or null if it was already saved (the same pass read again).
// ON CONFLICT DO NOTHING + RETURNING: a row comes back only when it was really inserted.
export async function insertHotspot(h: Hotspot): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO sea_hotspots (lat, lng, geom, detected_at, satellite, frp, confidence)
     VALUES ($2::float8, $1::float8, ${POINT}, $3, $4, $5, $6)
     ON CONFLICT ON CONSTRAINT uq_sea_hotspots DO NOTHING
     RETURNING id`,
    [h.lng, h.lat, h.detectedAt, h.satellite, h.frp, h.confidence],
  );
  return rows[0]?.id ?? null;
}

// True if there was other heat within `km` in the `days` before this one (and up to the same moment):
// a gas platform that burns every day, or more heat from a fire we already showed.
export async function hadHeatBefore(id: number, h: Hotspot, km: number, days: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM sea_hotspots
      WHERE id <> $3
        AND detected_at BETWEEN $4::timestamptz - make_interval(days => $5) AND $4
        AND ST_DWithin(geom::geography, ${POINT}::geography, $6)
      LIMIT 1`,
    [h.lng, h.lat, id, h.detectedAt, days, km * 1000],
  );
  return rows.length > 0;
}

// The closest country within `km` (e.g. 'IR'), or null far out at sea.
// <-> = distance, sorted by the GiST index: the nearest border comes first.
export async function nearestCountry(lng: number, lat: number, km: number): Promise<string | null> {
  const { rows } = await db.query<{ code: string }>(
    `SELECT code FROM country_borders
      WHERE ST_DWithin(geom::geography, ${POINT}::geography, $3)
      ORDER BY geom <-> ${POINT}
      LIMIT 1`,
    [lng, lat, km * 1000],
  );
  return rows[0]?.code ?? null;
}

// The id of the "Fire at sea (satellite)" event type (from 007-sea-fires.sql)
export async function findSeaFireTypeId(): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>("SELECT id FROM event_types WHERE code = 'sea_fire'");
  return rows[0]?.id ?? null;
}

// Links the hot spot to the event it created
export async function setEvent(hotspotId: number, eventId: number): Promise<void> {
  await db.query('UPDATE sea_hotspots SET event_id = $1 WHERE id = $2', [eventId, hotspotId]);
}