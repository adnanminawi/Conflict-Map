// Range rings of the weapons a visitor places on the map: a thin ring at the real range in km,
// a light fill, the launch point and two labels (name at the point, km on the ring).
// When a weapon is placed its ring grows out from the launch point once, so you see where it came from.
// Nothing is saved: the placed weapons live in MapPage's state and are gone after a refresh.
import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Position } from 'geojson'
import type { Weapon } from '../types'
import { buildPopup } from './popup'

// One weapon placed by the visitor
export interface PlacedWeapon {
  id: number // a local number, only to tell placed weapons apart
  weapon: Weapon
  center: [number, number] // [lng, lat]
}

export const DEFAULT_RANGE_COLOR = '#9fb3c8' // for weapons with no side (no side color)
const EARTH_RADIUS_KM = 6371
const GROW_MS = 650 // how long the ring takes to grow when placed

const colorOf = (w: Weapon) => w.side_color ?? DEFAULT_RANGE_COLOR

// The point `km` away from `center` in direction `bearing` (degrees clockwise from north). Also used by defenceLayer.ts.
// following the Earth's curve. That's why a 1,000 km ring looks taller far from the equator: it is correct.
export function destination([lng, lat]: [number, number], km: number, bearing: number): Position {
  const toRad = Math.PI / 180
  const d = km / EARTH_RADIUS_KM
  const b = bearing * toRad
  const lat1 = lat * toRad
  const lng1 = lng * toRad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lng2 / toRad, lat2 / toRad]
}

// Points of a circle of `km` around `center` (the first point repeated at the end, as GeoJSON wants).
// Also used by defenceLayer.ts for the air defence coverage.
export function circle(center: [number, number], km: number, steps = 128): Position[] {
  const points: Position[] = []
  for (let i = 0; i <= steps; i++) points.push(destination(center, km, (i / steps) * 360))
  return points
}

// The box around a range ring: [[west, south], [east, north]], for zooming the map to it
export function rangeBounds(center: [number, number], km: number): [[number, number], [number, number]] {
  const [, north] = destination(center, km, 0)
  const [east] = destination(center, km, 90)
  const [, south] = destination(center, km, 180)
  const [west] = destination(center, km, 270)
  return [
    [west, south],
    [east, north],
  ]
}

// ---------- Setup (once, after the map has loaded) ----------

export function setupWeaponLayers(map: maplibregl.Map) {
  const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
  map.addSource('weapon-ranges', { type: 'geojson', data: empty })

  const color = ['get', 'color'] as any
  const kind = (k: string) => ['==', ['get', 'kind'], k] as any

  // The area in reach: a very light fill and a thin, solid ring
  map.addLayer({ id: 'weapon-fill', type: 'fill', source: 'weapon-ranges', filter: kind('area'), paint: { 'fill-color': color, 'fill-opacity': 0.08 } })
  map.addLayer({
    id: 'weapon-edge',
    type: 'line',
    source: 'weapon-ranges',
    filter: kind('area'),
    paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.95 },
  })

  // The launch point: a dark dot with a ring in the side's color
  map.addLayer({
    id: 'weapon-center',
    type: 'circle',
    source: 'weapon-ranges',
    filter: kind('center'),
    paint: { 'circle-radius': 5, 'circle-color': '#0e1217', 'circle-stroke-color': color, 'circle-stroke-width': 2.5 },
  })

  // Name under the launch point, range just above the top of the ring
  const textPaint = { 'text-color': '#e6e9ee', 'text-halo-color': 'rgba(14, 18, 23, 0.9)', 'text-halo-width': 1.5 }
  map.addLayer({
    id: 'weapon-name',
    type: 'symbol',
    source: 'weapon-ranges',
    filter: kind('center'),
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
    paint: textPaint,
  })
  map.addLayer({
    id: 'weapon-km',
    type: 'symbol',
    source: 'weapon-ranges',
    filter: kind('km'),
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-anchor': 'bottom',
      'text-offset': [0, -0.3],
      'text-allow-overlap': true,
    },
    paint: textPaint,
  })

  // Click the launch point → what it is, how far it reaches, who has it, where the number comes from
  map.on('click', 'weapon-center', (e) => {
    const p = e.features?.[0]?.properties
    if (!p) return
    new maplibregl.Popup({ offset: 10 })
      .setLngLat(e.lngLat)
      .setDOMContent(
        buildPopup(p.name, p.type_name, [
          `Reaches about ${Number(p.range_km).toLocaleString()} km`,
          p.owner,
          p.source ? `Source: ${p.source}` : 'No source given for this range',
          'Ranges are public estimates and can be wrong.',
        ]),
      )
      .addTo(map)
  })
  map.on('mouseenter', 'weapon-center', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'weapon-center', () => (map.getCanvas().style.cursor = ''))
}

// ---------- Drawing ----------

// Puts the rings on the map. `growing` = one weapon drawn at a part of its range (0 → 1) while it grows.
function draw(map: maplibregl.Map, placed: PlacedWeapon[], growing?: { id: number; part: number }) {
  const features: Feature[] = []
  for (const { id, weapon: w, center } of placed) {
    const color = colorOf(w)
    const km = growing?.id === id ? w.range_km * growing.part : w.range_km
    const owner = w.side_name ? `${w.side_name}, ${w.country_name}` : w.country_name

    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle(center, Math.max(km, 0.5))] }, properties: { kind: 'area', color } })
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: destination(center, km, 0) }, // top of the ring
      properties: { kind: 'km', color, label: `${w.range_km.toLocaleString()} km` },
    })
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: center },
      properties: { kind: 'center', color, name: w.name, type_name: w.type_name, range_km: w.range_km, owner, source: w.source },
    })
  }
  map.getSource<maplibregl.GeoJSONSource>('weapon-ranges')?.setData({ type: 'FeatureCollection', features })
}

// Shows the placed weapons. If `newId` is given, that weapon's ring grows out from its launch point first.
// Returns a function that stops the growing (used when the list changes before it's done).
export function showWeapons(map: maplibregl.Map, placed: PlacedWeapon[], newId?: number): () => void {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (newId === undefined || reducedMotion) {
    draw(map, placed)
    return () => {}
  }

  let frame = 0
  let start = 0
  function step(now: number) {
    if (!start) start = now
    const t = Math.min((now - start) / GROW_MS, 1)
    const part = 1 - Math.pow(1 - t, 3) // fast at first, then slows down as it reaches the range
    draw(map, placed, { id: newId!, part })
    if (t < 1) frame = requestAnimationFrame(step)
  }
  const begin = () => (frame = requestAnimationFrame(step))

  // Grow only once the map has stopped moving (it zooms out to fit the ring first).
  // Growing during the zoom makes the ring flicker, because the map redraws its tiles at different moments.
  draw(map, placed, { id: newId, part: 0 })
  if (map.isMoving()) map.once('moveend', begin)
  else begin()

  return () => {
    map.off('moveend', begin)
    cancelAnimationFrame(frame)
    draw(map, placed) // stopped early → draw everything at full size
  }
}