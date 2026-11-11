import { db } from '../config/db';
import type { Country } from '../types/countries.types';

// Every country, sorted by English name
export async function findAll(): Promise<Country[]> {
  const { rows } = await db.query<Country>('SELECT code, name_en, name_ar FROM countries ORDER BY name_en COLLATE natural_sort');
  return rows;
}

// True if this code is a real country
export async function exists(code: string): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM countries WHERE code = $1', [code]);
  return rows.length > 0;
}
