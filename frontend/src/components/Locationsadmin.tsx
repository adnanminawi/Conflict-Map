import { useEffect, useState } from 'react'
import { deleteLocation, deleteLocations } from '../api/admin'
import { fetchLocations } from '../api/locations'
import { fetchCountries } from '../api/countries'
import { getErrorMessage, isUnauthorized } from '../api/client'
import KmlImport from './KmlImport'
import type { MapLocation } from '../types'

interface Props {
  onLoggedOut: () => void
}

// The Bases tab: import bases from a file, and see / delete the ones already on the map.
export default function LocationsAdmin({ onLoggedOut }: Props) {
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [countryNames, setCountryNames] = useState<Record<string, string>>({}) // 'IR' → 'Iran'
  const [country, setCountry] = useState('') // '' = all countries
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('') // '' = all types

  // The ticked rows, for "Delete selected"
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deletingMany, setDeletingMany] = useState(false)

  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null) // stops a double click deleting twice

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  async function loadLocations() {
    try {
      setLocations(await fetchLocations())
    } catch (err) {
      handleError(err)
    }
  }

  useEffect(() => {
    loadLocations()
    fetchCountries()
      .then((list) => setCountryNames(Object.fromEntries(list.map((c) => [c.code, c.name_en]))))
      .catch(() => {}) // without names we just show the codes
  }, [])

  async function remove(loc: MapLocation) {
    if (!window.confirm(`Delete "${loc.name}"? It will disappear from the map.`)) return
    setError('')
    setDeletingId(loc.id)
    try {
      await deleteLocation(loc.id)
      // Remove it from the list here, no need to load everything again
      setLocations((list) => list.filter((l) => l.id !== loc.id))
    } catch (err) {
      handleError(err)
    } finally {
      setDeletingId(null)
    }
  }

  // Changing a filter clears the ticks, so you never delete rows you can't see
  useEffect(() => {
    setSelected(new Set())
  }, [country, search, typeFilter])

  function toggle(id: number) {
    setSelected((old) => {
      const next = new Set(old)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function removeSelected() {
    const ids = [...selected]
    if (!window.confirm(`Delete ${ids.length} ${ids.length === 1 ? 'base' : 'bases'}? They will disappear from the map. This can't be undone.`)) return
    setError('')
    setDeletingMany(true)
    try {
      await deleteLocations(ids) // one request for all of them
      setLocations((list) => list.filter((l) => !selected.has(l.id)))
      setSelected(new Set())
    } catch (err) {
      handleError(err)
    } finally {
      setDeletingMany(false)
    }
  }

  const nameOf = (code: string) => countryNames[code] ?? code

  // Only the countries that have bases, for the filter, with how many each
  const counts: Record<string, number> = {}
  for (const l of locations) counts[l.country_code] = (counts[l.country_code] ?? 0) + 1
  const countries = Object.keys(counts).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))

  // The types in the list, for the type filter
  const typeNames = [...new Set(locations.map((l) => l.type_name))].sort()

  const term = search.trim().toLowerCase()
  const shown = locations.filter(
    (l) =>
      (country === '' || l.country_code === country) &&
      (typeFilter === '' || l.type_name === typeFilter) &&
      (term === '' || l.name.toLowerCase().includes(term)),
  )
  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id))

  return (
    <div className="stack">
      {/* After an import, reload so the new bases show in the list */}
      <KmlImport onLoggedOut={onLoggedOut} onImported={loadLocations} />

      <div className="card wide">
        <div className="list-header">
          <h2>
            Bases &amp; airports ({shown.length}
            {shown.length !== locations.length && ` of ${locations.length}`})
          </h2>
          <div className="list-controls">
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" />
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {countries.map((code) => (
                <option key={code} value={code}>
                  {nameOf(code)} ({counts[code]})
                </option>
              ))}
            </select>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {typeNames.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk delete: tick rows (or all shown), then one click */}
        {shown.length > 0 && (
          <div className="bulk-bar">
            <label className="bulk-check">
              <input
                type="checkbox"
                checked={allShownSelected}
                onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((l) => l.id)))}
              />
              Select all shown ({shown.length})
            </label>
            <button className="btn btn-small btn-danger" disabled={selected.size === 0 || deletingMany} onClick={removeSelected}>
              {deletingMany ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {locations.length === 0 && <p className="muted">No bases yet. Import a file above.</p>}
        {locations.length > 0 && shown.length === 0 && <p className="muted">Nothing matches this search.</p>}

        <ul className="event-list">
          {shown.map((l) => (
            <li key={l.id} className="event-item">
              <input type="checkbox" className="row-check" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Select ${l.name}`} />
              <div className="event-info">
                <div className="event-title">{l.name}</div>
                <div className="event-meta">
                  {l.type_name} · {nameOf(l.country_code)}
                </div>
              </div>
              <div className="event-actions">
                <button className="btn btn-small btn-danger" disabled={deletingId === l.id} onClick={() => remove(l)}>
                  {deletingId === l.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}