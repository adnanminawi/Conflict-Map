import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import { createEvent, createLocation, deleteEvent, deleteLocation, fetchEventTypes, fetchLocationTypes, updateEvent, updateLocation,} from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import { arePopupsEnabled, enableShapePopups } from '../map/shapesLayer'
import { setPickHandler, type PickKind } from '../map/pickMode'
import { enableDrag, showEditItem } from '../map/Edititemlayer'
import CountrySelect from './CountrySelect'
import type { EventType, LocationType, MapEvent, MapLocation } from '../types'

interface Props {
  map: maplibregl.Map
  locations: MapLocation[]
  events: MapEvent[]
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
export default function MapItemEditor({ map, locations, events, defaultCountry, disabled, closeSignal, onActiveChange, onHide, onSaved }: Props) {
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
          kind, id, lng: l.lng, lat: l.lat, name: l.name, typeCode: l.type_code, eventTypeId: 0,
          country: l.country_code, description: l.description ?? '', occurredAt: '',
        })
      } else {
        const e = events.find((x) => x.id === id)
        if (!e) return
        open({
          kind, id, lng: e.lng, lat: e.lat, name: e.title, typeCode: '', eventTypeId: e.event_type_id,
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
        typeCode: locationTypes[0]?.code ?? '', eventTypeId: eventTypes[0]?.id ?? 0,
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
    if (draft.kind === 'location') {
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
            {draft.id === null ? 'New' : 'Editing this'} {draft.kind === 'location' ? 'base' : 'event'}. Drag it on the map to move it.
          </p>

          <label>
            {draft.kind === 'location' ? 'Name' : 'Title'}
            <input value={draft.name} onChange={(e) => update({ name: e.target.value })} maxLength={200} />
          </label>

          <label>
            Type
            {draft.kind === 'location' ? (
              <select value={draft.typeCode} onChange={(e) => update({ typeCode: e.target.value })}>
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

          {/* Where it is now; dragging updates it */}
          <p className="editor-note editor-coords">
            {draft.lat.toFixed(5)}, {draft.lng.toFixed(5)}
          </p>

          {error && <p className="error">{error}</p>}
          <div className="editor-actions">
            <button className="btn btn-small" onClick={save} disabled={busy || (draft.id !== null && !dirty)}>
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