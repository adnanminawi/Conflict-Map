import { useEffect, useState } from 'react'
import { deleteLocation } from '../api/admin'
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

  const nameOf = (code: string) => countryNames[code] ?? code

  // Only the countries that have bases, for the filter, with how many each
  const counts: Record<string, number> = {}
  for (const l of locations) counts[l.country_code] = (counts[l.country_code] ?? 0) + 1
  const countries = Object.keys(counts).sort((a, b) => nameOf(a).localeCompare(nameOf(b)))

  const term = search.trim().toLowerCase()
  const shown = locations.filter(
    (l) => (country === '' || l.country_code === country) && (term === '' || l.name.toLowerCase().includes(term)),
  )

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
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {locations.length === 0 && <p className="muted">No bases yet. Import a file above.</p>}
        {locations.length > 0 && shown.length === 0 && <p className="muted">Nothing matches this search.</p>}

        <ul className="event-list">
          {shown.map((l) => (
            <li key={l.id} className="event-item">
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