import { useEffect, useState } from 'react'
import { createWeapon, deleteWeapon, fetchWeaponTypes, updateWeapon } from '../api/admin'
import { fetchWeapons } from '../api/weapons'
import { fetchSides } from '../api/sides'
import { fetchLocations } from '../api/locations'
import { getErrorMessage, isUnauthorized } from '../api/client'
import CountrySelect from './CountrySelect'
import type { MapLocation, Side, Weapon, WeaponType } from '../types'

interface Props {
  onLoggedOut: () => void
}

const SITE_TYPES = ['air_defence', 'radar'] // these systems get their range from sites on the map (Bases tab)

// The Weapons tab, like the Bases tab:
//   1. All countries: one row per country, with its counts
//   2. One country: its weapons grouped by type (Missile launcher, Air defence, Radar), each group a table
//   3. "Add weapon" / "Edit": the form opens in place of the list, and "Back" returns to where you were
// A country with sides (e.g. Yemen) must say which side has the weapon. A country without sides has no side.
export default function WeaponsAdmin({ onLoggedOut }: Props) {
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [types, setTypes] = useState<WeaponType[]>([])
  const [sides, setSides] = useState<Side[]>([])
  const [locations, setLocations] = useState<MapLocation[]>([]) // to count each system's sites

  // Where the admin is
  const [openCountry, setOpenCountry] = useState('') // '' = the list of all countries
  const [search, setSearch] = useState('') // not empty = one list of matches, in every country
  const [closed, setClosed] = useState<Set<string>>(new Set()) // type groups folded by the admin (all open at first)

  // The form. formOpen = false → the list is shown. editingId = null → adding a new weapon
  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [country, setCountry] = useState('')
  const [sideId, setSideId] = useState('')
  const [range, setRange] = useState('')
  const [source, setSource] = useState('')
  const [description, setDescription] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  async function loadWeapons() {
    try {
      setWeapons(await fetchWeapons())
    } catch (err) {
      handleError(err)
    }
  }

  // Sites change when a weapon is saved (new links), so they're reloaded with it
  function loadLocations() {
    fetchLocations().then(setLocations).catch(handleError)
  }

  useEffect(() => {
    loadWeapons()
    loadLocations()
    fetchWeaponTypes().then(setTypes).catch(handleError)
    fetchSides().then(setSides).catch(handleError)
  }, [])

  // How many sites on the map use each system: weapon id → count
  const sitesOf = new Map<number, number>()
  for (const l of locations) if (l.weapon_id !== null) sitesOf.set(l.weapon_id, (sitesOf.get(l.weapon_id) ?? 0) + 1)
  const needsSites = (w: Weapon) => SITE_TYPES.includes(w.type_code) && !sitesOf.has(w.id)

  // ---------- The form ----------

  const countrySides = sides.filter((s) => s.country_code === country)

  function changeCountry(code: string) {
    setCountry(code)
    setSideId('') // the old side belongs to another country
  }

  // Add: an empty form, with the country already chosen when you're inside one
  function startAdd() {
    setEditingId(null)
    setName('')
    setTypeId('')
    setCountry(openCountry)
    setSideId('')
    setRange('')
    setSource('')
    setDescription('')
    setMessage('')
    setError('')
    setFormOpen(true)
  }

  function startEdit(w: Weapon) {
    setEditingId(w.id)
    setName(w.name)
    setTypeId(String(w.weapon_type_id))
    setCountry(w.country_code)
    setSideId(w.side_id ? String(w.side_id) : '')
    setRange(String(w.range_km))
    setSource(w.source ?? '')
    setDescription(w.description ?? '')
    setMessage('')
    setError('')
    setFormOpen(true)
    window.scrollTo({ top: 0 })
  }

  function closeForm() {
    setFormOpen(false)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setBusy(true)
    const input = {
      name: name.trim(),
      weapon_type_id: Number(typeId),
      country,
      side_id: sideId ? Number(sideId) : null,
      range_km: Number(range),
      source,
      description,
    }
    try {
      const saved = editingId === null ? await createWeapon(input) : await updateWeapon(editingId, input)
      // Air defence / radar: sites already on the map with its name ("SA-2" sites for S-75) were linked to it
      const linked = saved.linked_sites ? `. ${saved.linked_sites} site(s) on the map linked to it` : ''
      setMessage(`${editingId === null ? 'Added' : 'Saved'} "${saved.name}" (${saved.range_km} km)${linked}`)
      await loadWeapons()
      loadLocations()
      // Back to the list, in the weapon's country, so the admin sees it there
      setOpenCountry(saved.country_code ?? country)
      setSearch('')
      setFormOpen(false)
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(w: Weapon) {
    const sites = sitesOf.get(w.id) ?? 0
    const warning = sites > 0 ? ` ${sites} site(s) on the map use it and will lose their range.` : ''
    if (!window.confirm(`Delete "${w.name}"?${warning}`)) return
    setMessage('')
    setError('')
    try {
      await deleteWeapon(w.id)
      setWeapons((list) => list.filter((x) => x.id !== w.id))
      if (sites > 0) loadLocations()
    } catch (err) {
      handleError(err)
    }
  }

  if (formOpen) {
    return (
      <div className="stack">
        <div className="card back-row">
          <button type="button" className="btn btn-small btn-ghost" onClick={closeForm}>
            ← Back to weapons
          </button>
        </div>

        <form className="card" onSubmit={handleSubmit}>
          <h2>{editingId === null ? 'Add a weapon' : 'Edit weapon'}</h2>
          <p className="muted">Visitors can place these on the map to see how far they reach.</p>

          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Burkan-2H" required />
          </label>

          <div className="row">
            <label>
              Type
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
                <option value="">Choose…</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Range (km)
              <input type="number" min={1} max={20000} step={1} value={range} onChange={(e) => setRange(e.target.value)} required />
            </label>
          </div>
          <p className="hint">For fighter jets and drones that fly back: use the combat radius (about half of the full range).</p>

          <div className="row">
            <label>
              Country
              <CountrySelect value={country} onChange={changeCountry} required />
            </label>
            {/* Only countries with sides need a side */}
            {countrySides.length > 0 && (
              <label>
                Side
                <select value={sideId} onChange={(e) => setSideId(e.target.value)} required>
                  <option value="">Choose a side…</option>
                  {countrySides.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label>
            Source of the range (optional)
            <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={255} placeholder="e.g. CSIS Missile Threat" />
          </label>

          <label>
            Description (optional)
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
          </label>

          {error && <p className="error">{error}</p>}

          <div className="row">
            <button className="btn" type="submit" disabled={busy}>
              {busy ? 'Saving…' : editingId === null ? 'Add weapon' : 'Save changes'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ---------- The list ----------

  // A table of weapons. showCountry = add the country (in the search results)
  function weaponTable(list: Weapon[], showCountry = false) {
    // Inside a country every group shows the same columns, so the tables line up under each other
    const hasSides = showCountry ? list.some((w) => w.side_name) : sides.some((s) => s.country_code === openCountry)
    const hasSites = true
    return (
      <div className="base-table-wrap">
        <table className="base-table weapon-table">
          <thead>
            <tr>
              <th>Name</th>
              {showCountry && <th>Country</th>}
              {showCountry && <th>Type</th>}
              <th className="col-num">Range</th>
              {hasSides && <th>Side</th>}
              {hasSites && <th className="col-num">Sites</th>}
              <th>Source</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((w) => (
              <tr key={w.id}>
                <td dir="auto">{w.name}</td>
                {showCountry && <td className="muted">{w.country_name}</td>}
                {showCountry && <td className="muted">{w.type_name}</td>}
                <td className="col-num nowrap">{w.range_km.toLocaleString()} km</td>
                {hasSides && (
                  <td className="nowrap">
                    {w.side_name ? (
                      <>
                        <span className="side-dot" style={{ background: w.side_color ?? undefined }} /> {w.side_name}
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                )}
                {hasSites && (
                  <td className="col-num">
                    {!SITE_TYPES.includes(w.type_code) ? (
                      <span className="muted">—</span>
                    ) : needsSites(w) ? (
                      <span className="pill-warn" title="No site on the map uses this system: link sites in the Bases tab or import them">
                        0
                      </span>
                    ) : (
                      sitesOf.get(w.id)
                    )}
                  </td>
                )}
                <td className="muted cell-source" title={w.source ?? undefined}>
                  {w.source || '—'}
                </td>
                <td className="col-actions">
                  <button className="btn btn-small btn-ghost" onClick={() => startEdit(w)}>
                    Edit
                  </button>
                  <button className="btn btn-small btn-danger" onClick={() => remove(w)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // Level 1: one row per country
  const byCountry = new Map<string, Weapon[]>()
  for (const w of weapons) byCountry.set(w.country_code, [...(byCountry.get(w.country_code) ?? []), w])
  const countryRows = [...byCountry.entries()]
    .map(([code, list]) => ({
      code,
      name: list[0].country_name,
      total: list.length,
      attack: list.filter((w) => !SITE_TYPES.includes(w.type_code)).length,
      airDefence: list.filter((w) => w.type_code === 'air_defence').length,
      radars: list.filter((w) => w.type_code === 'radar').length,
      noSites: list.filter(needsSites).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  // Level 2: the open country's weapons by type, the longest range first
  const countryWeapons = byCountry.get(openCountry) ?? []
  const byType = new Map<string, Weapon[]>()
  for (const w of countryWeapons) byType.set(w.type_name, [...(byType.get(w.type_name) ?? []), w])
  const typeGroups = [...byType.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([typeName, list]) => ({ typeName, list: [...list].sort((a, b) => b.range_km - a.range_km) }))

  function toggleGroup(key: string) {
    setClosed((old) => {
      const next = new Set(old)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const term = search.trim().toLowerCase()
  const matches = term === '' ? [] : weapons.filter((w) => w.name.toLowerCase().includes(term))
  const openName = countryWeapons[0]?.country_name ?? openCountry

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>
          {openCountry === '' ? (
            `Weapons (${weapons.length})`
          ) : (
            <>
              <button type="button" className="link-button" onClick={() => setOpenCountry('')}>
                All countries
              </button>{' '}
              / {openName} ({countryWeapons.length})
            </>
          )}
        </h2>
        <div className="list-controls">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a weapon" />
          <button className="btn btn-small" onClick={startAdd}>
            Add weapon
          </button>
        </div>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {/* Searching: one list of the matches, in every country */}
      {term !== '' && (matches.length === 0 ? <p className="muted-line">No weapon is called that.</p> : weaponTable(matches, true))}

      {/* Level 1: all countries */}
      {term === '' && openCountry === '' && (
        <>
          {weapons.length === 0 && <p className="muted-line">No weapons yet. Add the first one.</p>}
          {countryRows.length > 0 && (
            <table className="base-table country-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Weapons</th>
                  <th>Attack</th>
                  <th>Air defence</th>
                  <th>Radars</th>
                  <th>No sites</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((r) => (
                  <tr key={r.code} className="clickable" onClick={() => setOpenCountry(r.code)}>
                    <td>
                      <button type="button" className="link-button" onClick={() => setOpenCountry(r.code)}>
                        {r.name}
                      </button>
                    </td>
                    <td>{r.total}</td>
                    <td>{r.attack}</td>
                    <td>{r.airDefence}</td>
                    <td>{r.radars}</td>
                    <td>{r.noSites > 0 ? <span className="pill-warn">{r.noSites}</span> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">"No sites": air defence or radar systems that no site on the map uses, so visitors never see their range.</p>
        </>
      )}

      {/* Level 2: one country, a table per type */}
      {term === '' && openCountry !== '' && (
        <div className="base-groups">
          {typeGroups.length === 0 && <p className="muted-line">No weapons for this country yet.</p>}
          {typeGroups.map(({ typeName, list }) => {
            const isOpen = !closed.has(typeName)
            const missing = list.filter(needsSites).length
            return (
              <div key={typeName}>
                <div className="base-group">
                  <button type="button" className="base-group-head" aria-expanded={isOpen} onClick={() => toggleGroup(typeName)}>
                    <span className="base-group-arrow">{isOpen ? '▾' : '▸'}</span>
                    <span className="base-group-title">{typeName}</span>
                    <span className="muted">{list.length}</span>
                    {missing > 0 && <span className="pill-warn">{missing} with no sites</span>}
                  </button>
                </div>
                {isOpen && weaponTable(list)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}