import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import {
  createEvent,
  createLocation,
  deleteEvent,
  deleteLocation,
  fetchEventTypes,
  fetchLocationTypes,
  updateEvent,
  updateLocation,
} from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import { arePopupsEnabled, enableShapePopups } from '../map/shapesLayer'
import { setPickHandler, type PickKind } from '../map/pickMode'
import { enableDrag, showEditItem } from '../map/Edititemlayer'
import CountrySelect from './CountrySelect'
import IconPicker from './IconPicker'
import type { EventType, LocationType, MapEvent, MapLocation, Weapon } from '../types'

interface Props {
  map: maplibregl.Map
  locations: MapLocation[]
  events: MapEvent[]
  systems: Weapon[] // air defence systems and radars, for the System dropdown of those sites
  defaultCountry: string // the open country tab, for new items ('' = none)
  disabled: boolean // the frontline editor is in use
  closeSignal: number // goes up when something else needs map clicks (ruler, placing a weapon): stop editing
  onActiveChange: (active: boolean) => void
  onHide: (hidden: { location: number | null; event: number | null }) => void // the item being edited is drawn by itself
  onSaved: (kind: PickKind) => void // reload that data
}

// What the admin is editing: a base or an event, existing (id) or new (id = null)
interface Draft {
  kind: PickKind
  id: number | null
  lng: number
  lat: number
  name: string // a base's name / an event's title
  typeCode: string // bases: 'air_defence'…
  weaponId: number | null // air defence / radar sites: the system there
  iconId: number | null // bases: its own picture (null = the icon of its type)
  eventTypeId: number // events
  country: string
  description: string
  occurredAt: string // events, as the date input wants it: '2026-11-09T12:30'
}

type Mode = 'idle' | 'placing-location' | 'placing-event' | 'editing'

// ISO date → the value a datetime-local input wants, in the admin's own time zone
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// The admin's box for bases and events on the map: click one to edit it, drag it to move it, Save.
export default function MapItemEditor({ map, locations, events, systems, defaultCountry, disabled, closeSignal, onActiveChange, onHide, onSaved }: Props) {
  const [active, setActive] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [draft, setDraft] = useState<Draft | null>(null)
  const original = useRef('') // the draft as it was, to know if something changed
  const [locationTypes, setLocationTypes] = useState<LocationType[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // The pick handler is set once; these refs give it the latest data
  const data = useRef({ locations, events, draft })
  data.current = { locations, events, draft }

  const dirty = draft !== null && JSON.stringify(draft) !== original.current

  // The Latitude / Longitude boxes. Kept as text while typing ("33." or "-" are fine half-way);
  // the pin moves as soon as the text is a valid number.
  const [latText, setLatText] = useState('')
  const [lngText, setLngText] = useState('')

  function handleError(err: unknown) {
    setError(isUnauthorized(err) ? 'Your login has expired. Log in again on the admin page.' : getErrorMessage(err))
  }

  function open(next: Draft) {
    original.current = next.id === null ? '' : JSON.stringify(next) // a new item always counts as changed
    setDraft(next)
    setMode('editing')
    setError('')
    setMessage('')
  }

  function close() {
    setDraft(null)
    setMode('idle')
    setError('')
  }

  // ---------- Turning edit mode on and off ----------

  useEffect(() => {
    if (!active) return
    onActiveChange(true)
    // The types for the dropdowns
    fetchLocationTypes().then(setLocationTypes).catch(handleError)
    fetchEventTypes().then(setEventTypes).catch(handleError)

    // Clicks on bases and events now pick them; frontline and siren popups stay closed
    const popupsBefore = arePopupsEnabled()
    enableShapePopups(false)
    setPickHandler((kind, id) => {
      const { locations, events, draft } = data.current
      if (draft && JSON.stringify(draft) !== original.current && !window.confirm('Discard your changes?')) return
      if (kind === 'location') {
        const l = locations.find((x) => x.id === id)
        if (!l) return
        open({
          kind, id, lng: l.lng, lat: l.lat, name: l.name, typeCode: l.type_code, weaponId: l.weapon_id, iconId: l.icon_id ?? null, eventTypeId: 0,
          country: l.country_code, description: l.description ?? '', occurredAt: '',
        })
      } else {
        const e = events.find((x) => x.id === id)
        if (!e) return
        open({
          kind, id, lng: e.lng, lat: e.lat, name: e.title, typeCode: '', weaponId: null, iconId: null, eventTypeId: e.event_type_id,
          country: e.country_code ?? '', description: e.description ?? '', occurredAt: toLocalInput(e.occurred_at),
        })
      }
    })

    return () => {
      setPickHandler(null)
      enableShapePopups(popupsBefore)
      onActiveChange(false)
    }
  }, [active])

  // Something else needs map clicks (the ruler, placing a weapon): stop editing, drop unsaved changes
  const firstSignal = useRef(closeSignal)
  useEffect(() => {
    if (closeSignal === firstSignal.current) return
    close()
    setActive(false)
  }, [closeSignal])

  // Esc closes the open item
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (data.current.draft && JSON.stringify(data.current.draft) !== original.current && !window.confirm('Discard your changes?')) return
      close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  // ---------- Placing a new item: the next click on the map ----------

  useEffect(() => {
    if (mode !== 'placing-location' && mode !== 'placing-event') return
    const canvas = map.getCanvas()
    canvas.style.cursor = 'crosshair'
    const place = (e: maplibregl.MapMouseEvent) => {
      const kind: PickKind = mode === 'placing-location' ? 'location' : 'event'
      open({
        kind, id: null, lng: e.lngLat.lng, lat: e.lngLat.lat, name: '',
        typeCode: locationTypes[0]?.code ?? '', weaponId: null, iconId: null, eventTypeId: eventTypes[0]?.id ?? 0,
        country: defaultCountry, description: '', occurredAt: toLocalInput(new Date().toISOString()),
      })
    }
    map.once('click', place)
    return () => {
      map.off('click', place)
      canvas.style.cursor = ''
    }
  }, [mode])

  // ---------- The item on the map ----------

  // Draw it at its (maybe dragged) position, in its (maybe changed) type's icon
  useEffect(() => {
    if (!draft) {
      showEditItem(map, null)
      return
    }
    let image: string
    if (draft.kind === 'location' && draft.iconId !== null) {
      image = `file-icon-128-${draft.iconId}` // its own picture (loaded when needed, see fileIcons.ts)
    } else if (draft.kind === 'location') {
      image = map.hasImage(`loc-${draft.typeCode}`) ? `loc-${draft.typeCode}` : 'loc-military_base'
    } else {
      const color = eventTypes.find((t) => t.id === draft.eventTypeId)?.color ?? '#E53935'
      image = `pin-${color}`
    }
    showEditItem(map, { lng: draft.lng, lat: draft.lat, image, anchor: draft.kind === 'location' ? 'center' : 'bottom' })
  }, [draft, eventTypes])

  // While an item is open, it can be dragged
  const hasDraft = draft !== null
  useEffect(() => {
    if (!hasDraft) return
    return enableDrag(map, (lng, lat) => setDraft((d) => (d ? { ...d, lng, lat } : d)))
  }, [hasDraft])

  // Hide the item from the normal display while it's open, so it isn't drawn twice
  useEffect(() => {
    onHide({
      location: draft?.kind === 'location' ? draft.id : null,
      event: draft?.kind === 'event' ? draft.id : null,
    })
  }, [draft?.kind, draft?.id])

  // Leaving the page: clean the map
  useEffect(() => () => showEditItem(map, null), [])

  // ---------- Latitude and longitude boxes ----------
  // (Hooks must all run before the "if (!active) return" below, every render, in the same order.)

  const isLat = (n: number) => Number.isFinite(n) && n >= -90 && n <= 90
  const isLng = (n: number) => Number.isFinite(n) && n >= -180 && n <= 180
  const readNumber = (text: string) => (text.trim() === '' ? NaN : Number(text)) // empty is not 0

  // The pin was dragged (or another item opened): write its place in the boxes.
  // Not while typing: "33." is already 33, so the box keeps what the admin typed.
  useEffect(() => {
    if (!draft) return
    if (readNumber(latText) !== draft.lat) setLatText(draft.lat.toFixed(5))
    if (readNumber(lngText) !== draft.lng) setLngText(draft.lng.toFixed(5))
  }, [draft?.lat, draft?.lng])


  // ---------- Save / delete ----------

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) return setError(draft.kind === 'location' ? 'Give it a name.' : 'Give it a title.')
    if (!draft.country) return setError('Choose a country.')
    setBusy(true)
    setError('')
    try {
      if (draft.kind === 'location') {
        const input = {
          type: draft.typeCode, name: draft.name.trim(), country_code: draft.country,
          description: draft.description.trim() || null, lat: draft.lat, lng: draft.lng,
          weapon_id: draft.weaponId,
          icon_id: draft.iconId,
        }
        if (draft.id === null) await createLocation(input)
        else await updateLocation(draft.id, input)
      } else {
        const input = {
          title: draft.name.trim(), description: draft.description.trim(), event_type_id: draft.eventTypeId,
          lat: draft.lat, lng: draft.lng, country_code: draft.country,
          occurred_at: new Date(draft.occurredAt).toISOString(),
          status: 'confirmed' as const, // made on the map = confirmed, so it shows (ignored when changing one)
        }
        if (draft.id === null) await createEvent(input)
        else await updateEvent(draft.id, input)
      }
      onSaved(draft.kind)
      setMessage('Saved.')
      close()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!draft || draft.id === null) return
    const what = draft.kind === 'location' ? 'base' : 'event'
    if (!window.confirm(`Delete this ${what} "${draft.name}"? This can't be undone.`)) return
    setBusy(true)
    setError('')
    try {
      if (draft.kind === 'location') await deleteLocation(draft.id)
      else await deleteEvent(draft.id)
      onSaved(draft.kind)
      setMessage('Deleted.')
      close()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    if (dirty && !window.confirm('Discard your changes?')) return
    close()
  }

  function finish() {
    if (dirty && !window.confirm('Discard your changes?')) return
    close()
    setActive(false)
    setMessage('')
  }

  // ---------- The box ----------

  if (!active) {
    return (
      <div className="map-panel editor">
        <div className="editor-title">Bases &amp; events</div>
        <p className="editor-note">Move, change or delete bases and events right on the map, or add new ones.</p>
        <button className="btn btn-small" onClick={() => setActive(true)} disabled={disabled} title={disabled ? 'Finish the frontline editor first' : undefined}>
          Edit bases &amp; events
        </button>
      </div>
    )
  }

  const update = (change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d))

  // ---------- Latitude and longitude typed by hand (the helpers that use them are further down) ----------

  // Moves the pin there, and the map too if the new place is off the screen
  function moveTo(lat: number, lng: number) {
    update({ lat, lng })
    if (!map.getBounds().contains([lng, lat])) map.easeTo({ center: [lng, lat] })
  }

  function typeCoord(which: 'lat' | 'lng', text: string) {
    // Pasted from Google Maps ("33.89380, 35.50180"): fill both boxes at once
    const parts = text.split(',').map((p) => readNumber(p))
    if (parts.length === 2 && isLat(parts[0]) && isLng(parts[1])) {
      setLatText(String(parts[0]))
      setLngText(String(parts[1]))
      moveTo(parts[0], parts[1])
      return
    }
    if (which === 'lat') setLatText(text)
    else setLngText(text)
    const value = readNumber(text)
    if (which === 'lat' && isLat(value)) moveTo(value, draft!.lng)
    if (which === 'lng' && isLng(value)) moveTo(draft!.lat, value)
  }

  // Wrong numbers can't be saved: the boxes would say one place and the pin another
  const coordsError = !isLat(readNumber(latText))
    ? 'Latitude must be a number between -90 and 90.'
    : !isLng(readNumber(lngText))
      ? 'Longitude must be a number between -180 and 180.'
      : ''

  // The systems that fit this site's type (an air defence site → air defence systems; a radar site → radars)
  const fittingSystems = draft ? systems.filter((w) => w.type_code === draft.typeCode).sort((a, b) => a.name.localeCompare(b.name)) : []

  // A new type: keep the system only if it still fits, otherwise clear it (the backend would refuse it)
  function changeType(typeCode: string) {
    const keep = draft?.weaponId != null && systems.some((w) => w.id === draft.weaponId && w.type_code === typeCode)
    update({ typeCode, weaponId: keep ? draft!.weaponId : null })
  }

  return (
    <div className="map-panel editor">
      <div className="editor-title">Bases &amp; events</div>

      {mode === 'idle' && (
        <>
          <p className="editor-note">Click a base or an event to edit it.</p>
          <div className="editor-actions">
            <button className="btn btn-small btn-ghost" onClick={() => setMode('placing-location')}>
              + Add base
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => setMode('placing-event')}>
              + Add event
            </button>
          </div>
          {message && <p className="editor-note">{message}</p>}
          {error && <p className="error">{error}</p>}
          <div className="editor-actions">
            <button className="btn btn-small" onClick={finish}>
              Done
            </button>
          </div>
        </>
      )}

      {(mode === 'placing-location' || mode === 'placing-event') && (
        <>
          <p className="editor-note">Click the map where the new {mode === 'placing-location' ? 'base' : 'event'} goes.</p>
          <div className="editor-actions">
            <button className="btn btn-small btn-ghost" onClick={() => setMode('idle')}>
              Cancel
            </button>
          </div>
        </>
      )}

      {mode === 'editing' && draft && (
        <div className="editor-section">
          <p className="editor-note">
            {draft.id === null ? 'New' : 'Editing this'} {draft.kind === 'location' ? 'base' : 'event'}. Drag it on the map, or type where it is below.
          </p>

          <label>
            {draft.kind === 'location' ? 'Name' : 'Title'}
            <input value={draft.name} onChange={(e) => update({ name: e.target.value })} maxLength={200} />
          </label>

          <label>
            Type
            {draft.kind === 'location' ? (
              <select value={draft.typeCode} onChange={(e) => changeType(e.target.value)}>
                {locationTypes.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <select value={draft.eventTypeId} onChange={(e) => update({ eventTypeId: Number(e.target.value) })}>
                {eventTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </label>

          {/* Bases: the type icon, or a picture of its own (from a KMZ, or uploaded here) */}
          {draft.kind === 'location' && (
            <div className="editor-field">
              <span className="editor-field-name">Icon</span>
              <IconPicker value={draft.iconId} onChange={(iconId) => update({ iconId })} noneLabel="Type icon" />
            </div>
          )}

          {/* Only for air defence and radar sites: which system is here (it decides the coverage ring) */}
          {draft.kind === 'location' && (draft.typeCode === 'air_defence' || draft.typeCode === 'radar') && (
            <label>
              System
              <select
                value={draft.weaponId ?? ''}
                onChange={(e) => update({ weaponId: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">Not known</option>
                {fittingSystems.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.range_km.toLocaleString()} km)
                  </option>
                ))}
              </select>
            </label>
          )}

          {draft.kind === 'event' && (
            <label>
              Date and time
              <input type="datetime-local" value={draft.occurredAt} onChange={(e) => update({ occurredAt: e.target.value })} />
            </label>
          )}

          <label>
            Country
            <CountrySelect value={draft.country} onChange={(country) => update({ country })} />
          </label>

          <label>
            Description
            <textarea rows={2} value={draft.description} onChange={(e) => update({ description: e.target.value })} />
          </label>

          {/* Where it is: type it, paste "lat, lng" from Google Maps, or drag the pin (the boxes follow) */}
          <div className="editor-coords">
            <label>
              Latitude
              <input inputMode="decimal" value={latText} onChange={(e) => typeCoord('lat', e.target.value)} placeholder="33.89380" />
            </label>
            <label>
              Longitude
              <input inputMode="decimal" value={lngText} onChange={(e) => typeCoord('lng', e.target.value)} placeholder="35.50180" />
            </label>
          </div>
          <p className="editor-note">Tip: paste "33.8938, 35.5018" from Google Maps into one box to fill both.</p>
          {coordsError && <p className="error">{coordsError}</p>}

          {error && <p className="error">{error}</p>}
          <div className="editor-actions">
            <button className="btn btn-small" onClick={save} disabled={busy || coordsError !== '' || (draft.id !== null && !dirty)}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-small btn-ghost" onClick={cancel} disabled={busy}>
              Cancel
            </button>
            {draft.id !== null && (
              <button className="btn btn-small btn-danger" onClick={remove} disabled={busy}>
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}