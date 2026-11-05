// "Reach from the border": for one country, a ring for each distance its weapons can reach,
// measured from ANY point of its border (a launcher can be anywhere inside the country).
// Each ring = the country's shape grown outwards by that many km.
// Borders: Natural Earth 1:50m (public domain), simplified, in /public/borders.json.
import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson'

type Area = Feature<Polygon | MultiPolygon>

export interface Reach {
  country: Area
  rings: { km: number; area: Area }[] // nearest first
}

// The rings go from yellow (close to the border) to orange-red (farthest), so each ring is easy to tell apart
const NEAR_COLOR = [255, 214, 102] // #ffd666
const FAR_COLOR = [240, 90, 50] // #f05a32
const COUNTRY_COLOR = '#ffd666'
const STAGGER_MS = 70 // the rings appear one after another, inside to outside

// The color between NEAR and FAR: t = 0 → nearest ring, t = 1 → farthest
function ringColor(t: number) {
  const [r, g, b] = NEAR_COLOR.map((near, i) => Math.round(near + (FAR_COLOR[i] - near) * t))
  return `rgb(${r}, ${g}, ${b})`
}

// ---------- Loading and computing ----------

// The borders file is only downloaded the first time someone asks for a reach, then kept
let borders: Promise<FeatureCollection> | null = null
function loadBorders() {
  if (!borders) {
    borders = fetch('/borders.json').then((res) => {
      if (!res.ok) throw new Error('Could not load the country borders')
      return res.json()
    })
    borders.catch(() => (borders = null)) // failed → try again next time
  }
  return borders
}

// Computing the rings takes a moment, so each result is kept: showing it again is instant
const computed = new Map<string, Reach | null>()

// The rings for this country and these distances. null = we have no border for this country.
export async function computeReach(countryCode: string, kms: number[]): Promise<Reach | null> {
  const key = `${countryCode}:${[...kms].sort((a, b) => a - b).join(',')}`
  if (!computed.has(key)) computed.set(key, await buildReach(countryCode, kms))
  return computed.get(key)!
}

async function buildReach(countryCode: string, kms: number[]): Promise<Reach | null> {
  // The buffer library is big, so it is also only downloaded when needed
  const [all, { buffer }] = await Promise.all([loadBorders(), import('@turf/buffer')])
  const country = all.features.find((f) => f.properties?.code === countryCode) as Area | undefined
  if (!country) return null

  const distinct = [...new Set(kms)].sort((a, b) => a - b)
  const rings = distinct.map((km) => ({ km, area: buffer(country, km, { units: 'kilometers', steps: 16 }) as Area }))
  return { country, rings }
}

// All the [lng, lat] points of an area's outer edge(s)
function outerPoints(area: Area): Position[] {
  const g = area.geometry
  return g.type === 'Polygon' ? g.coordinates[0] : g.coordinates.flatMap((p) => p[0])
}

// The box around the biggest ring, to zoom the map to it
export function reachBounds(reach: Reach): [[number, number], [number, number]] {
  const points = outerPoints(reach.rings[reach.rings.length - 1]?.area ?? reach.country)
  const lngs = points.map((p) => p[0])
  const lats = points.map((p) => p[1])
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ]
}

// ---------- Setup (once, after the map has loaded) ----------

export function setupReachLayers(map: maplibregl.Map) {
  map.addSource('reach', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const kind = (k: string) => ['==', ['get', 'kind'], k] as any
  // Under the frontlines and the placed weapons, so those stay readable on top
  const below = map.getLayer('shapes-fill') ? 'shapes-fill' : undefined

  const color = ['get', 'color'] as any
  const isHighlighted = ['boolean', ['feature-state', 'highlight'], false] as any

  // Each ring adds some fill: where rings overlap (close to the country) the color gets stronger on its own
  map.addLayer({ id: 'reach-fill', type: 'fill', source: 'reach', filter: kind('ring'), paint: { 'fill-color': color, 'fill-opacity': 0.05 } }, below)
  map.addLayer(
    {
      id: 'reach-line',
      type: 'line',
      source: 'reach',
      filter: kind('ring'),
      paint: {
        'line-color': color,
        'line-width': ['case', isHighlighted, 3.5, 2],
        'line-opacity': ['case', isHighlighted, 1, 0.9],
      },
    },
    below,
  )
  // The country itself
  map.addLayer({ id: 'reach-country', type: 'fill', source: 'reach', filter: kind('country'), paint: { 'fill-color': COUNTRY_COLOR, 'fill-opacity': 0.22 } }, below)
  map.addLayer({ id: 'reach-country-line', type: 'line', source: 'reach', filter: kind('country'), paint: { 'line-color': '#ffffff', 'line-width': 2 } }, below)

  // "1,300 km" on the 4 sides of each ring (north, east, south, west), sitting on the ring line.
  // The dark halo cuts the line behind the text, so it reads like a label on a map scale.
  map.addLayer({
    id: 'reach-labels',
    type: 'symbol',
    source: 'reach',
    filter: kind('label'),
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-allow-overlap': false, // rings very close together: the map hides the labels that would overlap
    },
    paint: { 'text-color': color, 'text-halo-color': 'rgba(14, 18, 23, 0.95)', 'text-halo-width': 3 },
  })
}

// ---------- Drawing ----------

// How to find each side's point on a ring: the most northern, eastern, southern and western point
const SIDES = [
  (a: Position, b: Position) => b[1] > a[1], // north
  (a: Position, b: Position) => b[0] > a[0], // east
  (a: Position, b: Position) => b[1] < a[1], // south
  (a: Position, b: Position) => b[0] < a[0], // west
]

function features(reach: Reach, ringCount: number): Feature[] {
  const list: Feature[] = [{ ...reach.country, properties: { kind: 'country' } }]
  reach.rings.slice(0, ringCount).forEach(({ km, area }, i) => {
    const color = ringColor(reach.rings.length === 1 ? 0 : i / (reach.rings.length - 1))
    list.push({ ...area, id: km, properties: { kind: 'ring', km, color } })

    const points = outerPoints(area)
    for (const further of SIDES) {
      const point = points.reduce((a, b) => (further(a, b) ? b : a))
      list.push({ type: 'Feature', geometry: { type: 'Point', coordinates: point }, properties: { kind: 'label', label: `${km.toLocaleString()} km`, color } })
    }
  })
  return list
}

// Shows a reach (or clears it with null). The rings appear one by one, from the border outwards.
// Returns a function that stops that, used when it's hidden or replaced before it's done.
export function showReach(map: maplibregl.Map, reach: Reach | null): () => void {
  const source = map.getSource<maplibregl.GeoJSONSource>('reach')
  if (!source) return () => {}
  if (!reach) {
    source.setData({ type: 'FeatureCollection', features: [] })
    return () => {}
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reducedMotion) {
    source.setData({ type: 'FeatureCollection', features: features(reach, reach.rings.length) })
    return () => {}
  }

  const timers: number[] = []
  for (let n = 0; n <= reach.rings.length; n++) {
    timers.push(window.setTimeout(() => source.setData({ type: 'FeatureCollection', features: features(reach, n) }), n * STAGGER_MS))
  }
  return () => timers.forEach(clearTimeout)
}

// Makes one ring stand out (hovering a weapon in the panel), or none with null
let highlighted: number | null = null
export function highlightReach(map: maplibregl.Map, km: number | null) {
  if (highlighted !== null) map.setFeatureState({ source: 'reach', id: highlighted }, { highlight: false })
  highlighted = km
  if (km !== null) map.setFeatureState({ source: 'reach', id: km }, { highlight: true })
}