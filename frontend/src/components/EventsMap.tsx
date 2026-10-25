import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import type { MapEvent } from '../types'

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

  // 1. Create the map once
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
          .setPopup(new maplibregl.Popup({ offset: 25 }).setDOMContent(buildPopup(event)))
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
      {status && <div className="status">{status}</div>}
    </>
  )
}

// Built with textContent (not innerHTML) so event text can never inject HTML.
function buildPopup(event: MapEvent): HTMLElement {
  const root = document.createElement('div')
  root.className = 'popup'

  const add = (tag: string, text: string, className?: string) => {
    const el = document.createElement(tag)
    el.textContent = text
    if (className) el.className = className
    root.appendChild(el)
  }

  add('h3', event.title)
  add('p', event.type_name, 'type')
  add('p', new Date(event.occurred_at).toLocaleString())
  if (event.location_name) add('p', `Target: ${event.location_name}`)
  if (event.description) add('p', event.description)

  return root
}