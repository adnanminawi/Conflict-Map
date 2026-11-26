import { useEffect, useState } from 'react'
import { deleteEvent, fetchAdminEvents, updateEventStatus } from '../api/admin'
import { fetchCountries } from '../api/countries'
import { getErrorMessage, isUnauthorized } from '../api/client'
import EventForm from './EventForm'
import type { AdminEvent, EventStatus } from '../types'

interface Props {
  onLoggedOut: () => void
  onUnverifiedCount?: (count: number) => void // for the number on the Events tab
}

const PAGE_SIZE = 50 // rows per page
const ADMIN_LIMIT = 2000 // the backend sends at most this many (newest first)
const DAY_MS = 24 * 60 * 60 * 1000

type StatusFilter = EventStatus | 'all'
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'unverified', label: 'Unverified' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'false', label: 'False' },
  { value: 'all', label: 'All' },
]

// "When" filter: how many days back (0 = any time)
const PERIODS = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 0, label: 'Any time' },
]

// The Events tab: a table of events with filters, 50 per page.
// Tick rows to confirm, mark false or delete many at once. "Add event" opens the form in place of the table.
export default function EventList({ onLoggedOut, onUnverifiedCount }: Props) {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [loaded, setLoaded] = useState(false)
  const [countryNames, setCountryNames] = useState<Record<string, string>>({}) // 'IR' → 'Iran'
  const [adding, setAdding] = useState(false) // true = the Add event form is open

  // Filters
  const [status, setStatus] = useState<StatusFilter>('unverified')
  const [country, setCountry] = useState('') // '' = every country
  const [type, setType] = useState('') // '' = every type
  const [days, setDays] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  const [selected, setSelected] = useState<Set<number>>(new Set()) // ticked rows
  const [busy, setBusy] = useState(false) // a change is being saved: buttons wait
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  // Expired login → back to login. Anything else → show the message.
  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  // All events (every status): the filters work here, so switching them needs no new request
  async function load() {
    try {
      setEvents(await fetchAdminEvents())
      setLoaded(true)
    } catch (err) {
      handleError(err)
    }
  }

  useEffect(() => {
    load()
    fetchCountries()
      .then((list) => setCountryNames(Object.fromEntries(list.map((c) => [c.code, c.name_en]))))
      .catch(() => {}) // without names we just show the codes
  }, [])

  // The number on the Events tab follows the list
  const unverified = events.filter((e) => e.status === 'unverified').length
  useEffect(() => {
    if (loaded) onUnverifiedCount?.(unverified)
  }, [unverified, loaded])

  // A new filter starts on page 1 with nothing ticked, so you never change rows you can't see
  useEffect(() => {
    setPage(0)
    setSelected(new Set())
    setMessage('') // "3 events marked confirmed" belonged to the old view
  }, [status, country, type, days, search])

  const nameOf = (code: string | null) => (code ? (countryNames[code] ?? code) : '—')

  // ---------- Changing events ----------

  // One request per event (the backend changes one at a time). Stops at the first error.
  async function setStatusOf(ids: number[], next: EventStatus) {
    setError('')
    setMessage('')
    setBusy(true)
    let done = 0
    try {
      for (const id of ids) {
        await updateEventStatus(id, next)
        done++
      }
    } catch (err) {
      handleError(err)
    } finally {
      // Update the rows that changed, without reloading everything
      const changed = new Set(ids.slice(0, done))
      setEvents((list) => list.map((e) => (changed.has(e.id) ? { ...e, status: next } : e)))
      setSelected(new Set())
      if (ids.length > 1 && done > 0) setMessage(`${done} ${done === 1 ? 'event' : 'events'} marked ${next}.`)
      setBusy(false)
    }
  }

  async function remove(ids: number[]) {
    const label = ids.length === 1 ? 'this event' : `${ids.length} events`
    if (!window.confirm(`Delete ${label}? This can't be undone.`)) return
    setError('')
    setMessage('')
    setBusy(true)
    let done = 0
    try {
      for (const id of ids) {
        await deleteEvent(id)
        done++
      }
    } catch (err) {
      handleError(err)
    } finally {
      const gone = new Set(ids.slice(0, done))
      setEvents((list) => list.filter((e) => !gone.has(e.id)))
      setSelected(new Set())
      if (ids.length > 1 && done > 0) setMessage(`${done} ${done === 1 ? 'event' : 'events'} deleted.`)
      setBusy(false)
    }
  }

  function toggleRow(id: number) {
    setSelected((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ---------- The Add event form ----------

  if (adding) {
    return (
      <div className="stack">
        <div className="card wide back-row">
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setAdding(false)
              load() // show the events just added
            }}
          >
            ← Back to events
          </button>
        </div>
        <EventForm onLoggedOut={onLoggedOut} />
      </div>
    )
  }

  // ---------- Filtering ----------

  const now = Date.now()
  const term = search.trim().toLowerCase()
  const shown = events.filter(
    (e) =>
      (status === 'all' || e.status === status) &&
      (country === '' || e.country_code === country) &&
      (type === '' || e.type_name === type) &&
      (days === 0 || now - new Date(e.occurred_at).getTime() <= days * DAY_MS) &&
      (term === '' || e.title.toLowerCase().includes(term)),
  )

  // The choices in the dropdowns come from the events themselves
  const countries = [...new Set(events.map((e) => e.country_code).filter((c): c is string => c !== null))].sort((a, b) =>
    nameOf(a).localeCompare(nameOf(b)),
  )
  const types = [...new Set(events.map((e) => e.type_name))].sort()
  const countOf = (s: StatusFilter) => (s === 'all' ? events.length : events.filter((e) => e.status === s).length)

  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1) // after deleting, the last page may be gone
  const rows = shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)
  const allTicked = rows.length > 0 && rows.every((e) => selected.has(e.id))
  const filtered = country !== '' || type !== '' || days !== 0 || term !== ''

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>Events</h2>
        <button className="btn btn-small" onClick={() => setAdding(true)}>
          Add event
        </button>
      </div>

      {/* Status: one button each, with how many */}
      <div className="status-tabs" role="tablist" aria-label="Status">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={status === s.value}
            className={status === s.value ? 'status-tab active' : 'status-tab'}
            onClick={() => setStatus(s.value)}
          >
            {s.label} <span className="status-count">{countOf(s.value)}</span>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <select value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country">
          <option value="">All countries</option>
          {countries.map((c) => (
            <option key={c} value={c}>
              {nameOf(c)}
            </option>
          ))}
        </select>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="When">
          {PERIODS.map((p) => (
            <option key={p.days} value={p.days}>
              {p.label}
            </option>
          ))}
        </select>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles" />
        {filtered && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={() => {
              setCountry('')
              setType('')
              setDays(0)
              setSearch('')
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      {/* Ticked rows: change them all at once */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          <div className="bulk-actions">
            <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button className="btn btn-small" disabled={busy} onClick={() => setStatusOf([...selected], 'confirmed')}>
              Confirm
            </button>
            <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setStatusOf([...selected], 'false')}>
              Mark false
            </button>
            <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove([...selected])}>
              {busy ? 'Saving…' : 'Delete'}
            </button>
          </div>
        </div>
      )}

      {!loaded && !error && <p className="muted-line">Loading events…</p>}
      {loaded && shown.length === 0 && (
        <p className="muted-line">
          {status === 'unverified' && !filtered ? 'Nothing to review: every event has been checked.' : 'No events match these filters.'}
        </p>
      )}

      {rows.length > 0 && (
        <div className="base-table-wrap">
          <table className="base-table">
            <thead>
              <tr>
                <th className="col-check">
                  <input
                    type="checkbox"
                    checked={allTicked}
                    aria-label="Select this page"
                    onChange={() =>
                      setSelected((old) => {
                        const next = new Set(old)
                        rows.forEach((e) => (allTicked ? next.delete(e.id) : next.add(e.id)))
                        return next
                      })
                    }
                  />
                </th>
                <th>Event</th>
                <th>Country</th>
                <th>When</th>
                {status === 'all' && <th>Status</th>}
                <th className="col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="col-check">
                    <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleRow(e.id)} aria-label={`Select ${e.title}`} />
                  </td>
                  <td>
                    <div dir="auto">{e.title}</div>
                    <div className="row-sub">
                      <span className="event-dot" style={{ background: e.type_color ?? 'var(--muted)' }} />
                      {e.type_name} · by {e.created_by_username}
                    </div>
                  </td>
                  <td className="muted">{nameOf(e.country_code)}</td>
                  <td className="muted nowrap">
                    {new Date(e.occurred_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  {status === 'all' && (
                    <td>
                      <span className={`badge ${e.status}`}>{e.status}</span>
                    </td>
                  )}
                  <td className="col-actions">
                    {e.status !== 'confirmed' && (
                      <button className="btn btn-small" disabled={busy} onClick={() => setStatusOf([e.id], 'confirmed')}>
                        Confirm
                      </button>
                    )}
                    {e.status !== 'false' && (
                      <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => setStatusOf([e.id], 'false')}>
                        False
                      </button>
                    )}
                    {/* Opens the map zoomed on the event, in a new tab (only confirmed events have a pin there) */}
                    <a className="btn btn-small btn-ghost" href={`/?focus=${e.lng},${e.lat}`} target="_blank" rel="noreferrer">
                      Map
                    </a>
                    <button className="btn btn-small btn-danger" disabled={busy} onClick={() => remove([e.id])}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 && (
            <div className="pager">
              <span>
                {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, shown.length)} of {shown.length}
              </span>
              <button className="btn btn-small btn-ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                Previous
              </button>
              <button className="btn btn-small btn-ghost" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {events.length >= ADMIN_LIMIT && <p className="hint">Only the newest {ADMIN_LIMIT} events are listed.</p>}
    </div>
  )
}