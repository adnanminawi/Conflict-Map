import { db } from '../config/db';

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
}

export async function findByUsername(username: string): Promise<AdminRow | null> {
  const { rows } = await db.query<AdminRow>('SELECT id, username, password_hash FROM admins WHERE username = $1', [username]);
  return rows[0] ?? null;
}

// RETURNING id gives back the new id (MySQL had result.insertId)
export async function insert(username: string, passwordHash: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id',
    [username, passwordHash],
  );
  return rows[0].id;
}
