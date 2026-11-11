import { db } from '../config/db';
import type { AdminEvent, CreateEventInput, EventStatus, PublicEvent } from '../types/events.types';

// PostGIS points: ST_MakePoint(lng, lat) to write, ST_X = lng and ST_Y = lat to read.
// Always longitude first: no axis-order trap like in MySQL 8.

// Confirmed events that happened after `since`, newest first.
export async function findConfirmedSince(since: Date): Promise<PublicEvent[]> {
  const { rows } = await db.query<PublicEvent>(
    `SELECT e.id, e.event_type_id, e.title, e.description, e.occurred_at, e.created_at,
            ST_X(e.geom) AS lng, ST_Y(e.geom) AS lat,
            t.name AS type_name, t.icon, t.color,
            l.name AS location_name, e.country_code
       FROM events e
       JOIN event_types t ON t.id = e.event_type_id
       LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.status = 'confirmed'
        AND e.occurred_at >= $1
      ORDER BY e.occurred_at DESC`,
    [since],
  );
  return rows;
}

// Inserts one event and returns its new id.
export async function insert(input: CreateEventInput, createdBy: number): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO events
       (event_type_id, title, description, occurred_at, geom, location_id, country_code, status, created_by)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8, $9, $10)
     RETURNING id`,
    [
      input.event_type_id,
      input.title,
      input.description,
      input.occurred_at,
      input.lng,
      input.lat,
      input.location_id,
      input.country_code,
      input.status,
      createdBy,
    ],
  );
  return rows[0].id;
}

// All event types (id + name), for the admin form's dropdown.
export async function findTypes(): Promise<{ id: number; name: string; color: string | null }[]> {
  const { rows } = await db.query<{ id: number; name: string; color: string | null }>(
    'SELECT id, name, color FROM event_types ORDER BY name COLLATE natural_sort',
  ); // color: the map editor shows the pin in the type's color
  return rows;
}

// Admin list: the 100 most recent events, optionally only one status.
export async function findRecentForAdmin(status?: EventStatus): Promise<AdminEvent[]> {
  const where = status ? 'WHERE e.status = $1' : '';
  const params = status ? [status] : [];

  const { rows } = await db.query<AdminEvent>(
    `SELECT e.id, e.title, e.occurred_at, e.status,
            t.name AS type_name,
            a.username AS created_by_username
       FROM events e
       JOIN event_types t ON t.id = e.event_type_id
       JOIN admins a ON a.id = e.created_by
      ${where}
      ORDER BY e.occurred_at DESC
      LIMIT 100`,
    params,
  );
  return rows;
}

// Returns how many rows changed (0 = no event with that id).
// rowCount is MySQL's affectedRows.
export async function updateStatus(id: number, status: EventStatus): Promise<number> {
  const result = await db.query('UPDATE events SET status = $1 WHERE id = $2', [status, id]);
  return result.rowCount ?? 0;
}

// Returns how many rows were deleted (0 = no event with that id).
// Links in event_news are removed automatically (ON DELETE CASCADE).
export async function deleteById(id: number): Promise<number> {
  const result = await db.query('DELETE FROM events WHERE id = $1', [id]);
  return result.rowCount ?? 0;
}

// Changes one event, except its status (the admin's edit box on the map).
// keepTarget = true → its target base (location_id) stays as it is: the map editor doesn't send it.
// Returns how many rows matched (0 = no event with that id).
export async function update(id: number, input: Omit<CreateEventInput, 'status'>, keepTarget: boolean): Promise<number> {
  // $1…$8 are always there; location_id only when it changes, so it takes the last number
  const values: unknown[] = [input.event_type_id, input.title, input.description, input.occurred_at, input.lng, input.lat, input.country_code, id];
  let target = '';
  if (!keepTarget) {
    values.push(input.location_id);
    target = `, location_id = $${values.length}`;
  }

  const result = await db.query(
    `UPDATE events
        SET event_type_id = $1, title = $2, description = $3, occurred_at = $4,
            geom = ST_SetSRID(ST_MakePoint($5, $6), 4326), country_code = $7${target}
      WHERE id = $8`,
    values,
  );
  return result.rowCount ?? 0;
}
