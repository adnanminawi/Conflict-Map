import { db, UNIQUE_VIOLATION } from '../config/db';
import type { AlertAreaName, MapAlertArea, NewAlert } from '../types/alerts.types';

// All place names (Russian + Hebrew) with their id, to find places from the messages
export async function findAreaNames(): Promise<AlertAreaName[]> {
  const { rows } = await db.query<AlertAreaName>('SELECT id, name_ru, name_he FROM alert_areas');
  return rows;
}

// { rockets: 1, drone: 2, other: 3 }
export async function findTypeIds(): Promise<Record<string, number>> {
  const { rows } = await db.query<{ id: number; code: string }>('SELECT id, code FROM alert_types');
  return Object.fromEntries(rows.map((r) => [r.code, r.id]));
}

// Saves one alert and its places. Returns false if it was already saved (same external_id).
export async function insert(alert: NewAlert, typeId: number): Promise<boolean> {
  let alertId: number;
  try {
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO alerts (external_id, alert_type_id, started_at, raw_text) VALUES ($1, $2, $3, $4) RETURNING id',
      [alert.externalId, typeId, alert.startedAt, alert.rawText],
    );
    alertId = rows[0].id;
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) return false; // already saved, e.g. after a restart
    throw err;
  }

  // One row per place. ON CONFLICT DO NOTHING skips a place that appears twice in the same block (MySQL: INSERT IGNORE).
  for (const areaId of alert.areaIds) {
    await db.query('INSERT INTO alert_area_links (alert_id, alert_area_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
      alertId,
      areaId,
    ]);
  }
  return true;
}

// Alerts since `since`, one row per (alert, place)
export async function findSince(since: Date) {
  const { rows } = await db.query<{ id: number; type: string; type_name: string; started_at: Date; area_id: number }>(
    `SELECT a.id, t.code AS type, t.name AS type_name, a.started_at, l.alert_area_id AS area_id
       FROM alerts a
       JOIN alert_types t ON t.id = a.alert_type_id
       JOIN alert_area_links l ON l.alert_id = a.id
      WHERE a.started_at >= $1
      ORDER BY a.started_at DESC`,
    [since],
  );
  return rows;
}

// The places with these ids, with their outlines.
// = ANY($1): the whole list goes as one value (an array), no need for one ? per id.
export async function findAreasByIds(ids: number[]): Promise<MapAlertArea[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<MapAlertArea>(
    'SELECT id, name_he, name_en, name_ar, lat, lng, polygon FROM alert_areas WHERE id = ANY($1::int[])',
    [ids],
  );
  return rows;
}
