// Fills the country_borders table (PostGIS) from the map's borders file, so the "Import map" tab
// can tell which country each pin is in. Run it once per database (local, then Aiven):
//   npm run import:borders
//   npm run import:borders -- path/to/borders.json     (another file)
// Safe to run again: it updates the borders that are already there.
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { db } from '../src/config/db';

// The same file the frontend draws the borders with: one feature per country, { code: "YE" }
const file = process.argv[2] ?? '../frontend/public/borders.json';

async function main() {
  const geojson = JSON.parse(readFileSync(file, 'utf8'));
  let saved = 0;
  let skipped = 0;

  for (const feature of geojson.features) {
    const code = String(feature.properties?.code ?? '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      skipped++;
      continue;
    }

    // ST_GeomFromGeoJSON: the shape → PostGIS. ST_MakeValid fixes small drawing errors,
    // ST_CollectionExtract(…, 3) keeps only the polygons, ST_Multi makes it always a MultiPolygon.
    // WHERE EXISTS: only countries that are in our countries table (the foreign key needs it).
    const result = await db.query(
      `INSERT INTO country_borders (code, geom)
       SELECT $1, ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326)), 3))
        WHERE EXISTS (SELECT 1 FROM countries WHERE code = $1)
       ON CONFLICT (code) DO UPDATE SET geom = EXCLUDED.geom`,
      [code, JSON.stringify(feature.geometry)],
    );
    if (result.rowCount) saved++;
    else skipped++;
  }

  console.log(`Borders saved: ${saved}. Skipped (not in the countries table): ${skipped}.`);
}

main()
  .catch((err) => {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());