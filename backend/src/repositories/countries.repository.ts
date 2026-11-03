import type { RowDataPacket } from 'mysql2';
import { db } from '../config/db';
import type { Country } from '../types/countries.types';

// Every country, sorted by English name
export async function findAll(): Promise<Country[]> {
  const [rows] = await db.execute<(Country & RowDataPacket)[]>('SELECT code, name_en, name_ar FROM countries ORDER BY name_en');
  return rows;
}

// True if this code is a real country
export async function exists(code: string): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>('SELECT 1 FROM countries WHERE code = ?', [code]);
  return rows.length > 0;
}