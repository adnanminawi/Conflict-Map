// The icons that came inside KMZ files (table map_icons).
import type { Pool, PoolClient } from 'pg';
import { db } from '../config/db';

// db (one query) or a transaction's client: the import saves its icons inside its transaction
type Queryable = Pool | PoolClient;

// Saves a picture and returns its id. The same picture (same hash) is saved only once:
// ON CONFLICT … DO UPDATE changes nothing, but makes RETURNING give the id of the existing row too.
export async function save(conn: Queryable, hash: string, contentType: string, data: Buffer): Promise<number> {
  const { rows } = await conn.query<{ id: number }>(
    `INSERT INTO map_icons (hash, content_type, data) VALUES ($1, $2, $3)
     ON CONFLICT (hash) DO UPDATE SET hash = EXCLUDED.hash
     RETURNING id`,
    [hash, contentType, data],
  );
  return rows[0].id;
}

// One picture, or null. data comes back as a Buffer (bytea).
export async function findById(id: number): Promise<{ content_type: string; data: Buffer } | null> {
  const { rows } = await db.query<{ content_type: string; data: Buffer }>(
    'SELECT content_type, data FROM map_icons WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

// Every saved icon, newest first (only the ids: the pictures load from /api/icons/:id)
export async function findAllIds(): Promise<number[]> {
  const { rows } = await db.query<{ id: number }>('SELECT id FROM map_icons ORDER BY id DESC');
  return rows.map((r) => r.id);
}

export async function exists(id: number): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM map_icons WHERE id = $1', [id]);
  return rows.length > 0;
}