import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { fetchEvents } from '../api/events'
import { fetchLocations } from '../api/locations'
import { fetchLayers } from '../api/layers'
import { fetchAlerts } from '../api/alerts'
import { TOKEN_KEY } from '../api/client'
import { setBaseClickHandler, setupLocationLayers, showLocations } from '../map/locationsLayer'
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
import Sidebar, { type View } from '../components/Sidebar'
import EventsFeed from '../components/EventsFeed'
import { useNews, type NewsLang } from '../hooks/useNews'
import { MeasureControl } from '../map/Measuretool'
import { ClusterControl } from '../map/clusterControl'
import { enableFileIcons } from '../map/fileIcons'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { MAPTILER_KEY, MAP_STYLE, START_CENTER, START_ZOOM } from '../map/config'
import { fetchWeapons } from '../api/weapons'
import { rangeBounds, setupWeaponLayers, showWeapons, type PlacedWeapon } from '../map/weaponsLayer'
import WeaponsPanel from '../components/WeaponsPanel'
import DefencePanel from '../components/Defencepanel'
import { computeCoverage, coverageBounds, defenceColor as shadeOf, DEFENCE_TYPES, setupDefenceLayers, showCoverages, startRadarSweep } from '../map/Defencelayer'
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
  // News: loaded once here, shown short on the Map page and in full on the News page.
  // Only the selected country's news ("All countries" → all of it).
  const [newsLang, setNewsLang] = useState<NewsLang>('all')
  const { news, error: newsError, loaded: newsLoaded } = useNews(newsLang, country === ALL ? undefined : country)

  // The ruler button (measure distance). Kept so placing a weapon can close it.
  const measureRef = useRef<MeasureControl | null>(null)
  const [hiddenSides, setHiddenSides] = useState<number[]>([]) // side ids switched off (reset when the country changes)
  const [hiddenLayers, setHiddenLayers] = useState<string[]>([]) // layer names switched off in the map key (reset too)
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

  // Room to leave on the right when zooming to something: the zoom buttons.
  // Admins have the editor there too (410 = its wider column).
  const rightRoom = () => (isAdmin ? 410 : 70)

  const [weapons, setWeapons] = useState<Weapon[]>([])

  // The page open in the side panel: Map, Events, News or Weapon reach
  // ("Weapon reach" shows the weapons and air defence boxes; leaving it clears what they drew)
  const [view, setView] = useState<View>('map')

  const [newsSeenAt, setNewsSeenAt] = useState(() => Date.now()) // "new" = arrived after this time
  const [defenceId, setDefenceId] = useState<number | null>(null) // the air defence system whose coverage is shown
  const [siteRangeId, setSiteRangeId] = useState<number | null>(null) // the base clicked on the map (its range shows if it's an air defence site)
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
    map.addControl(new ClusterControl(), 'top-right') // under the ruler: group nearby bases and events
    measureRef.current = measure
    mapRef.current = map

    // Frontlines and alerts need the map style to be ready, so wait for 'load'
    map.on('load', async () => {
      enableFileIcons(map) // icons from KMZ files, loaded when a pin needs one
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
    showLocations(map, shown, systems) // grouped only when the Group button is on
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
        const padding = window.innerWidth > 600 ? { top: 40, bottom: 40, left: 40, right: rightRoom() } : 30
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

  // Events: the selected country only, or none when switched off. Grouped only when the Group button is on.
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
        (l) =>
          l.name !== editingName &&
          inCountry(l.country_code, country) &&
          !hiddenSides.includes(l.side_id) &&
          !hiddenLayers.includes(l.name),
      )
      .map((l) => ({
        ...l,
        geojson: { ...l.geojson, features: l.geojson.features.filter((f) => keepShape(f, visible)) },
      }))
    showShapes(map, shown)
  }, [map, layers, editingName, visible, country, hiddenSides, hiddenLayers])

  // Siren alerts: only in the "All" and Israel tabs, only the switched-on types
  useEffect(() => {
    if (!map) return
    const types = inCountry(ALERTS_COUNTRY, country) ? visibleAlertTypes(visible) : []
    showAlerts(map, { ...alerts, alerts: alerts.alerts.filter((a) => types.includes(a.type)) })
  }, [map, alerts, visible, country])

  // The air defence site the visitor clicked on the map, and its system (null = not an air defence site)
  const rangeSite = siteRangeId === null ? undefined : locations.find((l) => l.id === siteRangeId)
  const rangeSystem = rangeSite?.weapon_id ? defenceWeapons.find((w) => w.id === rangeSite.weapon_id) : undefined

  // A click on an air defence site replaces the system chosen in the Air defence box (one range at a time)
  useEffect(() => {
    if (rangeSystem) setDefenceId(null)
  }, [siteRangeId])

  // Air defence range on the map: the clicked site alone, or every site of the system chosen in the box.
  useEffect(() => {
    if (!map) return
    // Which system, and from which points
    let system: Weapon | undefined
    let sites: [number, number][] = []
    if (rangeSite && rangeSystem) {
      system = rangeSystem
      sites = [[rangeSite.lng, rangeSite.lat]]
    } else if (defenceId !== null) {
      system = defenceWeapons.find((w) => w.id === defenceId)
      sites = locations.filter((l) => l.weapon_id === defenceId).map((l) => [l.lng, l.lat])
    }
    if (!system || sites.length === 0) {
      showCoverages(map, [])
      return
    }
    const chosen = system // a const copy: TypeScript knows it's set inside the .then() below
    let cancelled = false // a late answer for an old choice is ignored
    setCoverageLoading(true)

    // Radars also get the radar look: rings and a turning beam around each site
    const color = defenceColor(chosen)
    const stopSweep = startRadarSweep(
      map,
      chosen.type_code === 'radar' ? sites.map((center) => ({ center, km: chosen.range_km, color })) : [],
    )

    computeCoverage(sites, chosen.range_km)
      .then((coverage) => {
        if (cancelled || !coverage) return
        const label = `${chosen.name} · ${chosen.range_km.toLocaleString()} km`
        showCoverages(map, [{ coverage, color, label, dashed: chosen.type_code === 'radar' }])
        // Zoom so the whole range is visible
        const padding = window.innerWidth > 600 ? { top: 40, bottom: 40, left: 40, right: rightRoom() } : 30
        map.fitBounds(coverageBounds([coverage]), { padding, duration: 800 })
      })
      .catch((err) => console.error('Could not draw the coverage', err))
      .finally(() => !cancelled && setCoverageLoading(false))
    return () => {
      cancelled = true
      stopSweep()
    }
  }, [map, defenceId, siteRangeId, country, locations, weapons])

  // Clicking a base on the map opens its popup. If it's an air defence site, its range shows (effect above)
  // until the popup closes.
  useEffect(() => {
    setBaseClickHandler((id, popup) => {
      setSiteRangeId(id)
      popup.on('close', () => setSiteRangeId((current) => (current === id ? null : current))) // another site may be open by now
    })
    return () => setBaseClickHandler(null)
  }, [])

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
      const padding = window.innerWidth > 600 ? { top: 40, bottom: 40, left: 40, right: rightRoom() } : 30
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
    setSiteRangeId(null)
    setHiddenSides([]) // each country starts with all its sides shown
    setHiddenLayers([]) // and all its layers
    if (!map) return
    if (code === ALL) {
      map.flyTo({ center: START_CENTER, zoom: START_ZOOM })
      return
    }
    const box = countryBox(code, locations, events, layers)
    // Leave room for the zoom buttons (right) and the editor for admins. Phones: small margins.
    const padding = window.innerWidth > 600 ? { top: 40, bottom: 40, left: 40, right: rightRoom() } : 40
    if (box) map.fitBounds(box, { padding, maxZoom: 9 })
  }

  // Leave "Weapon reach": clear everything it drew
  function closeTestMode() {
    setPlacing(null)
    setPlaced([])
    setReachOn(false)
    setReachError('')
    setDefenceId(null)
  }

  // A page of the side panel was chosen
  function changeView(next: View) {
    if (view === 'reach' && next !== 'reach') closeTestMode()
    if (next === 'news') setNewsSeenAt(Date.now()) // the visitor has seen them now
    setView(next)
  }

  // Events page: fly to the event that was clicked
  function showEvent(e: MapEvent) {
    map?.flyTo({ center: [e.lng, e.lat], zoom: Math.max(map.getZoom(), 9) })
  }

  function toggle(category: Category) {
    setVisible((v) => ({ ...v, [category]: !v[category] }))
  }

  function toggleSide(sideId: number) {
    setHiddenSides((hidden) => (hidden.includes(sideId) ? hidden.filter((id) => id !== sideId) : [...hidden, sideId]))
  }

  function toggleLayer(name: string) {
    setHiddenLayers((hidden) => (hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name]))
  }

  const countries = findCountries(locations, events, layers)

  // The newest frontline date of the selected country, e.g. "21 November 2026"
  const frontlineDate = layers
    .filter((l) => country !== ALL && l.country_code === country)
    .map((l) => l.snapshot_date)
    .sort()
    .pop()
  const newNews = view === 'news' ? 0 : news.filter((n) => new Date(n.published_at).getTime() > newsSeenAt).length

  // News titles follow the country: "Latest from Yemen", or "Latest news" for all countries
  const newsTitle = country === ALL ? 'Latest news' : `Latest from ${countryName(country)}`
  const newsEmpty = country === ALL ? 'No news in the last day.' : `No news about ${countryName(country)} in the last day.`

  // What the side panel shows under the country picker, for each page
  let page
  if (view === 'map') {
    page = (
      <>
        <p className="side-note side-intro">
          {country === ALL
            ? 'Choose a country to see its frontlines.'
            : frontlineDate
              ? `Frontlines as of ${new Date(frontlineDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. Areas are approximate and change often.`
              : 'No frontlines drawn for this country yet.'}
        </p>
        <NewsPanel
          title={newsTitle}
          emptyText={newsEmpty}
          news={news}
          error={newsError}
          loaded={newsLoaded}
          lang={newsLang}
          onLang={setNewsLang}
          limit={5}
          onShowAll={() => changeView('news')}
        />
      </>
    )
  } else if (view === 'events') {
    const shown = events
      .filter((e) => inCountry(e.country_code, country))
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
    page = <EventsFeed events={shown} onPick={showEvent} />
  } else if (view === 'news') {
    page = (
      <NewsPanel title={newsTitle} emptyText={newsEmpty} news={news} error={newsError} loaded={newsLoaded} lang={newsLang} onLang={setNewsLang} />
    )
  } else {
    page = (
      <>
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
        <DefencePanel
          systems={defenceWeapons.filter((w) => inCountry(w.country_code, country))}
          colorOf={defenceColor}
          sitesOf={sitesOf}
          selectedId={defenceId}
          onSelect={(id) => {
            setSiteRangeId(null) // a system from the box replaces the site clicked on the map
            setDefenceId(id)
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
      </>
    )
  }

  return (
    <div className="app">
      <Sidebar view={view} onView={changeView} newCount={newNews} countries={countries} country={country} onSelectCountry={selectCountry}>
        {page}
      </Sidebar>

      <div className="map-area">
        <div ref={containerRef} className="map" />

        {status && <div className="map-panel status">{status}</div>}

        <MapLegend
          sides={sidesInCountry(layers, country)}
          allCountries={country === ALL}
          hiddenSides={hiddenSides}
          onToggleSide={toggleSide}
          hiddenLayers={hiddenLayers}
          onToggleLayer={toggleLayer}
          showSirens={inCountry(ALERTS_COUNTRY, country)}
          visible={visible}
          onToggle={toggle}
        />

        {/* Right side: the map editors (admins only), left of the zoom buttons */}
        {isAdmin && map && (
          <div className="map-side map-side-right with-editor">
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
              {!itemEditorOn && <MapEditor map={map} country={country} onEditingChange={setEditingName} onSaved={loadLayers} />}
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}