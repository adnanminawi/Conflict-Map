// Air defence coverage: the range of a system drawn around every site that has it,
// merged into one shape (one outline instead of dozens of overlapping circles).
// One system, or all of a country's systems together ("Show all together"). It fades in when it appears.
// Drawn like the weapons: the side's color, a very light fill, a solid edge, its name and range on the edge.
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'
import type { Weapon } from '../types'
import { circle, destination } from './weaponsLayer'

export type Coverage = Feature<Polygon | MultiPolygon>

const FADE_MS = 500
const FILL = 0.08 // the same light fill as the weapons' range

// One shape to draw: a system's merged coverage, its color, its label, and dashed for radars
export interface CoverageShape {
  coverage: Coverage
  color: string
  label: string // "Iron Dome · 70 km", written along the edge
  dashed: boolean // radars: dashed edge, no fill (the sweep shows them)
}

// Interceptors: shades of blue by range, light = short range, dark = long range.
// Blue keeps defence apart from the attack colors (red rockets, orange drones). Radars: grey.
const BLUES = ['#b9e3ff', '#6cc0f5', '#2d95e6', '#1f63d6', '#3341c9']
const RADAR_COLOR = '#b0bec5'

// The color of a system. Its range is ranked among its country's interceptors,
// so the shortest is the lightest and the longest the darkest (same range → same blue).
export function defenceColor(w: Weapon, all: Weapon[]): string {
  if (w.type_code === 'radar') return RADAR_COLOR
  const ranges = [...new Set(all.filter((d) => d.type_code !== 'radar' && d.country_code === w.country_code).map((d) => d.range_km))].sort((a, b) => a - b)
  const rank = ranges.length > 1 ? ranges.indexOf(w.range_km) / (ranges.length - 1) : 0 // 0 = shortest, 1 = longest
  return BLUES[Math.round(rank * (BLUES.length - 1))]
}

// The weapon types that belong in the Air defence box (the rest are attack weapons)
export const DEFENCE_TYPES = ['air_defence', 'radar']

export function setupDefenceLayers(map: MapLibreMap) {
  map.addSource('defence-coverage', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'defence-fill',
    type: 'fill',
    source: 'defence-coverage',
    paint: {
      'fill-color': ['get', 'color'],
      'fill-opacity': ['get', 'fill'], // 0 for radars
    },
  })
  // Interceptors: solid outline. Radars: dashed (they detect, they don't intercept).
  for (const [id, dashed] of [['defence-edge', false], ['defence-edge-dashed', true]] as const) {
    map.addLayer({
      id,
      type: 'line',
      source: 'defence-coverage',
      filter: ['==', ['get', 'dashed'], dashed],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-opacity': 1,
        'line-opacity-transition': { duration: FADE_MS },
        ...(dashed ? { 'line-dasharray': [3, 2] } : {}),
      },
    })
  }
  // The name and range along each edge. Labels that would overlap are hidden by the map
  // (systems with the same range): click the system in the box to see it alone.
  map.addLayer({
    id: 'defence-label',
    type: 'symbol',
    source: 'defence-coverage',
    layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 400, // px between repeats along the same edge
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
    },
    paint: { 'text-color': '#e6e9ee', 'text-halo-color': 'rgba(14, 18, 23, 0.9)', 'text-halo-width': 1.5 },
  })

  // Radars: range rings inside each radar's circle and a rotating beam, like a radar screen
  map.addSource('defence-radar', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addLayer({
    id: 'defence-radar-beam',
    type: 'fill',
    source: 'defence-radar',
    filter: ['==', ['get', 'kind'], 'beam'],
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['get', 'opacity'] },
  })
  map.addLayer({
    id: 'defence-radar-rings',
    type: 'line',
    source: 'defence-radar',
    filter: ['==', ['get', 'kind'], 'ring'],
    paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.45 },
  })
}

const EDGES = ['defence-edge', 'defence-edge-dashed']

// The range around every site, merged. null = no sites. Turf's union is loaded only when first needed.
export async function computeCoverage(sites: [number, number][], km: number): Promise<Coverage | null> {
  if (sites.length === 0) return null
  const { default: union } = await import('@turf/union')
  const circles: FeatureCollection<Polygon> = {
    type: 'FeatureCollection',
    features: sites.map((center) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [circle(center, km, 64)] },
    })),
  }
  // One circle needs no merging; union() wants at least two
  return circles.features.length === 1 ? circles.features[0] : (union(circles) as Coverage | null)
}

// Shows these systems' coverage (empty list = hide). The biggest is drawn first, so smaller ones stay on top.
// The outlines fade in.
export function showCoverages(map: MapLibreMap, shapes: CoverageShape[]) {
  const source = map.getSource('defence-coverage') as GeoJSONSource | undefined
  if (!source) return
  for (const id of EDGES) map.setPaintProperty(id, 'line-opacity', 0) // start invisible…
  source.setData({
    type: 'FeatureCollection',
    features: shapes.map((s) => ({ ...s.coverage, properties: { color: s.color, label: s.label, dashed: s.dashed, fill: s.dashed ? 0 : FILL } })),
  })
  requestAnimationFrame(() => {
    for (const id of EDGES) map.setPaintProperty(id, 'line-opacity', 1) // …then fade in
  })
}

// The box around coverage shapes, for zooming the map to them: [[west, south], [east, north]]
// (several shapes → the box around all of them)
export function coverageBounds(coverages: Coverage[]): [[number, number], [number, number]] {
  let west = 180
  let south = 90
  let east = -180
  let north = -90
  const polygons = coverages.flatMap((c) => (c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates))
  for (const polygon of polygons)
    for (const [lng, lat] of polygon[0]) {
      west = Math.min(west, lng)
      east = Math.max(east, lng)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  return [
    [west, south],
    [east, north],
  ]
}

// ---------- Radar sweep ----------

export interface RadarSite {
  center: [number, number] // [lng, lat]
  km: number // detection range
  color: string
}

const SWEEP_SECONDS = 4 // one full turn of the beam
const BEAM = [
  // The beam and its fading trail: [from degrees behind the leading edge, to, opacity]
  [0, 8, 0.35],
  [8, 20, 0.18],
  [20, 40, 0.07],
] as const

// A slice of the radar's circle, from bearing `from` to bearing `to` (degrees clockwise from north)
function slice(center: [number, number], km: number, from: number, to: number): Position[] {
  const points: Position[] = [center]
  const steps = Math.max(2, Math.round((to - from) / 2)) // a point every 2°
  for (let i = 0; i <= steps; i++) points.push(destination(center, km, from + ((to - from) * i) / steps))
  points.push(center)
  return points
}

// Starts the radar look for these sites: rings at 1/3 and 2/3 of the range, and a beam turning around.
// Returns a function that stops it and clears it. People who ask for less motion get a still beam.
export function startRadarSweep(map: MapLibreMap, radars: RadarSite[]): () => void {
  const source = map.getSource('defence-radar') as GeoJSONSource | undefined
  if (!source || radars.length === 0) return () => {}

  // The rings never move: made once
  const rings: Feature[] = radars.flatMap((r) =>
    [1 / 3, 2 / 3].map((part) => ({
      type: 'Feature' as const,
      properties: { kind: 'ring', color: r.color },
      geometry: { type: 'LineString' as const, coordinates: circle(r.center, r.km * part, 64) },
    })),
  )

  function draw(angle: number) {
    const beams: Feature[] = radars.flatMap((r) =>
      BEAM.map(([back1, back2, opacity]) => ({
        type: 'Feature' as const,
        properties: { kind: 'beam', color: r.color, opacity },
        geometry: { type: 'Polygon' as const, coordinates: [slice(r.center, r.km, angle - back2, angle - back1)] },
      })),
    )
    source!.setData({ type: 'FeatureCollection', features: [...rings, ...beams] })
  }

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let frame = 0
  let last = 0
  const start = performance.now()
  function tick(now: number) {
    // About 30 updates a second is smooth enough and keeps phones cool
    if (now - last > 33) {
      last = now
      draw((((now - start) / 1000 / SWEEP_SECONDS) * 360) % 360)
    }
    frame = requestAnimationFrame(tick)
  }
  if (still) draw(45)
  else frame = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(frame)
    source.setData({ type: 'FeatureCollection', features: [] })
  }
}