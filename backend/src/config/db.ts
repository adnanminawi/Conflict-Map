import { Pool, types } from 'pg';

// Postgres sends bigint (ids of events, news, alerts, and COUNT results) as text, because JavaScript numbers
// can't hold every bigint. Ours are far below that limit, so turn them back into numbers, like MySQL did.
types.setTypeParser(types.builtins.INT8, (value) => Number(value));

export const db = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10, // at most 10 connections at the same time
  options: '-c TimeZone=UTC', // every connection works in UTC, so dates are read and written the same everywhere
  // Online databases (e.g. Aiven) need an encrypted connection. Their CA certificate goes in DB_SSL_CA.
  // Empty on your computer → no SSL, like before.
  ssl: process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : undefined,
});

export async function checkDbConnection(): Promise<void> {
  await db.query('SELECT 1');
}

// Postgres error codes we react to (MySQL had ER_DUP_ENTRY / ER_NO_REFERENCED_ROW_2)
export const UNIQUE_VIOLATION = '23505'; // a UNIQUE value already exists
export const FOREIGN_KEY_VIOLATION = '23503'; // a linked id doesn't exist
