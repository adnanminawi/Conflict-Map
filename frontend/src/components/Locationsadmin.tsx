import { useEffect, useState } from 'react'
import { deleteLocation, deleteLocations } from '../api/admin'
import { fetchLocations } from '../api/locations'
import { fetchCountries } from '../api/countries'
import { fetchWeapons } from '../api/weapons'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { MapLocation, Weapon } from '../types'

interface Props {
  onLoggedOut: () => void
}

const PAGE_SIZE = 50 // rows per page in a table
const SYSTEM_TYPES = ['air_defence', 'radar'] // these bases are linked to a system of the Weapons tab (for their range)

// One group of bases in a country: "Air defence", or inside it "Patriot · 160 km" / "No system"
interface Group {
  key: string // 'air_defence' or 'air_defence:12' or 'air_defence:none': remembers which groups are open
  title: string
  detail: string // "160 km" or "no range on the map"
  bases: MapLocation[]
  warn: boolean // a "No system" group: its bases show no range
}

// The Bases tab, in three levels so nobody gets lost:
//   1. All countries: one row per country, with its counts
//   2. One country: its bases grouped by type, and air defence / radar also by system
//   3. An open group: a table of its bases, 50 per page, to show on the map or delete
// Importing is in the Import map tab.
export default function LocationsAdmin({ onLoggedOut }: Props) {
  const [locations, setLocations] = useState<MapLocation[]>([])
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [countryNames, setCountryNames] = useState<Record<string, string>>({}) // 'IR' → 'Iran'
  const [country, setCountry] = useState('') // '' = the list of all countries
  const [search, setSearch] = useState('') // not empty = one flat list of matches, in every country
  const [open, setOpen] = useState<Set<string>>(new Set()) // the groups that are unfolded
  const [pages, setPages] = useState<Record<string, number>>({}) // the page each table is on (0 = first)
  const [selected, setSelected] = useState<Set<number>>(new Set()) // ticked rows, for "Delete selected"
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  useEffect(() => {
    fetchLocations().then(setLocations).catch(handleError)
    fetchWeapons().then(setWeapons).catch(handleError)
    fetchCountries()
      .then((list) => setCountryNames(Object.fromEntries(list.map((c) => [c.code, c.name_en]))))
      .catch(() => {}) // without names we just show the codes
  }, [])

  // Moving to another country or search clears the ticks, so you never delete rows you can't see
  useEffect(() => {
    setSelected(new Set())
    setPages((old) => ({ ...old, search: 0 })) // a new search starts on page 1
  }, [country, search])

  const nameOf = (code: string) => countryNames[code] ?? code
  const weaponOf = new Map(weapons.map((w) => [w.id, w]))
  const needsSystem = (l: MapLocation) => SYSTEM_TYPES.includes(l.type_code) && l.weapon_id === null

  // ---------- Deleting ----------

  async function remove(ids: number[], label: string) {
    if (!window.confirm(`Delete ${label}? It will disappear from the map. This can't be undone.`)) return
    setError('')
    setDeleting(true)
    try {
      if (ids.length === 1) await deleteLocation(ids[0])
      else await deleteLocations(ids) // one request for all of them
      setLocations((list) => list.filter((l) => !ids.includes(l.id)))
      setSelected(new Set())
    } catch (err) {
      handleError(err)
    } finally {
      setDeleting(false)
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

  function toggleGroup(key: string) {
    setOpen((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // ---------- Level 1: all countries ----------

  // One row per country: how many bases, air defence, radars, and how many have / miss their system
  const byCountry = new Map<string, MapLocation[]>()
  for (const l of locations) byCountry.set(l.country_code, [...(byCountry.get(l.country_code) ?? []), l])
  const countryRows = [...byCountry.entries()]
    .map(([code, list]) => ({
      code,
      total: list.length,
      airDefence: list.filter((l) => l.type_code === 'air_defence').length,
      radars: list.filter((l) => l.type_code === 'radar').length,
      withSystem: list.filter((l) => l.weapon_id !== null).length,
      noSystem: list.filter(needsSystem).length,
    }))
    .sort((a, b) => b.total - a.total) // the biggest first

  // ---------- Level 2: one country, in groups ----------

  // Its bases by type ("Air defence (80)"); air defence and radar also by system ("Patriot · 160 km (21)")
  function groupsOf(list: MapLocation[]): { type: Group; systems: Group[] }[] {
    const byType = new Map<string, MapLocation[]>()
    for (const l of list) byType.set(l.type_code, [...(byType.get(l.type_code) ?? []), l])

    return [...byType.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([typeCode, bases]) => {
        const missing = bases.filter(needsSystem).length
        const type: Group = {
          key: typeCode,
          title: bases[0].type_name,
          detail: missing > 0 ? `${missing} no system` : '',
          bases,
          warn: missing > 0,
        }
        if (!SYSTEM_TYPES.includes(typeCode)) return { type, systems: [] }

        // Inside air defence / radar: one group per system, and the ones with no system last
        const bySystem = new Map<number | null, MapLocation[]>()
        for (const l of bases) bySystem.set(l.weapon_id, [...(bySystem.get(l.weapon_id) ?? []), l])
        const systems = [...bySystem.entries()]
          .sort((a, b) => (a[0] === null ? 1 : b[0] === null ? -1 : b[1].length - a[1].length))
          .map(([weaponId, sites]): Group => {
            const w = weaponId === null ? undefined : weaponOf.get(weaponId)
            return {
              key: `${typeCode}:${weaponId ?? 'none'}`,
              title: weaponId === null ? 'No system' : (w?.name ?? `System ${weaponId}`),
              detail: weaponId === null ? 'no range on the map: add the system in the Weapons tab' : w ? `${w.range_km.toLocaleString()} km` : '',
              bases: sites,
              warn: weaponId === null,
            }
          })
        return { type, systems }
      })
  }

  // ---------- Level 3: a table of bases ----------

  // A group's bases as a table, 50 per page. key = which table (for its page).
  // showWhere = add the country and type (search results). showSystem = false inside a system group (it's in the title).
  function baseTable(key: string, bases: MapLocation[], showWhere = false, showSystem = true) {
    const pageCount = Math.max(1, Math.ceil(bases.length / PAGE_SIZE))
    const page = Math.min(pages[key] ?? 0, pageCount - 1) // after deleting, the last page may be gone
    const setPage = (n: number) => setPages((old) => ({ ...old, [key]: n }))
    const rows = bases.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
    const allTicked = rows.length > 0 && rows.every((l) => selected.has(l.id))

    return (
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
                      rows.forEach((l) => (allTicked ? next.delete(l.id) : next.add(l.id)))
                      return next
                    })
                  }
                />
              </th>
              <th>Name</th>
              {showWhere && <th>Type</th>}
              {showWhere && <th>Country</th>}
              {showSystem && <th>System</th>}
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="col-check">
                  <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleRow(l.id)} aria-label={`Select ${l.name}`} />
                </td>
                <td dir="auto">{l.name}</td>
                {showWhere && <td className="muted">{l.type_name}</td>}
                {showWhere && <td className="muted">{nameOf(l.country_code)}</td>}
                {showSystem && (
                  <td className={needsSystem(l) ? 'warn-text' : 'muted'}>
                    {l.weapon_id !== null ? (weaponOf.get(l.weapon_id)?.name ?? '—') : needsSystem(l) ? 'None' : '—'}
                  </td>
                )}
                <td className="col-actions">
                  {/* Opens the map zoomed on this base, in a new tab */}
                  <a className="btn btn-small btn-ghost" href={`/?focus=${l.lng},${l.lat}`} target="_blank" rel="noreferrer">
                    Show on map
                  </a>
                  <button className="btn btn-small btn-danger" disabled={deleting} onClick={() => remove([l.id], `"${l.name}"`)}>
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
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, bases.length)} of {bases.length}
            </span>
            <button className="btn btn-small btn-ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button className="btn btn-small btn-ghost" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
    )
  }

  // One foldable group line, and its table when open
  function groupRow(group: Group, level: 'type' | 'system') {
    const isOpen = open.has(group.key)
    return (
      <div className={level === 'type' ? 'base-group' : 'base-group base-subgroup'}>
        <button type="button" className="base-group-head" aria-expanded={isOpen} onClick={() => toggleGroup(group.key)}>
          <span className="base-group-arrow">{isOpen ? '▾' : '▸'}</span>
          <span className="base-group-title">{group.title}</span>
          <span className="muted">{group.bases.length}</span>
          {group.detail && <span className={group.warn ? 'pill-warn' : 'muted'}>{group.detail}</span>}
        </button>
      </div>
    )
  }

  // ---------- The page ----------

  const term = search.trim().toLowerCase()
  const matches = term === '' ? [] : locations.filter((l) => l.name.toLowerCase().includes(term))
  const countryBases = country === '' ? [] : (byCountry.get(country) ?? [])

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>
          {country === '' ? (
            `Bases (${locations.length})`
          ) : (
            <>
              <button type="button" className="link-button" onClick={() => setCountry('')}>
                All countries
              </button>{' '}
              / {nameOf(country)} ({countryBases.length})
            </>
          )}
        </h2>
        <div className="list-controls">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a base in every country" />
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {/* Ticked rows: one bar to delete them all */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <span>{selected.size} selected</span>
          <div className="bulk-actions">
            <button className="btn btn-small btn-ghost" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button
              className="btn btn-small btn-danger"
              disabled={deleting}
              onClick={() => remove([...selected], `${selected.size} ${selected.size === 1 ? 'base' : 'bases'}`)}
            >
              {deleting ? 'Deleting…' : `Delete selected (${selected.size})`}
            </button>
          </div>
        </div>
      )}

      {/* Searching: one flat list of the matches, in every country */}
      {term !== '' &&
        (matches.length === 0 ? <p className="muted">No base is called that.</p> : baseTable('search', matches, true))}

      {/* Level 1: all countries */}
      {term === '' && country === '' && (
        <>
          {locations.length === 0 && <p className="muted">No bases yet. Add some in the Import map tab.</p>}
          {countryRows.length > 0 && (
            <table className="base-table country-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Bases</th>
                  <th>Air defence</th>
                  <th>Radars</th>
                  <th>With system</th>
                  <th>No system</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((r) => (
                  <tr key={r.code} className="clickable" onClick={() => setCountry(r.code)}>
                    <td>
                      <button type="button" className="link-button" onClick={() => setCountry(r.code)}>
                        {nameOf(r.code)}
                      </button>
                    </td>
                    <td>{r.total}</td>
                    <td>{r.airDefence}</td>
                    <td>{r.radars}</td>
                    <td>{r.withSystem}</td>
                    <td>{r.noSystem > 0 ? <span className="pill-warn">{r.noSystem}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">"No system": air defence or radar sites with no system from the Weapons tab, so no range shows on the map.</p>
        </>
      )}

      {/* Level 2 and 3: one country, its groups, and the open tables */}
      {term === '' && country !== '' && (
        <div className="base-groups">
          {groupsOf(countryBases).map(({ type, systems }) => (
            <div key={type.key}>
              {groupRow(type, 'type')}
              {open.has(type.key) &&
                (systems.length > 0 ? (
                  systems.map((s) => (
                    <div key={s.key}>
                      {groupRow(s, 'system')}
                      {open.has(s.key) && baseTable(`${country}:${s.key}`, s.bases, false, false)}
                    </div>
                  ))
                ) : (
                  baseTable(`${country}:${type.key}`, type.bases)
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}