// Confirmed events (strikes, attacks…), drawn by the map itself, like the bases.
// Every event shows on its own. With the Group button on (clusterControl.ts), nearby events merge into a red circle
// with a number when zoomed out; click it to zoom in.
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import type { MapEvent } from '../types'
import { buildPopup } from './popup'
import { arePopupsEnabled } from './shapesLayer'
import { getPickHandler } from './pickMode'

const DEFAULT_COLOR = '#E53935' // events without a type color

// The events on the map now, by id, so a click can find the full event for its popup
let shown = new Map<number, MapEvent>()

// The popup of one event
function eventPopup(event: MapEvent): HTMLElement {
  return buildPopup(event.title, event.type_name, [
    new Date(event.occurred_at).toLocaleString(),
    event.location_name ? `Target: ${event.location_name}` : null,
    event.description,
  ])
}

// Draws a map pin in one color (same shape as before: a drop with a white dot).
// Drawn at double size (pixelRatio 2) so it stays sharp on phones and retina screens.
// Used by fileIcons.ts, which draws every picture the map asks for ("pin-#E53935" → a red pin).
export function drawPin(color: string) {
  const w = 54
  const h = 82
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const cx = 27
  const cy = 26
  const r = 23
  const rad = (deg: number) => (deg * Math.PI) / 180

  // The drop: round top, pointed bottom (the two straight sides touch the circle at 25° and 155°)
  ctx.beginPath()
  ctx.arc(cx, cy, r, rad(155), rad(25))
  ctx.lineTo(cx, h - 2)
  ctx.closePath()
  ctx.fillStyle = color
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)'
  ctx.stroke()

  // The white dot
  ctx.beginPath()
  ctx.arc(cx, cy, 8, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  return ctx.getImageData(0, 0, w, h)
}

// Fires at sea (satellite): a small red dot with a soft glow, like the fire dots on NASA's FIRMS map.
// Always red, whatever the event type's color: it reads as "a satellite saw heat here", not as a confirmed strike.
// Centered on the spot. Drawn at double size like the pins. Used by fileIcons.ts ("fire-dot").
export function drawFireDot() {
  const size = 40
  const c = size / 2 // the center
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  // The glow: red in the middle, fading to nothing at the edge
  const glow = ctx.createRadialGradient(c, c, 4, c, c, c)
  glow.addColorStop(0, 'rgba(255, 40, 20, 0.55)')
  glow.addColorStop(1, 'rgba(255, 40, 20, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, size, size)

  // The dot: bright red with a darker rim, so it shows on the light map and on the blue sea
  ctx.beginPath()
  ctx.arc(c, c, 8, 0, Math.PI * 2)
  ctx.fillStyle = '#ff2a14'
  ctx.fill()
  ctx.lineWidth = 2
  ctx.strokeStyle = '#a30d00'
  ctx.stroke()

  return ctx.getImageData(0, 0, size, size)
}

// Which picture each event gets: the red dot for icon 'fire' (fires at sea), a pin for everything else
const IS_FIRE: maplibregl.ExpressionSpecification = ['==', ['get', 'icon'], 'fire']

export function setupEventLayers(map: maplibregl.Map) {
  // 1. Pins are drawn when first needed, one per color ("pin-#E53935"): see enableFileIcons in fileIcons.ts

  // 2. The data. Grouping starts off: the Group button turns it on (clusterControl.ts).
  map.addSource('events', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: false,
  })

  // 3. Clusters: red circles (bases use dark ones), bigger when they hold more events
  map.addLayer({
    id: 'events-clusters',
    type: 'circle',
    source: 'events',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(229, 57, 53, 0.9)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 17, 50, 21, 200, 26],
    },
  })
  map.addLayer({
    id: 'events-count',
    type: 'symbol',
    source: 'events',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'], // the map's own fonts (MapTiler)
      'text-size': 12,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  })

  // 4. Single events: a pin in the event type's color, its tip on the spot.
  //    Fires at sea: the red dot instead, its center on the spot.
  map.addLayer({
    id: 'events-pins',
    type: 'symbol',
    source: 'events',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['case', IS_FIRE, 'fire-dot', ['concat', 'pin-', ['get', 'color']]],
      'icon-anchor': ['case', IS_FIRE, 'center', 'bottom'],
      // The red dot grows with the zoom: small when looking at the whole region, bigger close up.
      // (MapLibre wants ['zoom'] at the top of 'interpolate': the dot/pin choice goes in each step.)
      'icon-size': [
        'interpolate', ['linear'], ['zoom'],
        3, ['case', IS_FIRE, 0.55, 1],
        6, ['case', IS_FIRE, 0.8, 1],
        9, ['case', IS_FIRE, 1.1, 1],
      ],
      'icon-allow-overlap': true, // show every event, even when they overlap
    },
  })

  // 5. Click a cluster → zoom in until it splits
  map.on('click', 'events-clusters', async (e) => {
    // Measuring, placing a weapon or drawing frontlines: the click is for that. Editing events: clusters still zoom.
    if (!arePopupsEnabled() && !getPickHandler()) return
    const cluster = e.features?.[0]
    if (!cluster) return
    const source = map.getSource('events') as GeoJSONSource
    const zoom = await source.getClusterExpansionZoom(cluster.properties.cluster_id)
    map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom })
  })

  // 6. Click a pin → the event's popup
  map.on('click', 'events-pins', (e) => {
    const event = shown.get(e.features?.[0]?.properties.id)
    if (!event) return
    // The admin is editing on the map: pick this event instead of opening its popup
    const pick = getPickHandler()
    if (pick) return pick('event', event.id)
    if (!arePopupsEnabled()) return
    new maplibregl.Popup({ offset: 30 }).setLngLat([event.lng, event.lat]).setDOMContent(eventPopup(event)).addTo(map)
  })

  // 7. Hand cursor over clusters and pins
  for (const id of ['events-clusters', 'events-pins']) {
    map.on('mouseenter', id, () => (arePopupsEnabled() || getPickHandler()) && (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => (arePopupsEnabled() || getPickHandler()) && (map.getCanvas().style.cursor = ''))
  }
}

// Shows these events (already filtered by country; empty list = events switched off)
export function showEvents(map: maplibregl.Map, events: MapEvent[]) {
  const source = map.getSource('events') as GeoJSONSource | undefined
  if (!source) return
  shown = new Map(events.map((e) => [e.id, e]))
  source.setData({
    type: 'FeatureCollection',
    features: events.map((e) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [e.lng, e.lat] },
      properties: { id: e.id, color: e.color ?? DEFAULT_COLOR, icon: e.icon },
    })),
  })
}