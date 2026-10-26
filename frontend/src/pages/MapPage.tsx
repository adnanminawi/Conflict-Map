import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import { fetchLocations } from '../api/locations'
import { addLocationMarkers } from '../map/locationsLayer'
import { buildPopup } from '../map/popup'
import type { MapEvent } from '../types'
import MapLegend from '../components/MapLegend'

// MapTiler map. The key lives in frontend/.env.local (VITE_MAPTILER_KEY).
// Other styles: 'streets-v2' (normal map), 'satellite' (imagery without labels).
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined
const MAP_STYLE = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
const START_CENTER: [number, number] = [53, 30] // [lng, lat] — Iran / Gulf
const START_ZOOM = 4
const REFRESH_MS = 60_000

export default function EventsMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<maplibregl.Marker[]>([])
  const [status, setStatus] = useState<string | null>('Loading events…')
  const [eventCount, setEventCount] = useState(0)

  // 1. Create the map once, then add the bases / airports layer
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

     
    fetchLocations()
      .then((locations) => {
        if (mapRef.current === map) addLocationMarkers(map, locations)
      })
      .catch((err) => console.error('Could not load bases and airports', err))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // 2. Load events now and every minute
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