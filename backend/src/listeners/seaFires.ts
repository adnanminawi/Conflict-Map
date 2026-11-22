// Every 30 minutes: asks NASA FIRMS for the hot spots seen by satellite in our seas (Hormuz, Red Sea),
// and adds the new fires at sea as events on the map. Started from server.ts.
// Needs FIRMS_MAP_KEY in .env (free: https://firms.modaps.eosdis.nasa.gov/api/map_key/). Without it, it stays off.
import { CHECK_EVERY_MINUTES, DAYS_TO_READ, FIRMS_SOURCES, FIRST_RUN_DAYS, SEA_AREAS } from '../config/seaFires';
import * as seaFiresRepository from '../repositories/seaFires.repository';
import * as seaFiresService from '../services/seaFires.service';
import { readFirmsCsv } from '../utils/firmsCsv';
import type { Hotspot } from '../types/seaFires.types';

const FIRMS_API = 'https://firms.modaps.eosdis.nasa.gov/api/area/csv';

let running = false; // stops a new check starting while the last one is still going

// One FIRMS request: one satellite, one sea, the last `days` days
async function fetchHotspots(key: string, source: string, box: number[], days: number): Promise<Hotspot[]> {
  const res = await fetch(`${FIRMS_API}/${key}/${source}/${box.join(',')}/${days}`, {
    signal: AbortSignal.timeout(30_000), // a slow answer gives up after 30 s instead of hanging
  });
  // FIRMS explains what's wrong in the answer's text (bad key, too many days…): show it in the log.
  // The key is removed from that text, so it never ends up in a log file.
  if (!res.ok) {
    const why = (await res.text()).replaceAll(key, '<key>').slice(0, 200).trim();
    throw new Error(`HTTP ${res.status}: ${why}`);
  }
  return readFirmsCsv(await res.text(), source);
}

async function checkSeas(key: string) {
  if (running) return;
  running = true;
  try {
    // The very first run only learns where the gas platforms are (5 days of heat), and makes no events
    const learnOnly = await seaFiresRepository.isEmpty();
    const days = learnOnly ? FIRST_RUN_DAYS : DAYS_TO_READ;

    for (const area of SEA_AREAS) {
      // All three satellites together, so the service can put them in time order
      const hotspots: Hotspot[] = [];
      for (const source of FIRMS_SOURCES) {
        try {
          hotspots.push(...(await fetchHotspots(key, source, area.box, days)));
        } catch (err: any) {
          console.error(`Sea fires: could not read ${source} for ${area.name}:`, err.message);
        }
      }
      const made = await seaFiresService.saveHotspots(hotspots, learnOnly);
      if (learnOnly && hotspots.length === 0) console.log(`Sea fires: nothing learned for ${area.name} yet, trying again next check`);
      else if (learnOnly) console.log(`Sea fires: learned ${area.name} (${hotspots.length} hot spots, no events on the first run)`);
      else if (made > 0) console.log(`Sea fires: ${made} new fire(s) at sea in ${area.name}`);
    }
  } catch (err: any) {
    console.error('Sea fires: check failed:', err.message);
  } finally {
    running = false;
  }
}

export function startSeaFires() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) {
    console.log('Sea fires: off (no FIRMS_MAP_KEY in .env)');
    return;
  }
  console.log(`Sea fires: checking ${SEA_AREAS.map((a) => a.name).join(' and ')} every ${CHECK_EVERY_MINUTES} min`);
  checkSeas(key); // once now, so you don't wait 30 minutes after a restart
  setInterval(() => checkSeas(key), CHECK_EVERY_MINUTES * 60 * 1000);
}