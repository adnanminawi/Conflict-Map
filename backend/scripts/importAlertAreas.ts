// Loads Pikud HaOref's official list of alert places (about 1,450) into the alert_areas table.
// The list comes from the pikud-haoref-api package (Apache-2.0 license): names in 4 languages,
// center point and outline of each place.
//
// Usage:  npm run import:alert-areas
// Safe to run again (e.g. after updating the package): existing places are updated, not duplicated.
import 'dotenv/config';
import { db } from '../src/config/db';
import cities from 'pikud-haoref-api/cities.json';
import polygons from 'pikud-haoref-api/polygons.json';

// The package writes outlines as [lat, lng]. Maps (GeoJSON) need [lng, lat].
function toOutline(points: number[][] | undefined): number[][] | null {
  if (!points || points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat]);
  ring.push(ring[0]); // a polygon must end where it starts
  return ring;
}

async function main() {
  const outlines = polygons as Record<string, number[][]>;
  let saved = 0;

  for (const city of cities as any[]) {
    if (city.id === 0) continue; // the first item is "Select all", not a place

    const outline = toOutline(outlines[String(city.id)]);
    await db.execute(
      `INSERT INTO alert_areas (id, name_he, name_en, name_ru, name_ar, lat, lng, polygon)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) AS new
       ON DUPLICATE KEY UPDATE
         name_he = new.name_he, name_en = new.name_en, name_ru = new.name_ru, name_ar = new.name_ar,
         lat = new.lat, lng = new.lng, polygon = new.polygon`,
      [
        city.id,
        city.name,
        city.name_en || null,
        city.name_ru || null,
        city.name_ar || null,
        city.lat,
        city.lng,
        outline ? JSON.stringify(outline) : null,
      ],
    );
    saved++;
  }

  console.log(`Saved ${saved} alert areas`);
}

main()
  .catch((err) => console.error('Import failed:', err.message))
  .finally(() => db.end());