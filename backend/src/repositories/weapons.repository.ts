import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { Weapon, WeaponInput, WeaponType } from '../types/weapons.types';



// Every weapon, sorted by country, side, then name
export async function findAll(): Promise<Weapon[]> {
  const [rows] = await db.execute<(Weapon & RowDataPacket)[]>(
    `SELECT w.id, w.name, w.range_km, w.source, w.description,
         w.weapon_type_id, t.code AS type_code, t.name AS type_name,
         w.side_id, s.name AS side_name, s.color AS side_color, s.country_code
    FROM weapons w
    JOIN weapon_types t ON t.id = w.weapon_type_id
    JOIN sides s ON s.id = w.side_id
    ORDER BY s.country_code, s.name, w.name`,
  );
  return rows;
}

// One weapon, or null if there is no weapon with this id
export async function findById(id: number): Promise<Weapon | null> {
  const [rows] = await db.execute<(Weapon & RowDataPacket)[]>(
    `SELECT w.id, w.name, w.range_km, w.source, w.description,
         w.weapon_type_id, t.code AS type_code, t.name AS type_name,
         w.side_id, s.name AS side_name, s.color AS side_color, s.country_code
    FROM weapons w
    JOIN weapon_types t ON t.id = w.weapon_type_id
    JOIN sides s ON s.id = w.side_id
    WHERE w.id = ?`, [id]);
  return rows[0] ?? null;
}

// The weapon types, for the admin form's dropdown
export async function findTypes(): Promise<WeaponType[]> {
  const [rows] = await db.execute<(WeaponType & RowDataPacket)[]>('SELECT id, code, name FROM weapon_types ORDER BY name');
  return rows;
}

// Saves a new weapon and returns its id. Returns null if this side already has a weapon with this name.
export async function insert(weapon: WeaponInput): Promise<number | null> {
  try {
    const [result] = await db.execute<ResultSetHeader>(
      `INSERT INTO weapons (weapon_type_id, side_id, name, range_km, source, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [weapon.weaponTypeId, weapon.sideId, weapon.name, weapon.rangeKm, weapon.source, weapon.description],
    );
    return result.insertId;
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return null;
    throw err;
  }
}

// Changes a weapon. Returns 'not_found', 'duplicate' (same name for the same side) or 'ok'.
export async function update(id: number, weapon: WeaponInput): Promise<'ok' | 'not_found' | 'duplicate'> {
  try {
    const [result] = await db.execute<ResultSetHeader>(
      `UPDATE weapons
          SET weapon_type_id = ?, side_id = ?, name = ?, range_km = ?, source = ?, description = ?
        WHERE id = ?`,
      [weapon.weaponTypeId, weapon.sideId, weapon.name, weapon.rangeKm, weapon.source, weapon.description, id],
    );
    return result.affectedRows === 0 ? 'not_found' : 'ok';
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return 'duplicate';
    throw err;
  }
}

// Returns how many rows were deleted (0 = no weapon with that id)
export async function deleteById(id: number): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>('DELETE FROM weapons WHERE id = ?', [id]);
  return result.affectedRows;
}