// Copies all the data from the old MySQL database into the new Postgres + PostGIS one. Run it ONCE.
//   npm run copy:mysql-to-postgres
//
// Reads from MySQL with the MYSQL_* settings in .env, writes to Postgres with the DB_* settings (the app's database).
// Safety:
//   - stops if the Postgres tables already hold data (so it can't copy twice)
//   - one transaction: if anything fails, nothing is saved in Postgres
//   - MySQL is only read, never changed
import 'dotenv/config';
import mysql from 'mysql2/promise';
import { db } from '../src/config/db';

interface TableCopy {
  table: string;
  select: string; // the MySQL query. Tables with a point: lng and lat come last.
  columns: string[]; // the Postgres columns, in the same order (geom last for tables with a point)
  point?: boolean; // the last two values (lng, lat) become one PostGIS point
  identity?: boolean; // has an auto id: its counter must continue after the copied ids
}

// In this order, so every row a table links to is already copied (countries before sides…)
const TABLES: TableCopy[] = [
  { table: 'countries', select: 'SELECT code, name_en, name_ar FROM countries', columns: ['code', 'name_en', 'name_ar'] },
  { table: 'admins', select: 'SELECT id, username, password_hash FROM admins', columns: ['id', 'username', 'password_hash'], identity: true },
  { table: 'sides', select: 'SELECT id, country_code, name, color FROM sides', columns: ['id', 'country_code', 'name', 'color'], identity: true },
  { table: 'weapon_types', select: 'SELECT id, code, name FROM weapon_types', columns: ['id', 'code', 'name'], identity: true },
  {
    table: 'weapons',
    select: 'SELECT id, weapon_type_id, country_code, side_id, name, range_km, source, description FROM weapons',
    columns: ['id', 'weapon_type_id', 'country_code', 'side_id', 'name', 'range_km', 'source', 'description'],
    identity: true,
  },
  { table: 'location_types', select: 'SELECT id, code, name, icon FROM location_types', columns: ['id', 'code', 'name', 'icon'], identity: true },
  {
    table: 'locations',
    select: `SELECT id, location_type_id, weapon_id, name, country_code, description,
                    ST_Longitude(geom) AS lng, ST_Latitude(geom) AS lat
               FROM locations`,
    columns: ['id', 'location_type_id', 'weapon_id', 'name', 'country_code', 'description', 'geom'],
    point: true,
    identity: true,
  },
  { table: 'event_types', select: 'SELECT id, code, name, icon, color FROM event_types', columns: ['id', 'code', 'name', 'icon', 'color'], identity: true },
  {
    table: 'events',
    select: `SELECT id, event_type_id, title, description, occurred_at, location_id, country_code, status,
                    created_by, created_at, updated_at, ST_Longitude(geom) AS lng, ST_Latitude(geom) AS lat
               FROM events`,
    columns: [
      'id', 'event_type_id', 'title', 'description', 'occurred_at', 'location_id', 'country_code', 'status',
      'created_by', 'created_at', 'updated_at', 'geom',
    ],
    point: true,
    identity: true,
  },
  {
    table: 'news',
    select: `SELECT id, title, summary, url, source_name, lang, published_at, status, created_by, created_at, updated_at FROM news`,
    columns: ['id', 'title', 'summary', 'url', 'source_name', 'lang', 'published_at', 'status', 'created_by', 'created_at', 'updated_at'],
    identity: true,
  },
  { table: 'event_news', select: 'SELECT event_id, news_id FROM event_news', columns: ['event_id', 'news_id'] },
  {
    table: 'map_layers',
    // The date as text, so it can't shift by a day because of timezones
    select: `SELECT id, side_id, name, DATE_FORMAT(snapshot_date, '%Y-%m-%d') AS snapshot_date, geojson, created_by FROM map_layers`,
    columns: ['id', 'side_id', 'name', 'snapshot_date', 'geojson', 'created_by'],
    identity: true,
  },
  { table: 'alert_types', select: 'SELECT id, code, name FROM alert_types', columns: ['id', 'code', 'name'], identity: true },
  {
    table: 'alert_areas',
    select: 'SELECT id, name_he, name_en, name_ru, name_ar, lat, lng, polygon FROM alert_areas',
    columns: ['id', 'name_he', 'name_en', 'name_ru', 'name_ar', 'lat', 'lng', 'polygon'],
  },
  {
    table: 'alerts',
    select: 'SELECT id, external_id, alert_type_id, started_at, raw_text FROM alerts',
    columns: ['id', 'external_id', 'alert_type_id', 'started_at', 'raw_text'],
    identity: true,
  },
  { table: 'alert_area_links', select: 'SELECT alert_id, alert_area_id FROM alert_area_links', columns: ['alert_id', 'alert_area_id'] },
];

const BATCH = 500; // rows per INSERT: much faster than one by one over the internet

// JSON columns (geojson, polygon) arrive from MySQL as objects: send them to Postgres as JSON text
function toPostgres(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) return JSON.stringify(value);
  return value;
}

async function main() {
  const source = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DB,
    timezone: 'Z', // dates are UTC
    ssl: process.env.MYSQL_SSL_CA ? { ca: process.env.MYSQL_SSL_CA } : undefined,
  });
  // MySQL caches table info for a day: without this, AUTO_INCREMENT below can be out of date
  await source.query('SET SESSION information_schema_stats_expiry = 0');
  const target = await db.connect(); // one connection, for the transaction

  try {
    // Already copied? Stop, so nothing is copied twice.
    for (const t of TABLES) {
      const { rows } = await target.query(`SELECT 1 FROM ${t.table} LIMIT 1`);
      if (rows.length > 0) throw new Error(`Postgres table "${t.table}" is not empty. Copy only into a new, empty database.`);
    }

    await target.query('BEGIN');
    for (const t of TABLES) {
      const [rows] = await source.query<mysql.RowDataPacket[]>(t.select);

      for (let start = 0; start < rows.length; start += BATCH) {
        const batch = rows.slice(start, start + BATCH);
        const values: unknown[] = [];
        // One "(…)" per row: ($1, $2, …), ($9, $10, …). A point takes 2 values: ST_MakePoint(lng, lat).
        const groups = batch.map((row) => {
          const cells = Object.values(row).map(toPostgres);
          const marks: string[] = [];
          const plain = t.point ? cells.slice(0, -2) : cells;
          for (const cell of plain) {
            values.push(cell);
            marks.push(`$${values.length}`);
          }
          if (t.point) {
            values.push(cells[cells.length - 2], cells[cells.length - 1]);
            marks.push(`ST_SetSRID(ST_MakePoint($${values.length - 1}, $${values.length}), 4326)`);
          }
          return `(${marks.join(', ')})`;
        });
        await target.query(`INSERT INTO ${t.table} (${t.columns.join(', ')}) VALUES ${groups.join(', ')}`, values);
      }

      // The copied rows kept their ids: new rows continue where MySQL stopped (its AUTO_INCREMENT),
      // so an id that was deleted in MySQL is never used again for something else
      if (t.identity) {
        const [[info]] = await source.query<mysql.RowDataPacket[]>(
          'SELECT AUTO_INCREMENT AS next FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
          [t.table],
        );
        const last = Math.max(Number(info?.next ?? 1) - 1, ...rows.map((r) => Number(r.id)), 0);
        if (last > 0) await target.query(`SELECT setval(pg_get_serial_sequence('${t.table}', 'id'), $1)`, [last]);
      }
      console.log(`${t.table.padEnd(18)} ${rows.length} rows`);
    }
    await target.query('COMMIT');

    // Check: the same number of rows on both sides
    let ok = true;
    for (const t of TABLES) {
      const [[a]] = await source.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${t.table}`);
      const { rows } = await target.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.table}`);
      if (Number(a.n) !== rows[0].n) {
        ok = false;
        console.log(`MISMATCH ${t.table}: MySQL ${a.n}, Postgres ${rows[0].n}`);
      }
    }
    console.log(ok ? 'Done: every table has the same number of rows.' : 'Done, but some counts differ (see above).');
  } catch (err) {
    await target.query('ROLLBACK'); // nothing half-copied stays in Postgres
    throw err;
  } finally {
    target.release();
    await source.end();
  }
}

main()
  .catch((err) => {
    console.error('Copy failed, nothing was saved in Postgres:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
