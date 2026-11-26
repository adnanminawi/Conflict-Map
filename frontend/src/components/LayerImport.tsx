import { useEffect, useState } from 'react'
import { deleteLayerVersion, fetchLayerVersions, importLayer, setLayerHidden } from '../api/admin'
import { fetchSides } from '../api/sides'
import { fetchCountries } from '../api/countries'
import { getErrorMessage, isUnauthorized } from '../api/client'
import SidePicker from './SidePicker'
import type { LayerVersion, Side } from '../types'

interface Props {
  onLoggedOut: () => void
}

// Today's local date as "2026-10-28" (the en-CA format is year-month-day)
const today = new Date().toLocaleDateString('en-CA')

// "2026-11-21" → "21 Nov 2026"
function showDate(d: string): string {
  return new Date(d.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// One layer ("Taiz front"): all its saved versions, the newest first. The newest is the one on the map.
interface Layer {
  name: string
  side_id: number
  side_name: string
  side_color: string
  country_code: string
  hidden: boolean
  versions: LayerVersion[]
}

// The Frontlines tab:
//   1. All countries: one row per country, with its layers and last update
//   2. One country: its layers grouped by side. Each layer: Upload new version, Hide / Show, History
//   3. Uploading: the form opens in place of the list. "Upload new version" fills in the layer for you.
export default function LayerImport({ onLoggedOut }: Props) {
  const [versions, setVersions] = useState<LayerVersion[]>([])
  const [sides, setSides] = useState<Side[]>([])
  const [countryNames, setCountryNames] = useState<Record<string, string>>({}) // 'YE' → 'Yemen'

  // Where the admin is
  const [openCountry, setOpenCountry] = useState('') // '' = the list of all countries
  const [search, setSearch] = useState('')
  const [history, setHistory] = useState<Set<string>>(new Set()) // layers whose older versions are unfolded

  // The upload form. formOpen = false → the list is shown
  const [formOpen, setFormOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [country, setCountry] = useState('')
  const [sideId, setSideId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(today)
  const [newVersionOf, setNewVersionOf] = useState<string | null>(null) // the layer being updated (null = any)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  async function load() {
    try {
      setVersions(await fetchLayerVersions())
    } catch (err) {
      handleError(err)
    }
  }

  useEffect(() => {
    load()
    fetchSides().then(setSides).catch(handleError)
    fetchCountries()
      .then((list) => setCountryNames(Object.fromEntries(list.map((c) => [c.code, c.name_en]))))
      .catch(() => {}) // without names we just show the codes
  }, [])

  const nameOf = (code: string) => countryNames[code] ?? code

  // Versions → layers (one per name), each with its versions newest first
  const byName = new Map<string, LayerVersion[]>()
  for (const v of versions) byName.set(v.name, [...(byName.get(v.name) ?? []), v])
  const layers: Layer[] = [...byName.values()].map((list) => {
    const sorted = [...list].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date) || b.id - a.id)
    const top = sorted[0]
    return {
      name: top.name,
      side_id: top.side_id,
      side_name: top.side_name,
      side_color: top.side_color,
      country_code: top.country_code,
      hidden: sorted.some((v) => v.hidden),
      versions: sorted,
    }
  })

  // ---------- Actions ----------

  // A new layer: empty form, with the country already chosen when you're inside one
  function startUpload() {
    setNewVersionOf(null)
    setFile(null)
    setName('')
    setCountry(openCountry)
    setSideId(null)
    setDate(today)
    setMessage('')
    setError('')
    setFormOpen(true)
  }

  // A new date for an existing layer: its name, country and side are filled in
  function startNewVersion(layer: Layer) {
    setNewVersionOf(layer.name)
    setFile(null)
    setName(layer.name)
    setCountry(layer.country_code)
    setSideId(layer.side_id)
    setDate(today)
    setMessage('')
    setError('')
    setFormOpen(true)
    window.scrollTo({ top: 0 })
  }

  // Typing / picking a layer name. An existing layer → use its country and side.
  function changeName(value: string) {
    setName(value)
    const existing = layers.find((l) => l.name === value)
    if (existing) {
      setCountry(existing.country_code)
      setSideId(existing.side_id)
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !sideId) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      const result = await importLayer({ file, name: name.trim(), sideId, date })
      setMessage(`Saved "${name.trim()}" for ${showDate(date)}: ${result.areas} areas, ${result.lines} lines, ${result.icons} icons.`)
      await load()
      // Back to the list, in the layer's country, so the admin sees it there
      setOpenCountry(sides.find((s) => s.id === sideId)?.country_code ?? country)
      setSearch('')
      setFormOpen(false)
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function toggleHidden(layer: Layer) {
    setMessage('')
    setError('')
    try {
      await setLayerHidden(layer.name, !layer.hidden)
      setVersions((list) => list.map((v) => (v.name === layer.name ? { ...v, hidden: !layer.hidden } : v)))
    } catch (err) {
      handleError(err)
    }
  }

  async function remove(layer: Layer, v: LayerVersion) {
    // Say what visitors will see after: the older version, or nothing
    const isOnMap = layer.versions[0].id === v.id
    const next = layer.versions[1]
    const effect = !isOnMap
      ? ''
      : next
        ? ` The map will go back to the ${showDate(next.snapshot_date)} version.`
        : ` It's the only version: "${layer.name}" will disappear from the map.`
    if (!window.confirm(`Delete the ${showDate(v.snapshot_date)} version of "${layer.name}"?${effect} This can't be undone.`)) return
    setMessage('')
    setError('')
    try {
      await deleteLayerVersion(v.id)
      setVersions((list) => list.filter((x) => x.id !== v.id))
    } catch (err) {
      handleError(err)
    }
  }

  function toggleHistory(name: string) {
    setHistory((old) => {
      const next = new Set(old)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // ---------- The upload form ----------

  if (formOpen) {
    return (
      <div className="stack">
        <div className="card back-row">
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setFormOpen(false)}>
            ← Back to frontlines
          </button>
        </div>

        <form className="card" onSubmit={handleUpload}>
          <h2>{newVersionOf ? `New version of "${newVersionOf}"` : 'Upload frontlines'}</h2>
          <p className="muted">
            {newVersionOf
              ? 'The file replaces what visitors see. The older versions stay in the history.'
              : 'Use the same layer name every time to add a new date.'}
          </p>

          <label>
            File
            <input type="file" accept=".kml,.kmz" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
          </label>

          {/* A new version keeps its layer's country and side: only a new layer chooses them */}
          {!newVersionOf && (
            <div className="row side-row">
              <SidePicker
                sides={sides}
                country={country}
                sideId={sideId}
                onCountryChange={setCountry}
                onSideChange={setSideId}
                onSideCreated={(side) => setSides([...sides, side])}
              />
            </div>
          )}

          <div className="row">
            {!newVersionOf && (
              <label>
                Layer name
                <input value={name} onChange={(e) => changeName(e.target.value)} list="layer-names" placeholder="Taiz front" required />
                {/* Suggests existing names, so a typo doesn't create a new layer */}
                <datalist id="layer-names">
                  {layers.map((l) => (
                    <option key={l.name} value={l.name} />
                  ))}
                </datalist>
              </label>
            )}
            <label>
              Date this map shows
              <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
            </label>
          </div>

          {error && <p className="error">{error}</p>}

          <div className="row">
            <button className="btn" type="submit" disabled={busy || !sideId}>
              {busy ? 'Uploading…' : 'Upload'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    )
  }

  // ---------- The list ----------

  // A table of layers, each with its history under it when unfolded. showCountry = in the search results
  function layerTable(list: Layer[], showCountry = false) {
    return (
      <div className="base-table-wrap">
        <table className="base-table layer-table">
          <thead>
            <tr>
              <th>Layer</th>
              {showCountry && <th>Country</th>}
              <th>On the map</th>
              <th className="col-num">Shapes</th>
              <th>History</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.map((layer) => {
              const current = layer.versions[0]
              const older = layer.versions.slice(1)
              const open = history.has(layer.name)
              return [
                <tr key={layer.name} className={layer.hidden ? 'row-hidden' : undefined}>
                  <td dir="auto">
                    {layer.name}
                    {layer.hidden && <span className="pill-muted">Hidden</span>}
                  </td>
                  {showCountry && <td className="muted">{nameOf(layer.country_code)}</td>}
                  <td className="nowrap">{showDate(current.snapshot_date)}</td>
                  <td className="col-num">{current.shape_count}</td>
                  <td>
                    {older.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <button type="button" className="link-button small" aria-expanded={open} onClick={() => toggleHistory(layer.name)}>
                        {open ? 'Close' : `${older.length} older`}
                      </button>
                    )}
                  </td>
                  <td className="col-actions">
                    <button className="btn btn-small" onClick={() => startNewVersion(layer)}>
                      New version
                    </button>
                    <button className="btn btn-small btn-ghost" onClick={() => toggleHidden(layer)}>
                      {layer.hidden ? 'Show' : 'Hide'}
                    </button>
                    <button className="btn btn-small btn-danger" onClick={() => remove(layer, current)} title="Delete this version">
                      Delete
                    </button>
                  </td>
                </tr>,
                // The older versions, one line each, under their layer
                ...(open
                  ? older.map((v) => (
                      <tr key={v.id} className="version-row">
                        <td colSpan={showCountry ? 2 : 1} className="muted">
                          ↳ by {v.created_by_username}
                        </td>
                        <td className="nowrap muted">{showDate(v.snapshot_date)}</td>
                        <td className="col-num muted">{v.shape_count}</td>
                        <td />
                        <td className="col-actions">
                          <button className="btn btn-small btn-danger" onClick={() => remove(layer, v)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))
                  : []),
              ]
            })}
          </tbody>
        </table>
      </div>
    )
  }

  // Level 1: one row per country
  const byCountry = new Map<string, Layer[]>()
  for (const l of layers) byCountry.set(l.country_code, [...(byCountry.get(l.country_code) ?? []), l])
  const countryRows = [...byCountry.entries()]
    .map(([code, list]) => ({
      code,
      layers: list.length,
      sides: new Set(list.map((l) => l.side_id)).size,
      updated: list.map((l) => l.versions[0].snapshot_date).sort().pop()!,
      hidden: list.filter((l) => l.hidden).length,
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated)) // the most recently updated first

  // Level 2: the open country's layers by side
  const countryLayers = byCountry.get(openCountry) ?? []
  const bySide = new Map<number, Layer[]>()
  for (const l of countryLayers) bySide.set(l.side_id, [...(bySide.get(l.side_id) ?? []), l])
  const sideGroups = [...bySide.values()]
    .map((list) => list.sort((a, b) => a.name.localeCompare(b.name)))
    .sort((a, b) => a[0].side_name.localeCompare(b[0].side_name))

  const term = search.trim().toLowerCase()
  const matches = term === '' ? [] : layers.filter((l) => l.name.toLowerCase().includes(term))

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>
          {openCountry === '' ? (
            `Frontlines (${layers.length})`
          ) : (
            <>
              <button type="button" className="link-button" onClick={() => setOpenCountry('')}>
                All countries
              </button>{' '}
              / {nameOf(openCountry)} ({countryLayers.length})
            </>
          )}
        </h2>
        <div className="list-controls">
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search a layer" />
          <button className="btn btn-small" onClick={startUpload}>
            Upload new layer
          </button>
        </div>
      </div>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {/* Searching: one list of the matches, in every country */}
      {term !== '' && (matches.length === 0 ? <p className="muted-line">No layer is called that.</p> : layerTable(matches, true))}

      {/* Level 1: all countries */}
      {term === '' && openCountry === '' && (
        <>
          {layers.length === 0 && <p className="muted-line">Nothing uploaded yet. Upload the first frontline file.</p>}
          {countryRows.length > 0 && (
            <table className="base-table country-table">
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Layers</th>
                  <th>Sides</th>
                  <th>Last update</th>
                  <th>Hidden</th>
                </tr>
              </thead>
              <tbody>
                {countryRows.map((r) => (
                  <tr key={r.code} className="clickable" onClick={() => setOpenCountry(r.code)}>
                    <td>
                      <button type="button" className="link-button" onClick={() => setOpenCountry(r.code)}>
                        {nameOf(r.code)}
                      </button>
                    </td>
                    <td>{r.layers}</td>
                    <td>{r.sides}</td>
                    <td>{showDate(r.updated)}</td>
                    <td>{r.hidden > 0 ? r.hidden : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Level 2: one country, a table per side */}
      {term === '' && openCountry !== '' && (
        <div className="base-groups">
          {sideGroups.length === 0 && <p className="muted-line">No layers for this country yet.</p>}
          {sideGroups.map((list) => (
            <div key={list[0].side_id}>
              <div className="side-group-head">
                <span className="side-dot" style={{ background: list[0].side_color }} />
                <span className="base-group-title">{list[0].side_name}</span>
                <span className="muted">{list.length}</span>
              </div>
              {layerTable(list)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}