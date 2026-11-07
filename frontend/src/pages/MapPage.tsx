import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import { fetchLocations } from '../api/locations'
import { fetchLayers } from '../api/layers'
import { fetchAlerts } from '../api/alerts'
import { TOKEN_KEY } from '../api/client'
import { setupLocationLayers, showLocations } from '../map/locationsLayer'
import { arePopupsEnabled, enableShapePopups, setupShapeLayers, showShapes } from '../map/shapesLayer'
import { setupAlertLayers, showAlerts, ALERT_MINUTES } from '../map/alertsLayer'
import { computeReach, highlightReach, reachBounds, setupReachLayers, showReach } from '../map/reachLayer'
import { buildPopup } from '../map/popup'
import {
  ALL,
  ALL_VISIBLE,
  ALERTS_COUNTRY,
  countryBox,
  countryName,
  findCountries,
  inCountry,
  keepShape,
  sidesInCountry,
  visibleAlertTypes,
  type Category,
  type Visible,
} from '../map/filters'
import MapLegend from '../components/MapLegend'
import { MeasureControl } from '../map/Measuretool'
import CountryTabs from '../components/CountryTabs'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MAPTILER_KEY, MAP_STYLE, START_CENTER, START_ZOOM } from '../map/config'
import { fetchWeapons } from '../api/weapons'
import { rangeBounds, setupWeaponLayers, showWeapons, type PlacedWeapon } from '../map/weaponsLayer'
import WeaponsPanel from '../components/WeaponsPanel'
import NewsPanel from '../components/Newspanel'
import type { AlertsResponse, MapEvent, MapLayer, MapLocation, Weapon } from '../types'

// The editor is only downloaded when an admin is logged in. Visitors never load it.
const MapEditor = lazy(() => import('../components/MapEditor'))
maplibregl.setWorkerUrl(workerUrl)
const EVENTS_REFRESH_MS = 60_000
const ALERTS_REFRESH_MS = 10_000 // siren alerts change fast

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [map, setMap] = useState<maplibregl.Map | null>(null) // set once the map is ready
  const nextPlacedId = useRef(1) // a number for each placed weapon
  // Data from the backend
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [events, setEvents] = useState<MapEvent[]>([])
  const [layers, setLayers] = useState<MapLayer[]>([])
  const [alerts, setAlerts] = useState<AlertsResponse>({ alerts: [], areas: [] })
  const [status, setStatus] = useState<string | null>('Loading events…')

  // What the visitor chose (reset on every visit)
  const [country, setCountry] = useState(ALL)
  const [visible, setVisible] = useState<Visible>(ALL_VISIBLE)

  // The ruler button (measure distance). Kept so placing a weapon can close it.
  const measureRef = useRef<MeasureControl | null>(null)
  const [hiddenSides, setHiddenSides] = useState<number[]>([]) // side ids switched off (reset when the country changes)
  const [placed, setPlaced] = useState<PlacedWeapon[]>([]) // weapons the visitor put on the map (gone after a refresh)
  const [placing, setPlacing] = useState<Weapon | null>(null) // chosen in the panel, waiting for a click on the map
  const justPlacedId = useRef<number | undefined>(undefined) // the weapon whose ring should grow when drawn
  // Admin: the layer open in the editor is hidden from the normal display
  const [editingName, setEditingName] = useState<string | null>(null)
  const isAdmin = localStorage.getItem(TOKEN_KEY) !== null

  // Is the news box (right side) open? Read when zooming, so the map leaves room for it.
  // A ref, not state: changing it doesn't need to redraw the page.
  const newsOpen = useRef(false)
  const rightRoom = () => (newsOpen.current ? 360 : 70) // 360 = the news box + the zoom buttons

  const [weapons, setWeapons] = useState<Weapon[]>([])

  const [reachOn, setReachOn] = useState(false) // "reach from the border" of the selected country
  const [reachLoading, setReachLoading] = useState(false)
  const [reachError, setReachError] = useState('')

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
    // Under the zoom buttons. Starting to measure cancels placing a weapon (both use map clicks).
    const measure = new MeasureControl(() => setPlacing(null))
    map.addControl(measure, 'top-right')
    measureRef.current = measure
    mapRef.current = map

    // Frontlines and alerts need the map style to be ready, so wait for 'load'
    map.on('load', async () => {
      await setupShapeLayers(map)
      setupAlertLayers(map) // after the shapes, so alerts are drawn on top
      setupReachLayers(map)
      setupWeaponLayers(map)
      await setupLocationLayers(map) // last, so bases are drawn on top
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
    fetchWeapons()
      .then(setWeapons)
      .catch((err) => console.error('Could not load weapons', err))
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
    showLocations(map, shown) // the map groups them into clusters by itself
  }, [map, locations, visible, country])

  // Reach from the border of the selected country: one ring per distance its weapons reach
  useEffect(() => {
    if (!map || !reachOn || country === ALL) return
    const kms = weapons.filter((w) => w.country_code === country).map((w) => w.range_km)
    let stop = () => {}
    let cancelled = false

    setReachLoading(true)
    setReachError('')
    computeReach(country, kms)
      .then((reach) => {
        if (cancelled) return
        if (!reach) {
          setReachError('There is no border shape for this country.')
          setReachLoading(false)
          setReachOn(false)
          return
        }
        stop = showReach(map, reach)
        const padding = window.innerWidth > 600 ? { top: 80, bottom: 40, left: 280, right: rightRoom() } : 30
        map.fitBounds(reachBounds(reach), { padding, duration: 800 })
      })
      .catch(() => !cancelled && setReachError('Could not draw the reach. Check your connection and try again.'))
      .finally(() => !cancelled && setReachLoading(false))

    return () => {
      cancelled = true // the answer may arrive after the visitor switched country: ignore it then
      stop()
      showReach(map, null)
    }
  }, [map, reachOn, country, weapons])

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

  // Placed weapons: the newest one's ring grows once
  useEffect(() => {
    if (!map) return
    const stop = showWeapons(map, placed, justPlacedId.current)
    justPlacedId.current = undefined // only once
    return stop
  }, [map, placed])

  // Placing a weapon: the next click on the map puts it there. Esc cancels.
  useEffect(() => {
    if (!map || !placing) return
    measureRef.current?.stop() // both use map clicks: placing wins
    const popupsBefore = arePopupsEnabled()
    enableShapePopups(false) // this click is for placing, not for opening popups
    map.getCanvas().style.cursor = 'crosshair'

    function onClick(e: maplibregl.MapMouseEvent) {
      const weapon = placing!
      const center: [number, number] = [e.lngLat.lng, e.lngLat.lat]
      const id = nextPlacedId.current++
      justPlacedId.current = id
      setPlaced((list) => [...list, { id, weapon, center }])
      setPlacing(null)
      // Show the whole reach: zoom so the circle fits (room for the box on the left and the zoom buttons on the right)
      const padding = window.innerWidth > 600 ? { top: 80, bottom: 40, left: 280, right: rightRoom() } : 30
      map!.fitBounds(rangeBounds(center, weapon.range_km), { padding, duration: 800 })
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPlacing(null)
    }
    map.once('click', onClick)
    window.addEventListener('keydown', onKey)

    return () => {
      map.off('click', onClick)
      window.removeEventListener('keydown', onKey)
      map.getCanvas().style.cursor = ''
      // Turn popups back on a moment later, so this same click doesn't open one
      setTimeout(() => enableShapePopups(popupsBefore), 0)
    }
  }, [map, placing])

  // ---------- 4. Visitor actions ----------

  // Country tab: filter, then zoom to that country ("All" → back to the start view)
  function selectCountry(code: string) {
    setCountry(code)
    setReachOn(false) // the reach belongs to one country
    setReachError('')
    setHiddenSides([]) // each country starts with all its sides shown
    if (!map) return
    if (code === ALL) {
      map.flyTo({ center: START_CENTER, zoom: START_ZOOM })
      return
    }
    const box = countryBox(code, locations, events, layers)
    // Leave room for the tabs (top), the box (left) and the zoom buttons (right). Phones: small margins.
    const padding = window.innerWidth > 600 ? { top: 90, bottom: 40, left: 290, right: rightRoom() } : 40
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

  return (
    <>
      <div ref={containerRef} className="map" />

      <CountryTabs countries={countries} selected={country} onSelect={selectCountry} />

      {/* Left side: messages and the weapons box on top, the map key at the bottom.
          They share the height of the screen, so they never cover each other. */}
      <div className="map-side">
        {status && <div className="map-panel status">{status}</div>}
        <WeaponsPanel
          weapons={weapons.filter((w) => inCountry(w.country_code, country))}
          placed={placed}
          placing={placing}
          onPlace={setPlacing}
          onCancelPlacing={() => setPlacing(null)}
          onRemove={(id) => setPlaced((list) => list.filter((p) => p.id !== id))}
          onClearAll={() => setPlaced([])}
          reach={country === ALL ? null : { countryName: countryName(country), on: reachOn, loading: reachLoading, error: reachError }}
          onToggleReach={() => setReachOn((on) => !on)}
          onHoverWeapon={(km) => map && reachOn && highlightReach(map, km)}
          showCountries={country === ALL}
          onSelectCountry={selectCountry}
        />
        <MapLegend
          visible={visible}
          onToggle={toggle}
          onShowAll={showAll}
          sides={sidesInCountry(layers, country)}
          hiddenSides={hiddenSides}
          onToggleSide={toggleSide}
          autoFold={country !== ALL && weapons.some((w) => w.country_code === country)}
        />
      </div>

      {/* Right side: the map editor (admins only) on top, the news under it. Same idea as the left side. */}
      <div className="map-side map-side-right">
        {isAdmin && map && (
          <Suspense fallback={null}>
            <MapEditor map={map} layers={layers} onEditingChange={setEditingName} onSaved={loadLayers} />
          </Suspense>
        )}
        <NewsPanel onOpenChange={(open) => (newsOpen.current = open)} />
      </div>
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