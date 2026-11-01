// What the visitor can show / hide on the map, and the country tabs.
import type { Feature, Geometry, Position } from 'geojson'
import type { AlertType, MapEvent, MapLayer, MapLocation } from '../types'

// ---------- Show / hide ----------

export type Category = 'rockets' | 'drones' | 'events' | 'frontlines' | 'airport' | 'military_base' | 'naval_base' | 'fighting' | 'explosion'

export type Visible = Record<Category, boolean>

export function keepShape(feature: Feature, visible: Visible): boolean {
  const icon = feature.properties?.icon
  if (icon === 'fighting') return visible.fighting
  if (icon === 'explosion') return visible.explosion
  return visible.frontlines
}

// Everything is shown when the page opens
export const ALL_VISIBLE: Visible = {
  rockets: true,
  drones: true,
  events: true,
  frontlines: true,
  airport: true,
  military_base: true,
  naval_base: true,
  fighting: true,
  explosion : true,
}

// Which siren types each switch controls ('other' goes with rockets)
export function visibleAlertTypes(visible: Visible): AlertType[] {
  const types: AlertType[] = []
  if (visible.rockets) types.push('rockets', 'other')
  if (visible.drones) types.push('drone')
  return types
}

// ---------- Countries ----------

export const ALL = 'ALL' // the "All" tab

// Siren alerts come from the Israeli list, so they belong to this tab
export const ALERTS_COUNTRY = 'IL'

// "YE" → "Yemen" (built into the browser, no list to maintain)
const names = new Intl.DisplayNames(['en'], { type: 'region' })
export function countryName(code: string): string {
  try {
    return names.of(code) ?? code
  } catch {
    return code // not a real country code
  }
}

// The tabs: every country that has bases, events or frontlines, plus Israel for the alerts. Sorted by name.
export function findCountries(locations: MapLocation[], events: MapEvent[], layers: MapLayer[]): string[] {
  const codes = new Set<string>([ALERTS_COUNTRY])
  for (const item of [...locations, ...events, ...layers]) {
    if (item.country_code) codes.add(item.country_code)
  }
  return [...codes].sort((a, b) => countryName(a).localeCompare(countryName(b)))
}

// True if this item belongs to the selected tab
export function inCountry(itemCountry: string | null, selected: string): boolean {
  return selected === ALL || itemCountry === selected
}

// ---------- Zoom to a country ----------

// Calls fn for every [lng, lat] of a shape
function eachPosition(geometry: Geometry, fn: (p: Position) => void) {
  if (geometry.type === 'Point') fn(geometry.coordinates)
  else if (geometry.type === 'LineString') geometry.coordinates.forEach(fn)
  else if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') geometry.coordinates.flat().forEach(fn)
  else if (geometry.type === 'MultiPolygon') geometry.coordinates.flat(2).forEach(fn)
}

// Israel's box, for when there is no other data there (the alerts can come and go)
const ISRAEL_BOX: [number, number, number, number] = [34.2, 29.45, 35.9, 33.35]

// The box [west, south, east, north] around everything of this country. null = nothing to zoom to.
export function countryBox(
  country: string,
  locations: MapLocation[],
  events: MapEvent[],
  layers: MapLayer[],
): [number, number, number, number] | null {
  let box: [number, number, number, number] | null = country === ALERTS_COUNTRY ? [...ISRAEL_BOX] : null
  const add = ([lng, lat]: Position) => {
    if (!box) box = [lng, lat, lng, lat]
    else box = [Math.min(box[0], lng), Math.min(box[1], lat), Math.max(box[2], lng), Math.max(box[3], lat)]
  }

  locations.filter((l) => l.country_code === country).forEach((l) => add([l.lng, l.lat]))
  events.filter((e) => e.country_code === country).forEach((e) => add([e.lng, e.lat]))
  layers
    .filter((l) => l.country_code === country)
    .forEach((l) => l.geojson.features.forEach((f) => eachPosition(f.geometry, add)))

  return box
}