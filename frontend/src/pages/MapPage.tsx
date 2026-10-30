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
import { setupAlertLayers, showAlerts } from '../map/alertsLayer'
import { buildPopup } from '../map/popup'
import MapLegend from '../components/MapLegend'
import type { MapEvent, MapLayer } from '../types'

import { MAPTILER_KEY, MAP_STYLE, START_CENTER, START_ZOOM } from '../map/config'

// The editor is only downloaded when an admin is logged in. Visitors never load it.
const MapEditor = lazy(() => import('../components/MapEditor'))

const REFRESH_MS = 60_000
const ALERTS_REFRESH_MS = 10_000 // siren alerts change fast

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [status, setStatus] = useState<string | null>('Loading events…')
  const [eventCount, setEventCount] = useState(0)

  // Frontlines
  const [map, setMap] = useState<maplibregl.Map | null>(null) // set once the map is ready for shapes
  const [layers, setLayers] = useState<MapLayer[]>([])
  const [editingName, setEditingName] = useState<string | null>(null) // layer open in the editor

  // Logged in as admin → show the editing panel. (The backend still checks the token on every save.)
  const isAdmin = localStorage.getItem(TOKEN_KEY) !== null

  async function loadLayers() {
    try {
      setLayers(await fetchLayers())
    } catch (err) {
      console.error('Could not load frontlines', err)
    }
  }

  // 1. Create the map once, then add the bases and airports
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

    // Bases and airports (loaded once — they don't move)
    fetchLocations()
      .then((locations) => {
        if (mapRef.current === map) addLocationMarkers(map, locations)
      })
      .catch((err) => console.error('Could not load bases and airports', err))

    // Frontlines and alerts need the map style to be ready, so wait for 'load'
    map.on('load', async () => {
      await setupShapeLayers(map)
      setupAlertLayers(map) // after the shapes, so alerts are drawn on top
      if (mapRef.current === map) setMap(map)
    })
    loadLayers()

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 2. Draw the frontlines. The layer open in the editor is hidden here (the editor shows it instead).
  useEffect(() => {
    if (map) showShapes(map, layers.filter((layer) => layer.name !== editingName))
  }, [map, layers, editingName])

  // 3. Siren alerts of the last hour, refreshed every 10 seconds
  useEffect(() => {
    if (!map) return

    async function load() {
      try {
        showAlerts(map!, await fetchAlerts(60))
      } catch (err) {
        console.error('Could not load alerts', err)
      }
    }

    load()
    const timer = setInterval(load, ALERTS_REFRESH_MS)
    return () => clearInterval(timer)
  }, [map])

  // 4. Load events now and every minute
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const events = await fetchEvents()
        if (cancelled || !mapRef.current) return
        drawMarkers(mapRef.current, events)
        setEventCount(events.length)
        setStatus(events.length === 0 ? 'No confirmed events in the last 7 days' : null)
      } catch {
        if (!cancelled) setStatus('Could not load events — is the backend running?')
      }
    }

    function drawMarkers(map: maplibregl.Map, events: MapEvent[]) {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = events.map((event) =>
        new maplibregl.Marker({ color: event.color ?? '#E53935' })
          .setLngLat([event.lng, event.lat])
          .setPopup(new maplibregl.Popup({ offset: 25 }).setDOMContent(eventPopup(event)))
          .addTo(map),
      )
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

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

      <MapLegend />

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