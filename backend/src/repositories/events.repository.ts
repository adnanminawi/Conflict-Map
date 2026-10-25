// events: SQL queries only.
import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { PublicEvent } from '../types/events.types';

export async function findConfirmedSince(since: Date): Promise<PublicEvent[]> {
  const [rows] = await db.execute<(PublicEvent & RowDataPacket)[]>(
    `SELECT e.id, e.title, e.description, e.occurred_at, e.created_at,
            ST_Longitude(e.geom) AS lng, ST_Latitude(e.geom) AS lat,
            t.name AS type_name, t.icon, t.color,
            l.name AS location_name
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