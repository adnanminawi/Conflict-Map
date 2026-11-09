import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { MapLocation,LocationRow } from '../types/locations.types';

// All bases / airports with their type. Static data, so no time filter.
export async function findAll(): Promise<MapLocation[]> {
  const [rows] = await db.execute<(MapLocation & RowDataPacket)[]>(
    `SELECT l.id, l.name, l.country_code, l.description, l.weapon_id,
            ST_Longitude(l.geom) AS lng, ST_Latitude(l.geom) AS lat,
            t.code AS type_code, t.name AS type_name, t.icon
       FROM locations l
       JOIN location_types t ON t.id = l.location_type_id
      ORDER BY l.name`,
  );
  return rows;
}

// All location types, for the admin import form's dropdown.
export async function findTypes(): Promise<{ id: number; code: string; name: string }[]> {
  const [rows] = await db.execute<({ id: number; code: string; name: string } & RowDataPacket)[]>(
    'SELECT id, code, name FROM location_types ORDER BY name',
  );
  return rows;
}

// --- Used by the KML import ---

// Finds the id of a location type by its code, e.g. 'military_base'. null = not found.
export async function findTypeIdByCode(code: string): Promise<number | null> {
  const [rows] = await db.execute<({ id: number } & RowDataPacket)[]>(
    'SELECT id FROM location_types WHERE code = ?',
    [code],
  );
  return rows[0]?.id ?? null;
}

// True if a location of the same type already exists within `meters` of this point (to avoid duplicates).
// We compare positions, not names, because KML names are often empty or "Untitled placemark".
// Same type only: a radar 30 m from a launcher is a different site, not a duplicate.
export async function existsNear(lng: number, lat: number, typeId: number, meters = 50): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT 1 FROM locations
      WHERE location_type_id = ?
        AND ST_Distance_Sphere(geom, ST_GeomFromText(?, 4326, 'axis-order=long-lat')) < ?
      LIMIT 1`,
    [typeId, `POINT(${lng} ${lat})`, meters],
  );
  return rows.length > 0;
}

// Saves one location. The point is written as 'POINT(lng lat)' (MySQL 8 axis-order trap).
export async function insert(loc: LocationRow): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `INSERT INTO locations (location_type_id, name, country_code, geom, description,weapon_id)
     VALUES (?, ?, ?, ST_GeomFromText(?, 4326, 'axis-order=long-lat'), ?,?)`,
    [loc.typeId, loc.name, loc.countryCode, `POINT(${loc.lng} ${loc.lat})`, loc.description,loc.weaponId],
  );
  return result.insertId;
}

// Changes everything about one location (the admin's edit box on the map).
// Returns how many rows matched (0 = no location with that id).
export async function update(id: number, loc: LocationRow): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    `UPDATE locations
        SET location_type_id = ?, name = ?, country_code = ?, weapon_id = ?,
            geom = ST_GeomFromText(?, 4326, 'axis-order=long-lat'), description = ?
      WHERE id = ?`,
    [loc.typeId, loc.name, loc.countryCode, loc.weaponId, `POINT(${loc.lng} ${loc.lat})`, loc.description, id],
  );
  return result.affectedRows;
}

// Returns how many rows were deleted (0 = no location with that id)
export async function deleteById(id: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('DELETE FROM locations WHERE id = ?', [id]);
  return result.affectedRows;
}

// Deletes many locations in one query. Returns how many were deleted.
// One "?" per id: the ids are still sent as values, never pasted into the SQL.
export async function deleteMany(ids: number[]): Promise<number> {
  const marks = ids.map(() => '?').join(', ');
  const [result] = await db.execute<ResultSetHeader>(`DELETE FROM locations WHERE id IN (${marks})`, ids);
  return result.affectedRows;
}