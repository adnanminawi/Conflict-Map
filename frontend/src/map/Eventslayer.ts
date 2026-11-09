// Confirmed events (strikes, attacks…), drawn by the map itself with clustering, like the bases:
// zoomed out, nearby events merge into a red circle with a number. Click it to zoom in; zoomed in, the pins appear.
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import type { MapEvent } from '../types'
import { buildPopup } from './popup'
import { arePopupsEnabled } from './shapesLayer'
import { getPickHandler } from './pickMode'

const DEFAULT_COLOR = '#E53935' // events without a type color
const CLUSTER_UNTIL_ZOOM = 8 // from zoom 9, every event shows on its own

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
function drawPin(color: string) {
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

export function setupEventLayers(map: maplibregl.Map) {
  // 1. Pins are drawn when first needed, one per color ("pin-#E53935")
  map.on('styleimagemissing', (e) => {
    if (!e.id.startsWith('pin-') || map.hasImage(e.id)) return
    map.addImage(e.id, drawPin(e.id.slice(4)), { pixelRatio: 2 })
  })

  // 2. The data, with clustering on
  map.addSource('events', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: CLUSTER_UNTIL_ZOOM,
    clusterRadius: 45,
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

  // 4. Single events: a pin in the event type's color, its tip on the spot
  map.addLayer({
    id: 'events-pins',
    type: 'symbol',
    source: 'events',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', 'pin-', ['get', 'color']],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true, // clustering already keeps them apart
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
      properties: { id: e.id, color: e.color ?? DEFAULT_COLOR },
    })),
  })
}