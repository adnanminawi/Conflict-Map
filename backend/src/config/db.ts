import mysql from 'mysql2/promise';

export const db = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
  timezone: 'Z', // read and write all DATETIME values as UTC
  waitForConnections: true,
  connectionLimit: 10,
  supportBigNumbers: true,
});

export async function checkDbConnection(): Promise<void> {
  const conn = await db.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

// Every new connection in the pool uses UTC on the server side too.
db.on('connection', (conn) => {
  conn.query("SET time_zone = '+00:00'");
});
