import * as maplibregl from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import type { MapLayer } from '../types'
import { buildPopup } from './popup'

const DEFAULT_COLOR = '#e5484d' // used when the file has no color
const LAYER_IDS = ['shapes-fill', 'shapes-line']

// Draws the frontlines and areas, using the colors from the KML file.
// Must be called after the map has loaded (map.on('load', ...)).
export function addShapeLayers(map: maplibregl.Map, layers: MapLayer[]) {
  // 1. Put the shapes of all layers in one list. Each shape remembers its layer name and date.
  const data: FeatureCollection = {
    type: 'FeatureCollection',
    features: layers.flatMap((layer) =>
      layer.geojson.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, layer_name: layer.name, layer_date: layer.snapshot_date },
      })),
    ),
  }
  map.addSource('shapes', { type: 'geojson', data })

  // Draw the shapes under the city names, so the names stay readable
  const firstLabelLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

  // 2. Areas: filled with their color
  map.addLayer(
    {
      id: 'shapes-fill',
      type: 'fill',
      source: 'shapes',
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: {
        'fill-color': ['coalesce', ['get', 'fill'], DEFAULT_COLOR],
        'fill-opacity': ['coalesce', ['get', 'fill-opacity'], 0.35],
      },
    },
    firstLabelLayer,
  )

  // 3. Lines (and the borders of areas). Thinner when zoomed out, the file's width when zoomed in.
  const width = ['coalesce', ['get', 'stroke-width'], 2]
  map.addLayer(
    {
      id: 'shapes-line',
      type: 'line',
      source: 'shapes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'stroke'], DEFAULT_COLOR],
        'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['*', width, 0.4], 10, width] as any,
      },
    },
    firstLabelLayer,
  )

  // 4. Click a shape → popup with its name and description
  map.on('click', (e) => {
    // Clicks on base / event icons are handled by their own popups
    if (e.originalEvent.target !== map.getCanvas()) return

    // Look in a small box around the click, so thin lines are easy to hit
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - 4, e.point.y - 4],
      [e.point.x + 4, e.point.y + 4],
    ]
    const shape = map.queryRenderedFeatures(box, { layers: LAYER_IDS })[0]
    if (!shape) return

    const p = shape.properties
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setDOMContent(buildPopup(p.name ?? p.layer_name, `${p.layer_name} · ${p.layer_date}`, [p.description]))
      .addTo(map)
  })

  // 5. Hand cursor when the mouse is over a shape
  for (const id of LAYER_IDS) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
  }
}