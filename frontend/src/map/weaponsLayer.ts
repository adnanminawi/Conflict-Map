// Range circles of the weapons a visitor places on the map, drawn like a radar:
// a circle of the real range in km, rings at 25 / 50 / 75 %, and a turning sweep.
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

const RADAR_GREEN = '#22c55e' // used when the weapon has no side color
const EARTH_RADIUS_KM = 6371
const SWEEP_SECONDS = 4 // one full turn of the sweep
const RINGS = [0.25, 0.5, 0.75] // inner rings, as a part of the range

const colorOf = (w: Weapon) => w.side_color ?? RADAR_GREEN

// The point `km` away from `center` in direction `bearing` (degrees clockwise from north),
// following the Earth's curve. That's why a 1,000 km circle looks taller far from the equator: it is correct.
function destination([lng, lat]: [number, number], km: number, bearing: number): Position {
  const toRad = Math.PI / 180
  const d = km / EARTH_RADIUS_KM
  const b = bearing * toRad
  const lat1 = lat * toRad
  const lng1 = lng * toRad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b))
  const lng2 = lng1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lng2 / toRad, lat2 / toRad]
}

// Points of a circle of `km` around `center` (the first point repeated at the end, as GeoJSON wants)
function circle(center: [number, number], km: number, steps = 128): Position[] {
  const points: Position[] = []
  for (let i = 0; i <= steps; i++) points.push(destination(center, km, (i / steps) * 360))
  return points
}

// A pie slice from bearing `from` to `to`
function slice(center: [number, number], km: number, from: number, to: number): Position[] {
  const points: Position[] = [center]
  for (let a = from; a <= to; a += 2) points.push(destination(center, km, a))
  points.push(center)
  return points
}

// The box around a range circle: [[west, south], [east, north]], for zooming the map to it
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
  map.addSource('weapon-sweep', { type: 'geojson', data: empty })

  const color = ['get', 'color'] as any
  const kind = (k: string) => ['==', ['get', 'kind'], k] as any

  // The area in range: a light fill + a strong edge + thin inner rings
  map.addLayer({ id: 'weapon-fill', type: 'fill', source: 'weapon-ranges', filter: kind('area'), paint: { 'fill-color': color, 'fill-opacity': 0.07 } })
  map.addLayer({
    id: 'weapon-rings',
    type: 'line',
    source: 'weapon-ranges',
    filter: kind('ring'),
    paint: { 'line-color': color, 'line-opacity': 0.45, 'line-width': 1, 'line-dasharray': [2, 2] },
  })
  map.addLayer({ id: 'weapon-edge', type: 'line', source: 'weapon-ranges', filter: kind('area'), paint: { 'line-color': color, 'line-width': 2 } })

  // The sweep: a bright slice with a fading tail, and the line in front
  map.addLayer({
    id: 'weapon-sweep-fill',
    type: 'fill',
    source: 'weapon-sweep',
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': color, 'fill-opacity': ['get', 'opacity'] },
  })
  map.addLayer({
    id: 'weapon-sweep-line',
    type: 'line',
    source: 'weapon-sweep',
    filter: ['==', ['geometry-type'], 'LineString'],
    paint: { 'line-color': color, 'line-width': 2, 'line-opacity': 0.9 },
  })

  // The launch point + its name, and the km of each ring
  map.addLayer({
    id: 'weapon-center',
    type: 'circle',
    source: 'weapon-ranges',
    filter: kind('center'),
    paint: { 'circle-radius': 6, 'circle-color': color, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
  })
  map.addLayer({
    id: 'weapon-labels',
    type: 'symbol',
    source: 'weapon-ranges',
    filter: ['in', ['get', 'kind'], ['literal', ['center', 'ring-label']]],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['case', kind('center'), 12, 10],
      'text-offset': ['case', kind('center'), ['literal', [0, 1.4]], ['literal', [0, -0.6]]],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0, 0, 0, 0.8)', 'text-halo-width': 1.5 },
  })

  // Click the launch point → name, type, range, who has it, source
  map.on('click', 'weapon-center', (e) => {
    const p = e.features?.[0]?.properties
    if (!p) return
    new maplibregl.Popup({ offset: 10 })
      .setLngLat(e.lngLat)
      .setDOMContent(buildPopup(p.name, p.type_name, [`Range ≈ ${Number(p.range_km).toLocaleString()} km`, p.owner, p.source ? `Source: ${p.source}` : 'Source not given', 'Range estimates are approximate.']))
      .addTo(map)
  })
  map.on('mouseenter', 'weapon-center', () => (map.getCanvas().style.cursor = 'pointer'))
  map.on('mouseleave', 'weapon-center', () => (map.getCanvas().style.cursor = ''))
}

// ---------- Drawing ----------

// The circles, rings and labels of the placed weapons (they don't move, so they are drawn once per change)
export function showWeapons(map: maplibregl.Map, placed: PlacedWeapon[]) {
  const features: Feature[] = []
  for (const { weapon: w, center } of placed) {
    const color = colorOf(w)
    const km = w.range_km
    const owner = w.side_name ? `${w.side_name} · ${w.country_name}` : w.country_name

    features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [circle(center, km)] }, properties: { kind: 'area', color } })
    for (const part of RINGS) {
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: circle(center, km * part) }, properties: { kind: 'ring', color } })
    }
    for (const part of [...RINGS, 1]) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: destination(center, km * part, 0) }, // on the north side
        properties: { kind: 'ring-label', label: `${Math.round(km * part).toLocaleString()} km` },
      })
    }
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: center },
      properties: { kind: 'center', color, label: w.name, name: w.name, type_name: w.type_name, range_km: km, owner, source: w.source },
    })
  }
  map.getSource<maplibregl.GeoJSONSource>('weapon-ranges')?.setData({ type: 'FeatureCollection', features })
}

// The turning sweep. Returns a function that stops it.
// It redraws about 30 times a second, and only while weapons are placed.
export function startSweep(map: maplibregl.Map, placed: PlacedWeapon[]): () => void {
  const source = map.getSource<maplibregl.GeoJSONSource>('weapon-sweep')
  if (!source || placed.length === 0) {
    source?.setData({ type: 'FeatureCollection', features: [] })
    return () => {}
  }

  let frame = 0
  let last = 0
  function draw(time: number) {
    frame = requestAnimationFrame(draw)
    if (time - last < 33) return // ~30 frames per second is smooth enough and saves battery
    last = time

    const angle = ((time / 1000 / SWEEP_SECONDS) * 360) % 360
    const features: Feature[] = []
    for (const { weapon: w, center } of placed) {
      const color = colorOf(w)
      const km = w.range_km
      // Bright slice right behind the line, then two fainter ones: a fading tail
      for (const [from, to, opacity] of [
        [angle - 12, angle, 0.32],
        [angle - 28, angle - 12, 0.16],
        [angle - 50, angle - 28, 0.06],
      ]) {
        features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [slice(center, km, from, to)] }, properties: { color, opacity } })
      }
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [center, destination(center, km, angle)] }, properties: { color } })
    }
    source!.setData({ type: 'FeatureCollection', features })
  }
  frame = requestAnimationFrame(draw)

  return () => {
    cancelAnimationFrame(frame)
    source.setData({ type: 'FeatureCollection', features: [] })
  }
}