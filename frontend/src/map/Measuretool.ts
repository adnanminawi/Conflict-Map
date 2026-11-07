// Measure distance: a ruler button under the zoom buttons.
// Click points on the map → a line with the distance at each point. Double-click finishes, Esc closes.
import type { GeoJSONSource, IControl, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import type { Feature } from 'geojson'
import { arePopupsEnabled, enableShapePopups } from './shapesLayer'

type LngLat = [number, number]

const SOURCE = 'measure'
const LAYERS = ['measure-line', 'measure-points', 'measure-labels']

// Distance in km between two points on the Earth (haversine formula: the Earth as a sphere, ~0.5% error at most)
export function distanceKm(a: LngLat, b: LngLat): number {
  const R = 6371 // Earth radius in km
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b[1] - a[1])
  const dLng = rad(b[0] - a[0])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// 3.4 km / 120 km / 1,250 km
function formatKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km).toLocaleString()} km`
}

// A simple ruler icon, same size as the zoom buttons' icons
const RULER_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
  <rect x="2.5" y="8" width="19" height="8" rx="1" />
  <path d="M6 8v3M9.5 8v4.5M13 8v3M16.5 8v4.5" stroke-linecap="round" />
</svg>`

export class MeasureControl implements IControl {
  private map: MapLibreMap | null = null
  private box: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private hint: HTMLDivElement | null = null

  private active = false
  private finished = false // after a double-click: the line stays, the next click starts a new one
  private points: LngLat[] = []
  private cursor: LngLat | null = null // where the mouse is: shows the next segment before clicking
  private popupsBefore = true

  private onStart: () => void

  // onStart: lets the page cancel things that also use map clicks (placing a weapon)
  constructor(onStart: () => void) {
    this.onStart = onStart
  }

  onAdd(map: MapLibreMap) {
    this.map = map
    this.box = document.createElement('div')
    this.box.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'measure-button'
    this.button.title = 'Measure distance'
    this.button.setAttribute('aria-label', 'Measure distance')
    this.button.setAttribute('aria-pressed', 'false')
    this.button.innerHTML = RULER_ICON
    this.button.onclick = () => (this.active ? this.stop() : this.start())

    this.box.appendChild(this.button)
    return this.box
  }

  onRemove() {
    this.stop()
    this.box?.remove()
    this.map = null
  }

  isActive() {
    return this.active
  }

  start() {
    const map = this.map
    if (!map || this.active) return
    this.onStart()
    this.active = true
    this.finished = false
    this.points = []
    this.cursor = null

    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
    map.addLayer({
      id: 'measure-line',
      type: 'line',
      source: SOURCE,
      paint: { 'line-color': '#ffffff', 'line-width': 2, 'line-dasharray': [2, 1.5] },
    })
    map.addLayer({
      id: 'measure-points',
      type: 'circle',
      source: SOURCE,
      filter: ['==', ['get', 'kind'], 'point'],
      paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-stroke-color': '#0e1217', 'circle-stroke-width': 2 },
    })
    map.addLayer({
      id: 'measure-labels',
      type: 'symbol',
      source: SOURCE,
      filter: ['has', 'label'],
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Regular'], // the map's own fonts (MapTiler)
        'text-size': 12,
        'text-offset': [0, -1.3],
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(14, 18, 23, 0.95)', 'text-halo-width': 3 },
    })

    // While measuring, clicks are for points: no popups, no zoom on double-click
    this.popupsBefore = arePopupsEnabled()
    enableShapePopups(false)
    map.doubleClickZoom.disable()
    map.getCanvas().style.cursor = 'crosshair'
    map.on('click', this.onClick)
    map.on('dblclick', this.onDblClick)
    map.on('mousemove', this.onMove)
    window.addEventListener('keydown', this.onKey)

    // How to use it, at the bottom of the map
    this.hint = document.createElement('div')
    this.hint.className = 'map-panel measure-hint'
    this.hint.setAttribute('role', 'status')
    // Phones have no Esc key and no reliable double-click
    const touch = window.matchMedia('(pointer: coarse)').matches
    this.hint.textContent = touch ? 'Tap to add points. Tap the ruler again to close.' : 'Click to add points. Double-click to finish. Esc to close.'
    map.getContainer().appendChild(this.hint)

    this.button?.classList.add('active')
    this.button?.setAttribute('aria-pressed', 'true')
  }

  stop() {
    const map = this.map
    if (!map || !this.active) return
    this.active = false

    map.off('click', this.onClick)
    map.off('dblclick', this.onDblClick)
    map.off('mousemove', this.onMove)
    window.removeEventListener('keydown', this.onKey)

    for (const id of LAYERS) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(SOURCE)) map.removeSource(SOURCE)

    map.getCanvas().style.cursor = ''
    map.doubleClickZoom.enable()
    const before = this.popupsBefore
    setTimeout(() => enableShapePopups(before), 0) // a moment later, so the last click doesn't open a popup
    this.hint?.remove()
    this.hint = null

    this.button?.classList.remove('active')
    this.button?.setAttribute('aria-pressed', 'false')
  }

  // Arrow functions so map.on / map.off get the same function every time
  private onClick = (e: MapMouseEvent) => {
    if (this.finished) {
      // A new measurement
      this.points = []
      this.finished = false
    }
    this.points.push([e.lngLat.lng, e.lngLat.lat])
    this.draw()
  }

  private onDblClick = () => {
    // A double-click also fired two clicks: drop the extra point it added
    const n = this.points.length
    if (n >= 2 && this.points[n - 1][0] === this.points[n - 2][0] && this.points[n - 1][1] === this.points[n - 2][1]) this.points.pop()
    this.finished = true
    this.cursor = null
    this.draw()
  }

  private onMove = (e: MapMouseEvent) => {
    if (this.finished || this.points.length === 0) return
    this.cursor = [e.lngLat.lng, e.lngLat.lat]
    this.draw()
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.stop()
  }

  // Line + a dot at each point + the total so far next to each point
  private draw() {
    const source = this.map?.getSource(SOURCE) as GeoJSONSource | undefined
    if (!source) return

    const line = this.cursor ? [...this.points, this.cursor] : this.points
    const features: Feature[] = []
    if (line.length >= 2) {
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } })
    }

    let total = 0
    line.forEach((p, i) => {
      if (i > 0) total += distanceKm(line[i - 1], p)
      const isCursor = this.cursor !== null && i === line.length - 1
      const props: Record<string, string> = { kind: isCursor ? 'cursor' : 'point' }
      if (i > 0) props.label = formatKm(total) // the first point needs no label (0 km)
      features.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: p } })
    })

    source.setData({ type: 'FeatureCollection', features })
  }
}