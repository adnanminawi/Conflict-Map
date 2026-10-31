import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection } from 'geojson'
import type { AlertsResponse } from '../types'
import { buildPopup } from './popup'
import { arePopupsEnabled } from './shapesLayer'

// Color of each kind of alert
export const ALERT_COLORS = { rockets: '#ff2d2d', drone: '#ff8c00', other: '#ffd400' }
export const ALERT_MINUTES = 5
const color = ['match', ['get', 'type'], 'rockets', ALERT_COLORS.rockets, 'drone', ALERT_COLORS.drone, ALERT_COLORS.other]

// Runs once, after the map has loaded (and after setupShapeLayers, so alerts are drawn on top)
export function setupAlertLayers(map: maplibregl.Map) {
  map.addSource('alerts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  const firstLabelLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

  // Places with an outline: filled. New alerts are strong, and fade out over the hour.
  map.addLayer(
    {
      id: 'alerts-fill',
      type: 'fill',
      source: 'alerts',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: {
        'fill-color': color as any,
        'fill-opacity': ['interpolate', ['linear'], ['get', 'age_min'], 0, 0.6, ALERT_MINUTES, 0.15],
      },
    },
    firstLabelLayer,
  )
  map.addLayer(
    {
      id: 'alerts-outline',
      type: 'line',
      source: 'alerts',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': color as any, 'line-width': 1.5 },
    },
    firstLabelLayer,
  )

  // Places without an outline: a dot
  map.addLayer({
    id: 'alerts-dots',
    type: 'circle',
    source: 'alerts',
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': color as any,
      'circle-radius': 6,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity': ['interpolate', ['linear'], ['get', 'age_min'], 0, 1, ALERT_MINUTES, 0.3],
    },
  })

  // Click → place name, kind of alert, time
  map.on('click', (e) => {
    if (!arePopupsEnabled()) return // the map editor is open
    if (e.originalEvent.target !== map.getCanvas()) return
    const area = map.queryRenderedFeatures(e.point, { layers: ['alerts-fill', 'alerts-dots'] })[0]
    if (!area) return

    const p = area.properties
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setDOMContent(
        buildPopup(p.name, p.type_name, [
          p.name_en,
          new Date(p.started_at).toLocaleString(),
        ]),
      )
      .addTo(map)
  })
  for (const id of ['alerts-fill', 'alerts-dots']) {
    map.on('mouseenter', id, () => arePopupsEnabled() && (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => arePopupsEnabled() && (map.getCanvas().style.cursor = ''))
  }
}

// Puts these alerts on the map (replaces the previous ones)
export function showAlerts(map: maplibregl.Map, data: AlertsResponse) {
  const areas = new Map(data.areas.map((a) => [a.id, a]))
  const features: Feature[] = []
  const done = new Set<number>() // a place with several alerts is drawn once, with its newest alert

  // Newest alerts first (the backend sends them in that order)
  for (const alert of data.alerts) {
    const ageMin = (Date.now() - new Date(alert.started_at).getTime()) / 60_000

    for (const id of alert.area_ids) {
      const area = areas.get(id)
      if (!area || done.has(id)) continue
      done.add(id)

      features.push({
        type: 'Feature',
        geometry: area.polygon
          ? { type: 'Polygon', coordinates: [area.polygon] }
          : { type: 'Point', coordinates: [area.lng, area.lat] },
        properties: {
          name: area.name_ar ?? area.name_en ?? area.name_he, // Arabic first, for the site's visitors
          name_en: area.name_en,
          type: alert.type,
          type_name: alert.type_name,
          started_at: alert.started_at,
          age_min: ageMin,
        },
      })
    }
  }

  const collection: FeatureCollection = { type: 'FeatureCollection', features }
  map.getSource<maplibregl.GeoJSONSource>('alerts')?.setData(collection)
}