// Bases, airports and naval bases, drawn by the map itself (not as HTML images), with clustering:
// zoomed out, nearby ones merge into a circle with a number. Click it to zoom in; zoomed in, the icons appear.
// Drawn on the map's canvas, so thousands of them stay smooth.
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource } from 'maplibre-gl'
import type { MapLocation } from '../types'
import { buildPopup } from './popup'
import { arePopupsEnabled } from './shapesLayer'
import airportIcon from '../assets/icons/airport.png'
import militaryBaseIcon from '../assets/icons/military_base.png'
import navalBaseIcon from '../assets/icons/naval_base.png'
import airDefenceIcon from '../assets/icons/air_defence.png'
import radarIcon from '../assets/icons/radar.png'

// Which picture to use for each location type (the map knows them by these names)
const ICONS: Record<string, string> = {
  airport: airportIcon,
  military_base: militaryBaseIcon,
  naval_base: navalBaseIcon,
  air_defence: airDefenceIcon,
  radar: radarIcon,
}

// Clickable layers. shapesLayer.ts and alertsLayer.ts skip clicks on these, so a click on a base doesn't also open a frontline's popup.
const LOCATION_LAYERS = ['locations-clusters', 'locations-icons']

const CLUSTER_UNTIL_ZOOM = 8 // from zoom 9, every base shows on its own
const CLUSTER_RADIUS = 45 // px: bases closer than this on screen merge

export async function setupLocationLayers(map: maplibregl.Map) {
  // 1. The 3 icons (128 px pictures, shown smaller by icon-size below)
  for (const [type, url] of Object.entries(ICONS)) {
    const image = await map.loadImage(url)
    if (!map.hasImage(`loc-${type}`)) map.addImage(`loc-${type}`, image.data)
  }

  // 2. The data, with clustering on
  map.addSource('locations', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
    cluster: true,
    clusterMaxZoom: CLUSTER_UNTIL_ZOOM,
    clusterRadius: CLUSTER_RADIUS,
  })

  // 3. Clusters: a circle, bigger when it holds more bases
  map.addLayer({
    id: 'locations-clusters',
    type: 'circle',
    source: 'locations',
    filter: ['has', 'point_count'],
    paint: {
      'circle-color': 'rgba(14, 18, 23, 0.9)',
      'circle-stroke-color': '#e6e9ee',
      'circle-stroke-width': 1.5,
      'circle-radius': ['step', ['get', 'point_count'], 14, 10, 17, 50, 21, 200, 26],
    },
  })

  // 4. The number inside each cluster ("48", "1.2k")
  map.addLayer({
    id: 'locations-count',
    type: 'symbol',
    source: 'locations',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['get', 'point_count_abbreviated'],
      'text-font': ['Noto Sans Regular'], // the map's own fonts (MapTiler)
      'text-size': 12,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#ffffff' },
  })

  // 5. Single bases: their icon. A bit smaller when zoomed out, bigger when zoomed in (28 px at zoom 8).
  map.addLayer({
    id: 'locations-icons',
    type: 'symbol',
    source: 'locations',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': ['concat', 'loc-', ['get', 'type']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.17, 8, 0.22, 12, 0.27],
      'icon-allow-overlap': true, // clustering already keeps them apart
    },
  })

  // Events are drawn on top of bases: if the click is on an event, only the event reacts
  const onEvent = (point: maplibregl.PointLike) =>
    map.getLayer('events-pins') !== undefined && map.queryRenderedFeatures(point, { layers: ['events-clusters', 'events-pins'] }).length > 0

  // 6. Click a cluster → zoom in until it splits
  map.on('click', 'locations-clusters', async (e) => {
    if (!arePopupsEnabled() || onEvent(e.point)) return // measuring, placing a weapon or editing: the click is for that
    const cluster = e.features?.[0]
    if (!cluster) return
    const source = map.getSource('locations') as GeoJSONSource
    const zoom = await source.getClusterExpansionZoom(cluster.properties.cluster_id)
    map.easeTo({ center: (cluster.geometry as GeoJSON.Point).coordinates as [number, number], zoom })
  })

  // 7. Click a base → its popup
  map.on('click', 'locations-icons', (e) => {
    if (!arePopupsEnabled() || onEvent(e.point)) return
    const base = e.features?.[0]
    if (!base) return
    const p = base.properties
    new maplibregl.Popup({ offset: 14 })
      .setLngLat((base.geometry as GeoJSON.Point).coordinates as [number, number])
      .setDOMContent(buildPopup(p.name, p.type_name, [p.country_code, p.description]))
      .addTo(map)
  })

  // 8. Hand cursor over clusters and bases
  for (const id of LOCATION_LAYERS) {
    map.on('mouseenter', id, () => arePopupsEnabled() && (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => arePopupsEnabled() && (map.getCanvas().style.cursor = ''))
  }
}

// Shows these bases (already filtered by type and country). The map groups them by itself.
export function showLocations(map: maplibregl.Map, locations: MapLocation[]) {
  const source = map.getSource('locations') as GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: locations.map((l) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [l.lng, l.lat] },
      properties: {
        name: l.name,
        type: ICONS[l.type_code] ? l.type_code : 'military_base', // unknown type → the base icon
        type_name: l.type_name,
        country_code: l.country_code,
        description: l.description ?? '',
      },
    })),
  })
}