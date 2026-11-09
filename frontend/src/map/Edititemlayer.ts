// The base or event the admin is editing: drawn on its own, on top, with a white ring around it.
// The admin drags it to move it. Nothing is saved here: the edit box saves when the admin clicks Save.
import type { GeoJSONSource, Map as MapLibreMap, MapLayerMouseEvent, MapLayerTouchEvent } from 'maplibre-gl'

export interface EditItem {
  lng: number
  lat: number
  image: string // the map image: 'loc-airport', 'pin-#E53935'…
  anchor: 'center' | 'bottom' // base icons sit on the spot, event pins stand on it
}

const LAYERS = ['edit-ring', 'edit-icon']

function setup(map: MapLibreMap) {
  if (map.getSource('edit-item')) return
  map.addSource('edit-item', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  // A white ring: "this one is being edited, you can drag it"
  map.addLayer({
    id: 'edit-ring',
    type: 'circle',
    source: 'edit-item',
    paint: {
      'circle-radius': 22,
      'circle-color': 'rgba(255, 255, 255, 0.15)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'edit-icon',
    type: 'symbol',
    source: 'edit-item',
    layout: {
      'icon-image': ['get', 'image'],
      'icon-anchor': ['get', 'anchor'],
      'icon-size': ['case', ['==', ['get', 'anchor'], 'center'], 0.25, 1], // base icons are 128 px pictures
      'icon-allow-overlap': true,
    },
  })
}

// Shows the item being edited, or nothing (null)
export function showEditItem(map: MapLibreMap, item: EditItem | null) {
  setup(map)
  ;(map.getSource('edit-item') as GeoJSONSource).setData({
    type: 'FeatureCollection',
    features: item
      ? [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [item.lng, item.lat] },
            properties: { image: item.image, anchor: item.anchor },
          },
        ]
      : [],
  })
}

// Lets the admin drag the item with the mouse or a finger. onMove gets the new position.
// Returns a function that turns dragging off again.
export function enableDrag(map: MapLibreMap, onMove: (lng: number, lat: number) => void): () => void {
  setup(map)
  const canvas = map.getCanvas()

  const move = (e: MapLayerMouseEvent | MapLayerTouchEvent) => onMove(e.lngLat.lng, e.lngLat.lat)
  const stop = () => {
    canvas.style.cursor = ''
    map.off('mousemove', move)
    map.off('touchmove', move)
  }

  // Pressing on the item: the map stops panning, the item follows the mouse until the button is released
  const startMouse = (e: MapLayerMouseEvent) => {
    e.preventDefault() // otherwise the map would pan
    canvas.style.cursor = 'grabbing'
    map.on('mousemove', move)
    map.once('mouseup', stop)
  }
  const startTouch = (e: MapLayerTouchEvent) => {
    if (e.points.length !== 1) return // two fingers = zooming, leave it to the map
    e.preventDefault()
    map.on('touchmove', move)
    map.once('touchend', stop)
  }
  const hoverOn = () => (canvas.style.cursor = 'grab')
  const hoverOff = () => (canvas.style.cursor = '')

  for (const id of LAYERS) {
    map.on('mousedown', id, startMouse)
    map.on('touchstart', id, startTouch)
    map.on('mouseenter', id, hoverOn)
    map.on('mouseleave', id, hoverOff)
  }

  return () => {
    stop()
    for (const id of LAYERS) {
      map.off('mousedown', id, startMouse)
      map.off('touchstart', id, startTouch)
      map.off('mouseenter', id, hoverOn)
      map.off('mouseleave', id, hoverOff)
    }
  }
}