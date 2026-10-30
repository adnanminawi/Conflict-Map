import * as maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Position } from 'geojson'
import type { MapLayer } from '../types'
import { buildPopup } from './popup'
import fightingIcon from '../assets/icons/fighting.png'
import explosionIcon from '../assets/icons/explosion.png'
import arrowheadIcon from '../assets/icons/arrowhead.png'

export const DEFAULT_COLOR = '#e5484d' // used when a shape has no color
const CLICKABLE = ['shapes-fill', 'shapes-line', 'shapes-icons', 'shapes-labels']

// The map editor turns popups off while the admin is drawing
let popupsEnabled = true
export function enableShapePopups(enabled: boolean) {
  popupsEnabled = enabled
}

// Direction of the last piece of a line, in degrees clockwise from north (for the arrowhead)
function endBearing(line: Position[]): number {
  const [lng1, lat1] = line[line.length - 2]
  const [lng2, lat2] = line[line.length - 1]
  const latFactor = Math.cos((lat2 * Math.PI) / 180) // 1° of longitude is shorter far from the equator
  return (Math.atan2((lng2 - lng1) * latFactor, lat2 - lat1) * 180) / Math.PI
}

// For each line with arrow = true: one extra point at its end, turned in the line's direction
function arrowheads(features: Feature[]): Feature[] {
  const result: Feature[] = []
  for (const f of features) {
    if (!f.properties?.arrow) continue
    const lines =
      f.geometry.type === 'LineString' ? [f.geometry.coordinates]
      : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates
      : []
    for (const line of lines) {
      if (line.length < 2) continue
      result.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: line[line.length - 1] },
        properties: { arrowhead: true, bearing: endBearing(line), color: f.properties.stroke ?? DEFAULT_COLOR },
      })
    }
  }
  return result
}

// All shapes of all layers in one list, plus the arrowheads.
// Each shape remembers its layer name and date (shown in the popup).
function buildData(layers: MapLayer[]): FeatureCollection {
  const features: Feature[] = layers.flatMap((layer) =>
    layer.geojson.features.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, layer_name: layer.name, layer_date: layer.snapshot_date },
    })),
  )
  return { type: 'FeatureCollection', features: [...features, ...arrowheads(features)] }
}

// Runs once, after the map has loaded: loads the icons and creates the empty map layers.
export async function setupShapeLayers(map: maplibregl.Map) {
  // 1. Icons. The arrowhead is "sdf" so the map can color it like its line.
  const images: [string, string, boolean][] = [
    ['fighting', fightingIcon, false],
    ['explosion', explosionIcon, false],
    ['arrowhead', arrowheadIcon, true],
  ]
  for (const [name, url, sdf] of images) {
    const image = await map.loadImage(url)
    if (!map.hasImage(name)) map.addImage(name, image.data, { sdf })
  }

  // 2. One source for all shapes (filled later by showShapes)
  map.addSource('shapes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  // Draw areas and lines under the city names, so the names stay readable
  const firstLabelLayer = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
  const width = ['coalesce', ['get', 'stroke-width'], 3]

  // 3. Areas: filled with their color
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

  // 4. Lines and area borders. Thinner when zoomed out, the real width when zoomed in.
  map.addLayer(
    {
      id: 'shapes-line',
      type: 'line',
      source: 'shapes',
      filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'], true, false],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['coalesce', ['get', 'stroke'], ['get', 'fill'], DEFAULT_COLOR],
        'line-opacity': ['coalesce', ['get', 'stroke-opacity'], 1],
        'line-width': ['interpolate', ['linear'], ['zoom'], 4, ['*', width, 0.4], 10, width] as any,
      },
    },
    firstLabelLayer,
  )

  // 5. Arrowheads at the end of arrow lines. The tip ("top" of the triangle) sits on the line's end.
  map.addLayer({
    id: 'shapes-arrowheads',
    type: 'symbol',
    source: 'shapes',
    filter: ['==', ['get', 'arrowhead'], true],
    layout: {
      'icon-image': 'arrowhead',
      'icon-anchor': 'top',
      'icon-rotate': ['get', 'bearing'],
      'icon-rotation-alignment': 'map',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.2, 10, 0.45],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['get', 'color'] },
  })

  // 6. Icons (fighting, explosion)
  map.addLayer({
    id: 'shapes-icons',
    type: 'symbol',
    source: 'shapes',
    filter: ['match', ['get', 'icon'], ['fighting', 'explosion'], true, false],
    layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.3, 10, 0.5],
      'icon-allow-overlap': true,
    },
  })

  // 7. Names written on the map (only when zoomed in, so they don't cover everything).
  // Lines: the name follows the line. Areas and icons: the name sits in the middle / under the icon.
  const textStyle = {
    'text-color': '#ffffff',
    'text-halo-color': 'rgba(0, 0, 0, 0.8)',
    'text-halo-width': 1.5,
  }
  map.addLayer({
    id: 'shapes-line-labels',
    type: 'symbol',
    source: 'shapes',
    minzoom: 7,
    filter: ['all', ['!=', ['get', 'name'], null], ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'symbol-placement': 'line',
    },
    paint: textStyle,
  })
  map.addLayer({
    id: 'shapes-labels',
    type: 'symbol',
    source: 'shapes',
    minzoom: 6,
    filter: ['all', ['!=', ['get', 'name'], null], ['match', ['geometry-type'], ['LineString', 'MultiLineString'], false, true]],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Regular'],
      'text-size': ['case', ['==', ['get', 'icon'], 'text'], 15, 12], // text labels are a bit bigger
      'text-offset': ['case', ['==', ['get', 'icon'], 'text'], ['literal', [0, 0]], ['literal', [0, 1.6]]],
      'text-max-width': 12,
    },
    paint: textStyle,
  })

  // 8. Click a shape → popup with its name and description
  map.on('click', (e) => {
    if (!popupsEnabled) return
    // Clicks on base / event icons are handled by their own popups
    if (e.originalEvent.target !== map.getCanvas()) return

    // Look in a small box around the click, so thin lines are easy to hit
    const box: [maplibregl.PointLike, maplibregl.PointLike] = [
      [e.point.x - 4, e.point.y - 4],
      [e.point.x + 4, e.point.y + 4],
    ]
    const shape = map.queryRenderedFeatures(box, { layers: CLICKABLE })[0]
    if (!shape) return

    const p = shape.properties
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setDOMContent(buildPopup(p.name ?? p.layer_name, `${p.layer_name} · ${p.layer_date}`, [p.description]))
      .addTo(map)
  })

  // 9. Hand cursor when the mouse is over a shape
  for (const id of CLICKABLE) {
    map.on('mouseenter', id, () => popupsEnabled && (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => popupsEnabled && (map.getCanvas().style.cursor = ''))
  }
}

// Puts these layers on the map (replaces what was shown before)
export function showShapes(map: maplibregl.Map, layers: MapLayer[]) {
  const source = map.getSource<maplibregl.GeoJSONSource>('shapes')
  source?.setData(buildData(layers))
}