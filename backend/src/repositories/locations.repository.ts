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

// --- Used by the KML import script ---

// Finds the id of a location type by its code, e.g. 'military_base'. null = not found.
export async function findTypeIdByCode(code: string): Promise<number | null> {
  const [rows] = await db.execute<({ id: number } & RowDataPacket)[]>(
    'SELECT id FROM location_types WHERE code = ?',
    [code],
  );
  return rows[0]?.id ?? null;
}

// True if a location already exists within `meters` of this point (to avoid duplicates).
// We compare positions, not names, because KML names are often empty or "Untitled placemark".
export async function existsNear(lng: number, lat: number, meters = 50): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM locations
      WHERE ST_Distance_Sphere(geom, ST_GeomFromText(?, 4326, 'axis-order=long-lat')) < ?
      LIMIT 1`,
    [`POINT(${lng} ${lat})`, meters],
  );
  return rows.length > 0;
}

// Saves one location. The point is written as 'POINT(lng lat)' (MySQL 8 axis-order trap).
export async function insert(loc: {
  typeId: number;
  name: string;
  countryCode: string;
  lng: number;
  lat: number;
  description: string | null;
}): Promise<void> {
  await db.execute(
    `INSERT INTO locations (location_type_id, name, country_code, geom, description)
     VALUES (?, ?, ?, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), ?)`,
    [loc.typeId, loc.name, loc.countryCode, `POINT(${loc.lng} ${loc.lat})`, loc.description],
  );
}