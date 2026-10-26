import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { db } from '../config/db';

export interface AdminRow {
  id: number;
  username: string;
  password_hash: string;
}

export async function findByUsername(username: string): Promise<AdminRow | null> {
  const [rows] = await db.execute<(AdminRow & RowDataPacket)[]>(
    'SELECT id, username, password_hash FROM admins WHERE username = ?',
    [username],
  );
  return rows[0] ?? null;
}

export async function insert(username: string, passwordHash: string): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    'INSERT INTO admins (username, password_hash) VALUES (?, ?)',
    [username, passwordHash],
  );
  return result.insertId;
}