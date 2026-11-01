import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { AdminEvent, CreateEventInput, EventStatus, PublicEvent } from '../types/events.types';

export async function findConfirmedSince(since: Date): Promise<PublicEvent[]> {
  const [rows] = await db.execute<(PublicEvent & RowDataPacket)[]>(
    `SELECT e.id, e.title, e.description, e.occurred_at, e.created_at,
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
export async function findTypes(): Promise<{ id: number; name: string }[]> {
  const [rows] = await db.execute<({ id: number; name: string } & RowDataPacket)[]>(
    'SELECT id, name FROM event_types ORDER BY name',
  );
  return rows;
}

// Admin list: the 100 most recent events, optionally only one status.
export async function findRecentForAdmin(status?: EventStatus): Promise<AdminEvent[]> {
  const [rows] = await db.execute<(AdminEvent & RowDataPacket)[]>(
    `SELECT e.id, e.title, e.occurred_at, e.status,
            t.name AS type_name,
            a.username AS created_by_username
       FROM events e
       JOIN event_types t ON t.id = e.event_type_id
       JOIN admins a ON a.id = e.created_by
      WHERE (? IS NULL OR e.status = ?)
      ORDER BY e.occurred_at DESC
      LIMIT 100`,
    [status ?? null, status ?? null],
  );
  return rows;
}
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