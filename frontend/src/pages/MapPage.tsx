import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import { fetchLocations } from '../api/locations'
import { fetchLayers } from '../api/layers'
import { fetchAlerts } from '../api/alerts'
import { TOKEN_KEY } from '../api/client'
import { setupLocationLayers, showLocations } from '../map/locationsLayer'
import { setupEventLayers, showEvents } from '../map/Eventslayer'
import { arePopupsEnabled, enableShapePopups, setupShapeLayers, showShapes } from '../map/shapesLayer'
import { setupAlertLayers, showAlerts, ALERT_MINUTES } from '../map/alertsLayer'
import { computeReach, highlightReach, reachBounds, setupReachLayers, showReach } from '../map/reachLayer'
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
import DefencePanel from '../components/Defencepanel'
import { computeCoverage, coverageBounds, defenceColor as shadeOf, DEFENCE_TYPES, setupDefenceLayers, showCoverages, startRadarSweep, type CoverageShape } from '../map/Defencelayer'
import NewsPanel from '../components/Newspanel'
import type { AlertsResponse, MapEvent, MapLayer, MapLocation, Weapon } from '../types'

// The editor is only downloaded when an admin is logged in. Visitors never load it.
const MapEditor = lazy(() => import('../components/MapEditor'))
const MapItemEditor = lazy(() => import('../components/MapItemEditor'))
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
  // Admin: editing bases and events on the map. The open one is hidden from the normal display.
  const [itemEditorOn, setItemEditorOn] = useState(false)
  const [hiddenItem, setHiddenItem] = useState<{ location: number | null; event: number | null }>({ location: null, event: null })
  const [closeItemEditor, setCloseItemEditor] = useState(0) // goes up when the ruler or a weapon needs map clicks
  const isAdmin = localStorage.getItem(TOKEN_KEY) !== null

  // Is the news box (right side) open? Read when zooming, so the map leaves room for it.
  // A ref, not state: changing it doesn't need to redraw the page.
  const newsOpen = useRef(false)
  const testModeRef = useRef(false) // while testing, the Air defence box is on the right
  const rightRoom = () => (newsOpen.current || testModeRef.current ? 360 : 70) // 360 = the right box + the zoom buttons

  const [weapons, setWeapons] = useState<Weapon[]>([])

  // "Test the weapon reach" mode: the weapons and air defence boxes show, the news hides
  const [testMode, setTestMode] = useState(false)
  testModeRef.current = testMode
  const [defenceId, setDefenceId] = useState<number | null>(null) // the air defence system whose coverage is shown
  const [defenceAll, setDefenceAll] = useState(false) // "Show all together": every system of the country at once
  const [coverageLoading, setCoverageLoading] = useState(false)

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
    const measure = new MeasureControl(() => {
      setPlacing(null)
      setCloseItemEditor((n) => n + 1)
    })
    map.addControl(measure, 'top-right')
    measureRef.current = measure
    mapRef.current = map

    // Frontlines and alerts need the map style to be ready, so wait for 'load'
    map.on('load', async () => {
      await setupShapeLayers(map)
      setupAlertLayers(map) // after the shapes, so alerts are drawn on top
      setupReachLayers(map)
      setupWeaponLayers(map)
      setupDefenceLayers(map) // under the bases, so the site icons stay on top of the coverage
      await setupLocationLayers(map) // bases and events last, so they're drawn on top
      setupEventLayers(map) // events above bases
      if (mapRef.current === map) setMap(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [])

  // ---------- 2. Load the data ----------

  function loadLocations() {
    fetchLocations()
      .then(setLocations)
      .catch((err) => console.error('Could not load bases and airports', err))
  }

  async function loadEvents() {
    try {
      setEvents(await fetchEvents())
      setStatus(null)
    } catch {
      setStatus('Could not load events — is the backend running?')
    }
  }

  // Bases and frontlines: once (they rarely change)
  useEffect(() => {
    loadLocations()
    loadLayers()
    fetchWeapons()
      .then(setWeapons)
      .catch((err) => console.error('Could not load weapons', err))
  }, [])

  // Events: now and every minute
  useEffect(() => {
    loadEvents()
    const timer = setInterval(loadEvents, EVENTS_REFRESH_MS)
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

  // Weapons split in two: attack (Weapons box) and air defence + radars (Air defence box)
  const isDefence = (w: Weapon) => DEFENCE_TYPES.includes(w.type_code)
  const attackWeapons = weapons.filter((w) => !isDefence(w))
  const defenceWeapons = weapons.filter(isDefence)
  // Blue by range (light = short, dark = long), radars grey. The same color in the box and on the map.
  const defenceColor = (w: Weapon) => shadeOf(w, defenceWeapons)
  // How many sites on the map have each system
  const sitesOf = (w: Weapon) => locations.filter((l) => l.weapon_id === w.id).length

  // Bases and airports: only the switched-on types, only the selected country
  useEffect(() => {
    if (!map) return
    const shown = locations.filter(
      (l) => l.id !== hiddenItem.location && visible[l.type_code as Category] !== false && inCountry(l.country_code, country),
    )
    // Air defence sites show their system in the popup, e.g. "Iron Dome · 70 km"
    const systems = new Map(defenceWeapons.map((w) => [w.id, `${w.name} · ${w.range_km.toLocaleString()} km`]))
    showLocations(map, shown, systems) // the map groups them into clusters by itself
  }, [map, locations, visible, country, hiddenItem.location, weapons])

  // Reach from the border of the selected country: one ring per distance its weapons reach
  useEffect(() => {
    if (!map || !reachOn || country === ALL) return
    const kms = attackWeapons.filter((w) => w.country_code === country).map((w) => w.range_km)
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

  // Events: the selected country only, or none when switched off. The map groups them into clusters by itself.
  useEffect(() => {
    if (!map) return
    showEvents(map, visible.events ? events.filter((e) => e.id !== hiddenItem.event && inCountry(e.country_code, country)) : [])
  }, [map, events, visible.events, country, hiddenItem.event])

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

  // Air defence coverage: one chosen system, or all the country's systems together.
  // Each system's range around all its sites, merged into one shape.
  useEffect(() => {
    if (!map) return
    const chosen = defenceAll
      ? defenceWeapons.filter((w) => w.country_code === country)
      : defenceWeapons.filter((w) => w.id === defenceId)
    if (chosen.length === 0) {
      showCoverages(map, [])
      return
    }
    let cancelled = false // a late answer for an old choice is ignored
    setCoverageLoading(true)

    // Radars also get the radar look: rings and a turning beam around each radar site
    const radars = chosen
      .filter((w) => w.type_code === 'radar')
      .flatMap((w) =>
        locations
          .filter((l) => l.weapon_id === w.id)
          .map((l) => ({ center: [l.lng, l.lat] as [number, number], km: w.range_km, color: defenceColor(w) })),
      )
    const stopSweep = startRadarSweep(map, radars)

    Promise.all(
      // Biggest range first: drawn underneath, so the smaller ones stay visible on top
      [...chosen]
        .sort((a, b) => b.range_km - a.range_km)
        .map(async (system): Promise<CoverageShape | null> => {
          const sites = locations.filter((l) => l.weapon_id === system.id).map((l) => [l.lng, l.lat] as [number, number])
          const coverage = await computeCoverage(sites, system.range_km)
          const label = `${system.name} · ${system.range_km.toLocaleString()} km`
          return coverage && { coverage, color: defenceColor(system), label, dashed: system.type_code === 'radar' }
        }),
    )
      .then((results) => {
        if (cancelled) return
        const shapes = results.filter((r): r is CoverageShape => r !== null)
        showCoverages(map, shapes)
        if (shapes.length > 0) {
          const padding = window.innerWidth > 600 ? { top: 80, bottom: 40, left: 290, right: rightRoom() } : 30
          map.fitBounds(coverageBounds(shapes.map((s) => s.coverage)), { padding, duration: 800 })
        }
      })
      .catch((err) => console.error('Could not draw the coverage', err))
      .finally(() => !cancelled && setCoverageLoading(false))
    return () => {
      cancelled = true
      stopSweep()
    }
  }, [map, defenceId, defenceAll, country, locations, weapons])

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
    setCloseItemEditor((n) => n + 1)
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
    setDefenceId(null) // so does the air defence coverage
    setDefenceAll(false)
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

  // Leave "Test the weapon reach": clear everything it drew, the news comes back
  function closeTestMode() {
    setTestMode(false)
    setPlacing(null)
    setPlaced([])
    setReachOn(false)
    setReachError('')
    setDefenceId(null)
    setDefenceAll(false)
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

  // Phones have no room on the right: the Air defence box stays on the left there
  const narrow = window.innerWidth <= 600
  const defencePanel = (
        <DefencePanel
            systems={defenceWeapons.filter((w) => inCountry(w.country_code, country))}
            colorOf={defenceColor}
            sitesOf={sitesOf}
            selectedId={defenceId}
            onSelect={(id) => {
              setDefenceAll(false) // one system: leave "all together"
              setDefenceId(id)
            }}
            allOn={defenceAll}
            onToggleAll={() => {
              setDefenceId(null)
              setDefenceAll((on) => !on)
            }}
            loading={coverageLoading}
            placed={placed.filter((p) => isDefence(p.weapon))}
            placing={placing && isDefence(placing) ? placing : null}
            // The placed ring takes the system's color (the weapons layer colors rings by side_color)
            onPlace={(w) => setPlacing({ ...w, side_color: defenceColor(w) })}
            onCancelPlacing={() => setPlacing(null)}
            onRemove={(id) => setPlaced((list) => list.filter((p) => p.id !== id))}
            onClearAll={() => setPlaced((list) => list.filter((p) => !isDefence(p.weapon)))}
            showCountries={country === ALL}
            onSelectCountry={selectCountry}
          />
  )

  return (
    <>
      <div ref={containerRef} className="map" />

      <CountryTabs countries={countries} selected={country} onSelect={selectCountry} />

      {/* Left side: messages and the weapons box on top, the map key at the bottom.
          They share the height of the screen, so they never cover each other. */}
      <div className="map-side">
        {status && <div className="map-panel status">{status}</div>}
        {testMode ? (
          <>
            {/* Test mode: a bar to leave it, then the two boxes */}
            <div className="map-panel test-bar">
              <span>Testing weapon reach</span>
              <button type="button" className="test-close" onClick={closeTestMode} aria-label="Close the weapon reach test">
                ×
              </button>
            </div>
            <WeaponsPanel
              weapons={attackWeapons.filter((w) => inCountry(w.country_code, country))}
              placed={placed.filter((p) => !isDefence(p.weapon))}
              placing={placing && !isDefence(placing) ? placing : null}
              onPlace={setPlacing}
              onCancelPlacing={() => setPlacing(null)}
              onRemove={(id) => setPlaced((list) => list.filter((p) => p.id !== id))}
              onClearAll={() => setPlaced((list) => list.filter((p) => isDefence(p.weapon)))}
              reach={country === ALL ? null : { countryName: countryName(country), on: reachOn, loading: reachLoading, error: reachError }}
              onToggleReach={() => setReachOn((on) => !on)}
              onHoverWeapon={(km) => map && reachOn && highlightReach(map, km)}
              showCountries={country === ALL}
              onSelectCountry={selectCountry}
            />
            {narrow && defencePanel /* phones: no room on the right, it stays under the weapons */}
          </>
        ) : (
          <div className="map-panel test-start">
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                newsOpen.current = false // the news hides: the map no longer leaves room for it
                setTestMode(true)
              }}
            >
              Test the weapon reach
            </button>
          </div>
        )}
        <MapLegend
          visible={visible}
          onToggle={toggle}
          onShowAll={showAll}
          sides={sidesInCountry(layers, country)}
          hiddenSides={hiddenSides}
          onToggleSide={toggleSide}
          autoFold={testMode && narrow} // phones: the two boxes need the room
        />
      </div>

      {/* Right side: the map editor (admins only) on top, the news under it. Same idea as the left side. */}
      <div className="map-side map-side-right">
        {isAdmin && map && (
          <Suspense fallback={null}>
            <MapItemEditor
              map={map}
              locations={locations}
              events={events}
              systems={defenceWeapons}
              defaultCountry={country === ALL ? '' : country}
              disabled={editingName !== null}
              closeSignal={closeItemEditor}
              onActiveChange={(on) => {
                setItemEditorOn(on)
                if (on) {
                  setPlacing(null) // map clicks are for editing now
                  measureRef.current?.stop()
                }
              }}
              onHide={setHiddenItem}
              onSaved={(kind) => (kind === 'location' ? loadLocations() : loadEvents())}
            />
            {/* One editor at a time: the frontline editor waits while bases & events are being edited */}
            {!itemEditorOn && <MapEditor map={map} layers={layers} onEditingChange={setEditingName} onSaved={loadLayers} />}
          </Suspense>
        )}
        {/* While testing the weapon reach: the Air defence box takes the news' place */}
        {testMode ? !narrow && defencePanel : <NewsPanel onOpenChange={(open) => (newsOpen.current = open)} />}
      </div>
    </>
  )
}