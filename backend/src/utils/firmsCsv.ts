// Reads the CSV that NASA FIRMS sends back. One line per hot spot, the first line has the column names:
// latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight
import type { Hotspot } from '../types/seaFires.types';

export function readFirmsCsv(csv: string, source: string): Hotspot[] {
  const lines = csv.trim().split('\n');
  const header = lines[0].split(',').map((name) => name.trim());

  // Not a CSV (e.g. "Invalid MAP_KEY."): stop with FIRMS's own message, so the log says what's wrong
  if (!header.includes('latitude')) throw new Error(`FIRMS answered: ${lines[0].slice(0, 200)}`);

  const col = (name: string) => header.indexOf(name); // where each column is
  const hotspots: Hotspot[] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(','); // FIRMS values never contain commas
    const lat = Number(cells[col('latitude')]);
    const lng = Number(cells[col('longitude')]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    // Low confidence = often sun glint on the water, not a fire
    const confidence = (cells[col('confidence')] ?? '').trim().toLowerCase().charAt(0); // 'l' / 'n' / 'h'
    if (confidence === 'l') continue;

    // Date "2026-11-22" + time "0145" (UTC, sometimes written "145") → one Date
    const time = (cells[col('acq_time')] ?? '').trim().padStart(4, '0');
    const detectedAt = new Date(`${cells[col('acq_date')]}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`);
    if (isNaN(detectedAt.getTime())) continue;

    const frp = Number(cells[col('frp')]);
    hotspots.push({ lat, lng, detectedAt, satellite: source, frp: Number.isFinite(frp) ? frp : null, confidence });
  }
  return hotspots;
}