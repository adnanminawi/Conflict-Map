import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { NewSide, Side } from '../types/sides.types';

// Every side, grouped by country
export async function findAll(): Promise<Side[]> {
  const [rows] = await db.execute<(Side & RowDataPacket)[]>(
    'SELECT id, country_code, name, color FROM sides ORDER BY country_code, name',
  );
  return rows;
}

// One side, or null if there is no side with this id
export async function findById(id: number): Promise<Side | null> {
  const [rows] = await db.execute<(Side & RowDataPacket)[]>(
    'SELECT id, country_code, name, color FROM sides WHERE id = ?',
    [id],
  );
  return rows[0] ?? null;
}

// The sides of one country (empty = the country has no sides)
export async function findByCountry(countryCode: string): Promise<Side[]> {
  const [rows] = await db.execute<(Side & RowDataPacket)[]>(
    'SELECT id, country_code, name, color FROM sides WHERE country_code = ? ORDER BY name',
    [countryCode],
  );
  return rows;
}

// Saves a new side and returns its id. Returns null if this country already has a side with this name.
export async function insert(side: NewSide): Promise<number | null> {
  try {
    const [result] = await db.execute<ResultSetHeader>(
      'INSERT INTO sides (country_code, name, color) VALUES (?, ?, ?)',
      [side.countryCode, side.name, side.color],
    );
    return result.insertId;
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') return null;
    throw err;
  }
}