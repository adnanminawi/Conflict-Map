// Settings of the satellite fire check at sea (NASA FIRMS). Read by src/listeners/seaFires.ts.
// FIRMS: https://firms.modaps.eosdis.nasa.gov — free. Get a MAP_KEY there and put it in .env as FIRMS_MAP_KEY.

export interface SeaArea {
  name: string; // for the logs
  box: [west: number, south: number, east: number, north: number]; // FIRMS wants this order
}

// The seas we watch. A box also covers land: land fires are dropped by the "at sea" check.
export const SEA_AREAS: SeaArea[] = [
  // The strait, the east of the Gulf (UAE, Iran's islands) and the Gulf of Oman
  { name: 'Strait of Hormuz', box: [54.0, 24.0, 58.8, 27.5] },
  // The whole Red Sea, from Suez down to Bab el-Mandeb
  { name: 'Red Sea', box: [32.3, 11.8, 44.5, 30.0] },
];

// The three VIIRS satellites: they see a fire as small as a ship's (375 m pixels), each passes twice a day.
// (MODIS is left out: 1 km pixels, it misses small fires.)
export const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'];

export const CHECK_EVERY_MINUTES = 30; // FIRMS adds a pass about 3 hours after the satellite flies over
export const DAYS_TO_READ = 2; // each check reads the last 2 days: a pass missed while the server was down is caught later
export const FIRST_RUN_DAYS = 5; // first run ever: 5 days (the most FIRMS allows) only to learn where the platforms are (no events made)

export const MIN_KM_FROM_LAND = 2; // closer to the coast = a port, refinery or land fire, not a ship
export const SAME_PLACE_KM = 3; // heat this close to earlier heat = the same fire or a platform
export const SAME_PLACE_DAYS = 7; // ...if the earlier heat is from the last 7 days
export const NEAREST_COUNTRY_KM = 200; // the event goes in the tab of the closest country, if one is this close