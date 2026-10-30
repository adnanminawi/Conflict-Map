import { useEffect, useState } from 'react'
import { deleteLayerVersion, fetchLayerVersions, importLayer } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { LayerVersion } from '../types'

interface Props {
  onLoggedOut: () => void
}

// Today's local date as "2026-10-28" (the en-CA format is year-month-day)
const today = new Date().toLocaleDateString('en-CA')

// Upload frontlines (KML/KMZ) and see / delete the saved versions.
export default function LayerImport({ onLoggedOut }: Props) {
  const [versions, setVersions] = useState<LayerVersion[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(today)
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
  }, [])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setMessage('')
    setError('')
    setBusy(true)
    try {
      const result = await importLayer({ file, name: name.trim(), date })
      setMessage(`Saved: ${result.areas} areas, ${result.lines} lines, ${result.icons} icons.`)
      await load()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this version? This cannot be undone.')) return
    try {
      await deleteLayerVersion(id)
      await load()
    } catch (err) {
      handleError(err)
    }
  }

  return (
    <div className="stack">
      <form className="card" onSubmit={handleUpload}>
        <h2>Frontlines &amp; areas</h2>
        <p className="muted">Use the same layer name every time to add a new date.</p>

        <label>
          File
          <input type="file" accept=".kml,.kmz" onChange={(e) => setFile(e.target.files?.[0] ?? null)} required />
        </label>

        <div className="row">
          <label>
            Layer name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              list="layer-names"
              placeholder="Yemen frontlines"
              required
            />
            {/* Suggests existing names, so a typo doesn't create a new layer */}
            <datalist id="layer-names">
              {versions.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </label>
          <label>
            Date this map shows
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
          </label>
        </div>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        <button className="btn" type="submit" disabled={busy}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>

      <div className="card wide">
        <h2>Saved versions</h2>
        {versions.length === 0 && <p className="muted">Nothing uploaded yet.</p>}

        <ul className="event-list">
          {versions.map((v, i) => (
            <li key={v.id} className="event-item">
              <div className="event-info">
                <div className="event-title">
                  {/* The first version of each name in the list is the newest → it's the one on the map */}
                  {versions.findIndex((x) => x.name === v.name) === i && <span className="badge confirmed">on map</span>}
                  {v.name}
                </div>
                <div className="event-meta">
                  {v.snapshot_date} · {v.shape_count} shapes · by {v.created_by_username}
                </div>
              </div>
              <button className="btn btn-small btn-danger" onClick={() => remove(v.id)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}