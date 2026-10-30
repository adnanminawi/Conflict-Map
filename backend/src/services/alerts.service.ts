import * as alertsRepository from '../repositories/alerts.repository';
import type { AlertsResponse, MapAlert } from '../types/alerts.types';
import { parseAlertMessage, type AlertType } from '../utils/alertParser';

// ---------- Place names → ids ----------

// "Нахаль Оз" → 234. Russian and Hebrew names. Loaded from the database once.
let areaIdByName: Map<string, number> | null = null;
let typeIds: Record<string, number> = {}; // { rockets: 1, drone: 2, other: 3 }

async function loadNames() {
  if (areaIdByName) return; // already loaded

  areaIdByName = new Map();
  for (const area of await alertsRepository.findAreaNames()) {
    if (area.name_ru) areaIdByName.set(area.name_ru, area.id);
    areaIdByName.set(area.name_he, area.id);
  }
  typeIds = await alertsRepository.findTypeIds();
}

const isKnown = (name: string) => areaIdByName!.has(name);

// ---------- Saving messages ----------

// Long alerts are split over several messages. A message without a title or time
// continues the previous one, so we remember the last type and time.
let lastType: AlertType = 'other';
let lastTime: Date | null = null;

// Called for every new message of the Telegram channel. Returns how many alerts were saved.
export async function saveAlertMessage(messageId: number, text: string, messageDate: Date): Promise<number> {
  await loadNames();
  const parsed = parseAlertMessage(text, isKnown);
  if (parsed.type) lastType = parsed.type;

  let saved = 0;
  for (const [i, block] of parsed.blocks.entries()) {
    if (block.time) lastTime = block.time;

    // Names → ids. Unknown names are logged (they stay in raw_text, to fix later)
    const areaIds = new Set<number>(); // Set: a place listed twice is kept once
    for (const place of block.places) {
      const id = areaIdByName!.get(place);
      if (id) areaIds.add(id);
      else console.warn(`Unknown alert place: "${place}" (message ${messageId})`);
    }
    if (areaIds.size === 0) continue;

    const isNew = await alertsRepository.insert(
      {
        externalId: `tg:${messageId}:${i}`, // message id + block number → never saved twice
        type: lastType,
        startedAt: lastTime ?? messageDate,
        rawText: block.lines.join('\n'),
        areaIds: [...areaIds],
      },
      typeIds[lastType],
    );
    if (isNew) saved++;
  }
  return saved;
}

// ---------- For the map ----------

// Alerts of the last `minutes`, and the places they covered (each place once)
export async function getRecentAlerts(minutes: number): Promise<AlertsResponse> {
  const since = new Date(Date.now() - minutes * 60 * 1000);
  const rows = await alertsRepository.findSince(since); // one row per (alert, place)

  // Group the rows: one alert with a list of its place ids
  const alerts = new Map<number, MapAlert>();
  for (const row of rows) {
    let alert = alerts.get(row.id);
    if (!alert) {
      alert = { id: row.id, type: row.type as AlertType, type_name: row.type_name, started_at: row.started_at, area_ids: [] };
      alerts.set(row.id, alert);
    }
    alert.area_ids.push(row.area_id);
  }

  const areaIds = [...new Set(rows.map((r) => r.area_id))]; // each place once
  const areas = await alertsRepository.findAreasByIds(areaIds);
  return { alerts: [...alerts.values()], areas };
}