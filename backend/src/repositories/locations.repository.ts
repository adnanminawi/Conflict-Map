import { db } from '../config/db';
import type { LocationRow, MapLocation } from '../types/locations.types';

// PostGIS points: ST_MakePoint(lng, lat) to write, ST_X = lng and ST_Y = lat to read.

// All bases / airports with their type. Static data, so no time filter.
export async function findAll(): Promise<MapLocation[]> {
  const { rows } = await db.query<MapLocation>(
    `SELECT l.id, l.name, l.country_code, l.description, l.weapon_id,
            ST_X(l.geom) AS lng, ST_Y(l.geom) AS lat,
            t.code AS type_code, t.name AS type_name, t.icon
       FROM locations l
       JOIN location_types t ON t.id = l.location_type_id
      ORDER BY l.name COLLATE natural_sort`,
  );
  return rows;
}

// All location types, for the admin import form's dropdown.
export async function findTypes(): Promise<{ id: number; code: string; name: string }[]> {
  const { rows } = await db.query<{ id: number; code: string; name: string }>(
    'SELECT id, code, name FROM location_types ORDER BY name COLLATE natural_sort',
  );
  return rows;
}

// --- Used by the KML import ---

// Finds the id of a location type by its code, e.g. 'military_base'. null = not found.
export async function findTypeIdByCode(code: string): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM location_types WHERE code = $1', [code]);
  return rows[0]?.id ?? null;
}

// True if a location of the same type already exists within `meters` of this point (to avoid duplicates).
// We compare positions, not names, because KML names are often empty or "Untitled placemark".
// Same type only: a radar 30 m from a launcher is a different site, not a duplicate.
// ::geography = measure in meters on the Earth. ST_DWithin uses the spatial index (idx_locations_geog).
export async function existsNear(lng: number, lat: number, typeId: number, meters = 50): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT 1 FROM locations
      WHERE location_type_id = $1
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
      LIMIT 1`,
    [typeId, lng, lat, meters],
  );
  return rows.length > 0;
}

// Saves one location and returns its id.
export async function insert(loc: LocationRow): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO locations (location_type_id, weapon_id, name, country_code, geom, description)
     VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326), $7)
     RETURNING id`,
    [loc.typeId, loc.weaponId, loc.name, loc.countryCode, loc.lng, loc.lat, loc.description],
  );
  return rows[0].id;
}

// Changes everything about one location (the admin's edit box on the map).
// Returns how many rows matched (0 = no location with that id).
export async function update(id: number, loc: LocationRow): Promise<number> {
  const result = await db.query(
    `UPDATE locations
        SET location_type_id = $1, weapon_id = $2, name = $3, country_code = $4,
            geom = ST_SetSRID(ST_MakePoint($5, $6), 4326), description = $7
      WHERE id = $8`,
    [loc.typeId, loc.weaponId, loc.name, loc.countryCode, loc.lng, loc.lat, loc.description, id],
  );
  return result.rowCount ?? 0;
}

// Returns how many rows were deleted (0 = no location with that id)
export async function deleteById(id: number): Promise<number> {
  const result = await db.query('DELETE FROM locations WHERE id = $1', [id]);
  return result.rowCount ?? 0;
}

// Deletes many locations in one query. Returns how many were deleted.
// = ANY($1): the ids go as one array value, never pasted into the SQL.
export async function deleteMany(ids: number[]): Promise<number> {
  const result = await db.query('DELETE FROM locations WHERE id = ANY($1::int[])', [ids]);
  return result.rowCount ?? 0;
}
