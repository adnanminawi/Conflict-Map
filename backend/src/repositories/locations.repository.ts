import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { MapLocation } from '../types/locations.types';


export async function findAll(): Promise<MapLocation[]> {
  const [rows] = await db.execute<(MapLocation & RowDataPacket)[]>(
    `SELECT l.id, l.name, l.country_code, l.description,
            ST_Longitude(l.geom) AS lng, ST_Latitude(l.geom) AS lat,
            t.code AS type_code, t.name AS type_name, t.icon
       FROM locations l
       JOIN location_types t ON t.id = l.location_type_id
      ORDER BY l.name`,
  );
  return rows;
}