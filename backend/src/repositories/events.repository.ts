import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { AdminEvent, CreateEventInput, EventStatus, PublicEvent } from '../types/events.types';

// Confirmed events that happened after `since`, newest first.
// MySQL 8 + SRID 4326: use ST_Longitude / ST_Latitude, NOT ST_X / ST_Y (those return lat first).
export async function findConfirmedSince(since: Date): Promise<PublicEvent[]> {
  const [rows] = await db.execute<(PublicEvent & RowDataPacket)[]>(
    `SELECT e.id, e.event_type_id, e.title, e.description, e.occurred_at, e.created_at,
            ST_Longitude(e.geom) AS lng, ST_Latitude(e.geom) AS lat,
            t.name AS type_name, t.icon, t.color,
            l.name AS location_name, e.country_code
       FROM events e
       JOIN event_types t ON t.id = e.event_type_id
       LEFT JOIN locations l ON l.id = e.location_id
      WHERE e.status = 'confirmed'
        AND e.occurred_at >= ?
      ORDER BY e.occurred_at DESC`,
    [since],
  );
  return rows;
}

// Inserts one event and returns its new id.
// The point is written as 'POINT(lng lat)' with axis-order=long-lat (MySQL 8 trap).
export async function insert(input: CreateEventInput, createdBy: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO events
       (event_type_id, title, description, occurred_at, geom, location_id, country_code, status, created_by)
     VALUES (?, ?, ?, ?, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), ?, ?, ?, ?)`,
    [
      input.event_type_id,
      input.title,
      input.description,
      input.occurred_at,
      `POINT(${input.lng} ${input.lat})`,
      input.location_id,
      input.country_code,
      input.status,
      createdBy,
    ],
  );
  return result.insertId;
}

// All event types (id + name), for the admin form's dropdown.
export async function findTypes(): Promise<{ id: number; name: string; color: string | null }[]> {
  const [rows] = await db.execute<({ id: number; name: string; color: string | null } & RowDataPacket)[]>(
    'SELECT id, name, color FROM event_types ORDER BY name',
  ); // color: the map editor shows the pin in the type's color
  return rows;
}

// Admin list: the 100 most recent events, optionally only one status.
export async function findRecentForAdmin(status?: EventStatus): Promise<AdminEvent[]> {
  const where = status ? 'WHERE e.status = ?' : '';
  const params = status ? [status] : [];

  const [rows] = await db.execute<(AdminEvent & RowDataPacket)[]>(
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
export async function updateStatus(id: number, status: EventStatus): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE events SET status = ? WHERE id = ?',
    [status, id],
  );
  return result.affectedRows;
}

// Returns how many rows were deleted (0 = no event with that id).
// Links in event_news are removed automatically (ON DELETE CASCADE).
export async function deleteById(id: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('DELETE FROM events WHERE id = ?', [id]);
  return result.affectedRows;
}

// Changes one event, except its status (the admin's edit box on the map).
// keepTarget = true its target base (location_id) stays as it is: the map editor doesn't send it.
// Returns how many rows matched (0 = no event with that id).
export async function update(id: number, input: Omit<CreateEventInput, 'status'>, keepTarget: boolean): Promise<number> {
  const target = keepTarget ? '' : 'location_id = ?,';
  const values: unknown[] = [input.event_type_id, input.title, input.description, input.occurred_at, `POINT(${input.lng} ${input.lat})`];
  if (!keepTarget) values.push(input.location_id);
  values.push(input.country_code, id);

  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE events
        SET event_type_id = ?, title = ?, description = ?, occurred_at = ?,
            geom = ST_GeomFromText(?, 4326, 'axis-order=long-lat'), ${target} country_code = ?
      WHERE id = ?`,
    values as any[],
  );
  return result.affectedRows;
}