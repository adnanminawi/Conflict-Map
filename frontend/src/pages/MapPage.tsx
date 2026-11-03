import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import { fetchLocations } from '../api/locations'
import { fetchLayers } from '../api/layers'
import { fetchAlerts } from '../api/alerts'
import { TOKEN_KEY } from '../api/client'
import { addLocationMarkers } from '../map/locationsLayer'
import { setupShapeLayers, showShapes } from '../map/shapesLayer'
import { setupAlertLayers, showAlerts, ALERT_MINUTES } from '../map/alertsLayer'
import { buildPopup } from '../map/popup'
import {
  ALL,
  ALL_VISIBLE,
  ALERTS_COUNTRY,
  countryBox,
  findCountries,
  inCountry,
  keepShape,
  sidesInCountry,
  visibleAlertTypes,
  type Category,
  type Visible,
} from '../map/filters'
import MapLegend from '../components/MapLegend'
import CountryTabs from '../components/CountryTabs'
import type { AlertsResponse, MapEvent, MapLayer, MapLocation } from '../types'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MAPTILER_KEY, MAP_STYLE, START_CENTER, START_ZOOM } from '../map/config'

// The editor is only downloaded when an admin is logged in. Visitors never load it.
const MapEditor = lazy(() => import('../components/MapEditor'))
maplibregl.setWorkerUrl(workerUrl)
const EVENTS_REFRESH_MS = 60_000
const ALERTS_REFRESH_MS = 10_000 // siren alerts change fast

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null) // set once the map is ready

  // Data from the backend
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [events, setEvents] = useState<MapEvent[]>([])
  const [layers, setLayers] = useState<MapLayer[]>([])
  const [alerts, setAlerts] = useState<AlertsResponse>({ alerts: [], areas: [] })
  const [status, setStatus] = useState<string | null>('Loading events…')

  // What the visitor chose (reset on every visit)
  const [country, setCountry] = useState(ALL)
  const [visible, setVisible] = useState<Visible>(ALL_VISIBLE)
  const [hiddenSides, setHiddenSides] = useState<number[]>([]) // side ids switched off (reset when the country changes)

  // Admin: the layer open in the editor is hidden from the normal display
  const [editingName, setEditingName] = useState<string | null>(null)
  const isAdmin = localStorage.getItem(TOKEN_KEY) !== null

  async function loadLayers() {
    try {
      setLayers(await fetchLayers())
    } catch (err) {
      console.error('Could not load frontlines', err)
    }
  }

  // ---------- 1. The map ----------

  useEffect(() => {
    if (!MAPTILER_KEY) {
      setStatus('Missing VITE_MAPTILER_KEY in frontend/.env.local')
      return
    }
    const map = new maplibregl.Map({
      container: containerRef.current!,
      style: MAP_STYLE,
      center: START_CENTER,
      zoom: START_ZOOM,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map

    // Frontlines and alerts need the map style to be ready, so wait for 'load'
    map.on('load', async () => {
      await setupShapeLayers(map)
      setupAlertLayers(map) // after the shapes, so alerts are drawn on top
      if (mapRef.current === map) setMap(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---------- 2. Load the data ----------

  // Bases and frontlines: once (they rarely change)
  useEffect(() => {
    fetchLocations()
      .then(setLocations)
      .catch((err) => console.error('Could not load bases and airports', err))
    loadLayers()
  }, [])

  // Events: now and every minute
  useEffect(() => {
    async function load() {
      try {
        const list = await fetchEvents()
        setEvents(list)
        setStatus(null)
      } catch {
        setStatus('Could not load events — is the backend running?')
      }
    }
    load()
    const timer = setInterval(load, EVENTS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  // Siren alerts: now and every 10 seconds
  useEffect(() => {
    async function load() {
      try {
        setAlerts(await fetchAlerts(ALERT_MINUTES))
      } catch (err) {
        console.error('Could not load alerts', err)
      }
    }
    load()
    const timer = setInterval(load, ALERTS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [])

  // ---------- 3. Draw what is visible ----------
  // Each part is drawn again when its data, the switches or the country tab change.
  // The "return () => ..." removes the old markers before drawing the new ones.

  // Bases and airports: only the switched-on types, only the selected country
  useEffect(() => {
    if (!map) return
    const shown = locations.filter(
      (l) => visible[l.type_code as Category] !== false && inCountry(l.country_code, country),
    )
    const markers = addLocationMarkers(map, shown)
    return () => markers.forEach((m) => m.remove())
  }, [map, locations, visible, country])

  // Events
  useEffect(() => {
    if (!map || !visible.events) return
    const markers = events
      .filter((e) => inCountry(e.country_code, country))
      .map((event) =>
        new maplibregl.Marker({ color: event.color ?? '#E53935' })
          .setLngLat([event.lng, event.lat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setDOMContent(eventPopup(event)))
          .addTo(map),
      )
    return () => markers.forEach((m) => m.remove())
  }, [map, events, visible.events, country])

  // Frontlines: right country, side switched on, not the layer being edited,
  // and inside each layer only the shapes whose switch is on (frontlines / fighting / explosion)
  useEffect(() => {
    if (!map) return
    const shown = layers
      .filter(
        (l) => l.name !== editingName && inCountry(l.country_code, country) && !hiddenSides.includes(l.side_id),
      )
      .map((l) => ({
        ...l,
        geojson: { ...l.geojson, features: l.geojson.features.filter((f) => keepShape(f, visible)) },
      }))
    showShapes(map, shown)
  }, [map, layers, editingName, visible, country, hiddenSides])

  // Siren alerts: only in the "All" and Israel tabs, only the switched-on types
  useEffect(() => {
    if (!map) return
    const types = inCountry(ALERTS_COUNTRY, country) ? visibleAlertTypes(visible) : []
    showAlerts(map, { ...alerts, alerts: alerts.alerts.filter((a) => types.includes(a.type)) })
  }, [map, alerts, visible, country])

  // ---------- 4. Visitor actions ----------

  // Country tab: filter, then zoom to that country ("All" → back to the start view)
  function selectCountry(code: string) {
    setCountry(code)
    setHiddenSides([]) // each country starts with all its sides shown
    if (!map) return
    if (code === ALL) {
      map.flyTo({ center: START_CENTER, zoom: START_ZOOM })
      return
    }
    const box = countryBox(code, locations, events, layers)
    // Leave room for the header (top), the legend (left) and the zoom buttons (right). Phones: small margins.
    const padding = window.innerWidth > 600 ? { top: 90, bottom: 40, left: 290, right: 70 } : 40
    if (box) map.fitBounds(box, { padding, maxZoom: 9 })
  }

  function toggle(category: Category) {
    setVisible((v) => ({ ...v, [category]: !v[category] }))
  }

  function toggleSide(sideId: number) {
    setHiddenSides((hidden) => (hidden.includes(sideId) ? hidden.filter((id) => id !== sideId) : [...hidden, sideId]))
  }

  function showAll() {
    setVisible(ALL_VISIBLE)
    setHiddenSides([])
  }

  const countries = findCountries(locations, events, layers)
  const eventCount = events.filter((e) => inCountry(e.country_code, country)).length

  return (
    <>
      <div ref={containerRef} className="map" />

      {/* Top-left: name + how many events are shown */}
      <div className="map-panel map-header">
        <div className="brand">
          <span className="live-dot" /> Conflict Map
        </div>
        <div className="map-subtitle">
          {eventCount} confirmed {eventCount === 1 ? 'event' : 'events'} · last 7 days
        </div>
      </div>

      <CountryTabs countries={countries} selected={country} onSelect={selectCountry} />

      <MapLegend
        visible={visible}
        onToggle={toggle}
        onShowAll={showAll}
        sides={sidesInCountry(layers, country)}
        hiddenSides={hiddenSides}
        onToggleSide={toggleSide}
      />

      {status && <div className="map-panel status">{status}</div>}

      {isAdmin && map && (
        <Suspense fallback={null}>
          <MapEditor map={map} layers={layers} onEditingChange={setEditingName} onSaved={loadLayers} />
        </Suspense>
      )}
    </>
  )
}

function eventPopup(event: MapEvent): HTMLElement {
  return buildPopup(event.title, event.type_name, [
    new Date(event.occurred_at).toLocaleString(),
    event.location_name ? `Target: ${event.location_name}` : null,
    event.description,
  ])
}
