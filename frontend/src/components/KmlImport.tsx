import { useEffect, useState } from 'react'
import { fetchLocationTypes, importKml } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { ImportSummary, LocationType } from '../types'

interface Props {
  onLoggedOut: () => void
}

// Upload a KML/KMZ file of bases / airports.
// Step 1: Preview (nothing saved). Step 2: Import.
export default function KmlImport({ onLoggedOut }: Props) {
  const [types, setTypes] = useState<LocationType[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [type, setType] = useState('')
  const [country, setCountry] = useState('')

  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0) // changing it empties the file input

  useEffect(() => {
    fetchLocationTypes()
      .then(setTypes)
      .catch(() => setError('Could not load location types'))
  }, [])

  // Any change → the old preview no longer matches, so hide it
  function changed() {
    setSummary(null)
    setError('')
  }

  async function run(dryRun: boolean) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const result = await importKml({ file, type, country, dryRun })
      setSummary(result)
      if (!dryRun) {
        setFile(null)
        setFileInputKey((k) => k + 1)
      }
    } catch (err) {
      if (isUnauthorized(err)) onLoggedOut()
      else setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const ready = file !== null && type !== '' && country.length === 2
  const canImport = ready && summary?.dryRun === true && summary.saved > 0

  return (
    <div className="card">
      <h2>Import KML</h2>
      <p className="muted">Add bases or airports from a Google Earth file (.kml or .kmz).</p>

      <label>
        File
        <input
          key={fileInputKey}
          type="file"
          accept=".kml,.kmz"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            changed()
          }}
        />
      </label>

      <div className="row">
        <label>
          Type (all pins in the file)
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value)
              changed()
            }}
          >
            <option value="">Choose…</option>
            {types.map((t) => (
              <option key={t.id} value={t.code}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Country code
          <input
            value={country}
            onChange={(e) => {
              setCountry(e.target.value.toUpperCase())
              changed()
            }}
            maxLength={2}
            placeholder="IR"
          />
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {summary && (
        <div className={summary.dryRun ? 'import-summary' : 'import-summary done'}>
          <strong>{summary.dryRun ? 'Preview: nothing saved yet' : 'Import finished'}</strong>
          <ul>
            <li>Placemarks in the file: {summary.found}</li>
            <li>
              {summary.dryRun ? 'Will be saved' : 'Saved'}: {summary.saved}
            </li>
            <li>Already on the map (skipped): {summary.duplicates}</li>
            {summary.notPoints > 0 && <li>Lines / shapes (skipped): {summary.notPoints}</li>}
            {summary.invalid > 0 && <li>Bad coordinates (skipped): {summary.invalid}</li>}
            {summary.autoNamed > 0 && <li>No name in the file, auto-named: {summary.autoNamed}</li>}
          </ul>
        </div>
      )}

      <div className="row">
        <button className="btn btn-ghost" type="button" disabled={!ready || busy} onClick={() => run(true)}>
          {busy ? 'Working…' : '1. Preview'}
        </button>
        <button className="btn" type="button" disabled={!canImport || busy} onClick={() => run(false)}>
          2. Import {canImport ? summary.saved : ''}
        </button>
      </div>
    </div>
  )
}