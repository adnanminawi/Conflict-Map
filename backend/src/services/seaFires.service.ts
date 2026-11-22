// seaFires: decides which satellite hot spots become events on the map.
// A hot spot becomes an event only if it is
//   1. at sea (not on land or right on the coast),
//   2. new (not seen before: saved in sea_hotspots),
//   3. at a place with no heat in the past days (else it's a gas platform, or a fire we already showed).
import * as seaFiresRepository from '../repositories/seaFires.repository';
import * as eventsRepository from '../repositories/events.repository';
import { MIN_KM_FROM_LAND, NEAREST_COUNTRY_KM, SAME_PLACE_DAYS, SAME_PLACE_KM } from '../config/seaFires';
import type { Hotspot } from '../types/seaFires.types';

// "VIIRS_NOAA20_NRT" → "NOAA-20", for the event's description
const SATELLITE_NAMES: Record<string, string> = {
  VIIRS_SNPP_NRT: 'Suomi NPP',
  VIIRS_NOAA20_NRT: 'NOAA-20',
  VIIRS_NOAA21_NRT: 'NOAA-21',
};

// learnOnly = true on the very first run: save the hot spots (to learn where the platforms are) but make no events,
// or every platform in the Gulf would appear as a fire on day one.
// Returns how many events were made.
export async function saveHotspots(hotspots: Hotspot[], learnOnly: boolean): Promise<number> {
  const typeId = await seaFiresRepository.findSeaFireTypeId();
  if (!typeId) throw new Error("Event type 'sea_fire' is missing: run database/postgres/007-sea-fires.sql");

  // Oldest first: when two satellites see the same fire, the first one makes the event, the next one sees it was there
  const sorted = [...hotspots].sort((a, b) => a.detectedAt.getTime() - b.detectedAt.getTime());
  let made = 0;

  for (const h of sorted) {
    if (!(await seaFiresRepository.isAtSea(h.lng, h.lat, MIN_KM_FROM_LAND))) continue; // land: not ours

    const id = await seaFiresRepository.insertHotspot(h);
    if (id === null) continue; // already saved in an earlier check
    if (learnOnly) continue;

    if (await seaFiresRepository.hadHeatBefore(id, h, SAME_PLACE_KM, SAME_PLACE_DAYS)) continue; // platform or same fire

    // The event goes under the closest country's tab (Iran, Oman, Yemen…). Both seas are never 200 km from land.
    const country = await seaFiresRepository.nearestCountry(h.lng, h.lat, NEAREST_COUNTRY_KM);
    if (!country) continue;

    const eventId = await eventsRepository.insert(
      {
        event_type_id: typeId,
        title: 'Fire at sea, seen by satellite',
        description:
          `Heat detected by NASA FIRMS (${SATELLITE_NAMES[h.satellite] ?? h.satellite} satellite)` +
          (h.frp !== null ? `, fire power ${h.frp} MW` : '') +
          '. It can be a ship on fire after an attack, but also a new gas flare. Not checked by a person.',
        occurred_at: h.detectedAt,
        lng: h.lng,
        lat: h.lat,
        location_id: null,
        country_code: country,
        status: 'confirmed', // shown at once (the admin can mark it 'false' in the Events tab)
      },
      null, // no admin: added by the satellite check
    );
    await seaFiresRepository.setEvent(id, eventId);
    made++;
  }
  return made;
}