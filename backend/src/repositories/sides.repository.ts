import { db, UNIQUE_VIOLATION } from '../config/db';
import type { NewSide, Side } from '../types/sides.types';

// Every side, grouped by country
export async function findAll(): Promise<Side[]> {
  const { rows } = await db.query<Side>('SELECT id, country_code, name, color FROM sides ORDER BY country_code, name COLLATE natural_sort');
  return rows;
}

// One side, or null if there is no side with this id
export async function findById(id: number): Promise<Side | null> {
  const { rows } = await db.query<Side>('SELECT id, country_code, name, color FROM sides WHERE id = $1', [id]);
  return rows[0] ?? null;
}

// The sides of one country (empty = the country has no sides)
export async function findByCountry(countryCode: string): Promise<Side[]> {
  const { rows } = await db.query<Side>('SELECT id, country_code, name, color FROM sides WHERE country_code = $1 ORDER BY name COLLATE natural_sort', [
    countryCode,
  ]);
  return rows;
}

// Saves a new side and returns its id. Returns null if this country already has a side with this name.
export async function insert(side: NewSide): Promise<number | null> {
  try {
    const { rows } = await db.query<{ id: number }>(
      'INSERT INTO sides (country_code, name, color) VALUES ($1, $2, $3) RETURNING id',
      [side.countryCode, side.name, side.color],
    );
    return rows[0].id;
  } catch (err: any) {
    if (err.code === UNIQUE_VIOLATION) return null;
    throw err;
  }
}
