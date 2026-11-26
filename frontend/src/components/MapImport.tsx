import { useEffect, useState } from 'react'
import { fetchEventTypes, fetchLocationTypes, importMap, previewMapImport } from '../api/admin'
import { fetchSides } from '../api/sides'
import { getErrorMessage, isUnauthorized } from '../api/client'
import CountrySelect from './CountrySelect'
import type {
  EventType,
  FolderAction,
  FolderChoice,
  LocationType,
  MapImportPreview,
  MapImportResult,
  PreviewFolder,
  Side,
} from '../types'

interface Props {
  onLoggedOut: () => void
}

// Today's local date as "2026-11-19" (the en-CA format is year-month-day)
const today = new Date().toLocaleDateString('en-CA')

const ACTION_LABELS: Record<FolderAction, string> = {
  bases: 'Bases',
  layer: 'Frontline layer',
  events: 'Strikes (events)',
  skip: 'Skip',
}

// "1 pin" / "3 pins"
function count(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

// "7 areas · 1 line · 1 pin"
function contents(f: PreviewFolder) {
  const parts = []
  if (f.areas) parts.push(count(f.areas, 'area'))
  if (f.lines) parts.push(count(f.lines, 'line'))
  if (f.points) parts.push(count(f.points, 'pin'))
  return parts.join(' · ')
}

// One Google Earth / My Maps file with bases, frontlines and strikes.
// Step 1: read the file → the backend guesses what each folder is. Step 2: check the guesses → import.
export default function MapImport({ onLoggedOut }: Props) {
  const [types, setTypes] = useState<LocationType[]>([])
  const [sides, setSides] = useState<Side[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])

  const [file, setFile] = useState<File | null>(null)
  const [country, setCountry] = useState('')
  const [date, setDate] = useState(today)
  const [fileInputKey, setFileInputKey] = useState(0) // changing it empties the file input

  const [preview, setPreview] = useState<MapImportPreview | null>(null)
  const [choices, setChoices] = useState<FolderChoice[]>([])
  const [result, setResult] = useState<MapImportResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  useEffect(() => {
    fetchLocationTypes().then(setTypes).catch(handleError)
    fetchSides().then(setSides).catch(handleError)
    fetchEventTypes().then(setEventTypes).catch(handleError)
  }, [])

  // A new file or country → the old preview no longer matches
  function startOver() {
    setPreview(null)
    setResult(null)
    setError('')
  }

  // Step 1: read the file. Our guesses become the starting choices.
  async function readFile() {
    if (!file) return
    setError('')
    setResult(null)
    setBusy(true)
    try {
      const data = await previewMapImport(file, country)
      setPreview(data)
      setChoices(
        data.folders.map((f) => ({
          index: f.index,
          action: f.action,
          typeCode: f.typeCode,
          fileCountry: false,
          sideId: f.sideId,
          layerName: f.layerName,
          eventTypeId: null,
        })),
      )
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  // Changes one folder's choice
  function change(index: number, patch: Partial<FolderChoice>) {
    setChoices((all) => all.map((c) => (c.index === index ? { ...c, ...patch } : c)))
  }

  // Step 2: import. Everything is saved together, or nothing (the backend uses one transaction).
  async function runImport() {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      setResult(await importMap(file, country, date, choices))
      setPreview(null)
      setFile(null)
      setFileInputKey((k) => k + 1)
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  const typeName = (code: string) => types.find((t) => t.code === code)?.name ?? code

  // Folders that still need an answer: a frontline layer needs a side and a name, strikes need an event type
  const missing = choices.filter(
    (c) => (c.action === 'layer' && (!c.sideId || !c.layerName?.trim())) || (c.action === 'events' && !c.eventTypeId),
  )
  const nothingChosen = choices.every((c) => c.action === 'skip')

  // Sides grouped by country, the file's country first
  const sideCountries = [...new Set(sides.map((s) => s.country_code))].sort((a, b) =>
    a === country ? -1 : b === country ? 1 : a.localeCompare(b),
  )

  return (
    <div className="card wide">
      <h2>Import map</h2>
      <p className="muted">
        One Google Earth or My Maps file with bases, frontlines and strikes. Read it first: each folder gets a guess you can
        change. Nothing is saved until you click Import.
      </p>

      <label>
        File
        <input
          key={fileInputKey}
          type="file"
          accept=".kml,.kmz"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            startOver()
          }}
        />
      </label>

      <div className="row">
        <label>
          Main country
          <CountrySelect
            value={country}
            onChange={(code) => {
              setCountry(code)
              startOver()
            }}
          />
        </label>
        <label>
          Date this map shows
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="hint">
        Each pin's country is found from its location. The main country is for pins outside every border, and for guessing
        sides.
      </p>

      {!preview && (
        <button className="btn" type="button" disabled={!file || country.length !== 2 || busy} onClick={readFile}>
          {busy ? 'Reading…' : '1. Read file'}
        </button>
      )}

      {error && <p className="error">{error}</p>}

      {preview && (
        <>
          <div className="section-title">
            {preview.found} placemarks in {count(preview.folders.length, 'folder')}
          </div>

          <ul className="import-folders">
            {preview.folders.map((f) => {
              const c = choices[f.index]
              const countryCodes = Object.keys(f.countries)
              return (
                <li key={f.index} className={c.action === 'skip' ? 'import-folder skipped' : 'import-folder'}>
                  <div className="import-folder-head">
                    <div className="import-folder-title">
                      <strong dir="auto">{f.name}</strong>
                      <span className="import-folder-meta">
                        {contents(f)}
                        {f.fileIcons > 0 && ` · ${f.fileIcons} with their own icon`}
                        {countryCodes.length > 0 && ` · ${countryCodes.map((code) => `${code} ${f.countries[code]}`).join(', ')}`}
                      </span>
                    </div>
                    <select
                      aria-label={`What to do with ${f.name}`}
                      value={c.action}
                      onChange={(e) => change(f.index, { action: e.target.value as FolderAction })}
                    >
                      {/* Bases and strikes are pins: only offered when the folder has some */}
                      {f.points > 0 && <option value="bases">{ACTION_LABELS.bases}</option>}
                      <option value="layer">{ACTION_LABELS.layer}</option>
                      {f.points > 0 && <option value="events">{ACTION_LABELS.events}</option>}
                      <option value="skip">{ACTION_LABELS.skip}</option>
                    </select>
                  </div>

                  {c.action === 'bases' && (
                    <div className="import-folder-detail">
                      <span className="import-folder-meta">
                        {Object.entries(f.baseTypes)
                          .map(([code, n]) => `${typeName(code)} ${n}`)
                          .join(' · ') || 'No pin has a clear type'}
                      </span>
                      <div className="row">
                        {f.unclear > 0 && (
                          <label>
                            Type for the {count(f.unclear, 'pin')} with no clear type
                            <select value={c.typeCode} onChange={(e) => change(f.index, { typeCode: e.target.value })}>
                              {types.map((t) => (
                                <option key={t.code} value={t.code}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                      {/* Air defence / radar: their range only shows if their system is in the Weapons tab */}
                      {f.systems.linked > 0 && (
                        <span className="import-folder-meta">Linked to a system in Weapons: {count(f.systems.linked, 'site')}</span>
                      )}
                      {Object.keys(f.systems.missing).length > 0 && (
                        <p className="import-warning">
                          Not in the Weapons tab, so no range will show:{' '}
                          {Object.entries(f.systems.missing)
                            .map(([name, n]) => `${name} (${n})`)
                            .join(', ')}
                          . Add them there with their range (before or after importing: they get linked when you add
                          them).
                        </p>
                      )}
                      {countryCodes.length > 1 && (
                        <label className="bulk-check">
                          <input
                            type="checkbox"
                            checked={c.fileCountry === true}
                            onChange={(e) => change(f.index, { fileCountry: e.target.checked })}
                          />
                          Put all of them in {country} (the borders are simplified: pins near a border can land in the
                          wrong country)
                        </label>
                      )}
                    </div>
                  )}

                  {c.action === 'layer' && (
                    <div className="import-folder-detail row">
                      <label>
                        Side
                        <select
                          value={c.sideId ?? ''}
                          onChange={(e) => change(f.index, { sideId: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">Choose…</option>
                          {sideCountries.map((code) => (
                            <optgroup key={code} label={code}>
                              {sides
                                .filter((s) => s.country_code === code)
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))}
                        </select>
                      </label>
                      <label>
                        Layer name
                        <input
                          dir="auto"
                          value={c.layerName ?? ''}
                          onChange={(e) => change(f.index, { layerName: e.target.value })}
                        />
                      </label>
                    </div>
                  )}

                  {c.action === 'events' && (
                    <div className="import-folder-detail row">
                      <label>
                        Event type
                        <select
                          value={c.eventTypeId ?? ''}
                          onChange={(e) => change(f.index, { eventTypeId: e.target.value ? Number(e.target.value) : null })}
                        >
                          <option value="">Choose…</option>
                          {eventTypes.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      {countryCodes.length > 1 && (
                        <label className="bulk-check">
                          <input
                            type="checkbox"
                            checked={c.fileCountry === true}
                            onChange={(e) => change(f.index, { fileCountry: e.target.checked })}
                          />
                          Put all of them in {country}
                        </label>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <p className="hint">
            Frontline layers and strikes get the date {date}. Folders with the same layer name are joined into one layer. Bases
            already on the map (same type, within 50 m) are skipped.
          </p>

          {missing.length > 0 && (
            <p className="hint">Still to choose: {missing.map((c) => preview.folders[c.index].name).join(', ')}</p>
          )}

          <div className="row">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={startOver}>
              Cancel
            </button>
            <button className="btn" type="button" disabled={busy || missing.length > 0 || nothingChosen} onClick={runImport}>
              {busy ? 'Importing…' : '2. Import'}
            </button>
          </div>
        </>
      )}

      {result && (
        <div className="import-summary done">
          <strong>Import finished</strong>
          <ul>
            {result.bases.saved + result.bases.duplicates > 0 && (
              <li>
                Bases added: {result.bases.saved}
                {Object.keys(result.bases.byType).length > 0 &&
                  ` (${Object.entries(result.bases.byType)
                    .map(([name, n]) => `${name} ${n}`)
                    .join(', ')})`}
              </li>
            )}
            {result.bases.linked > 0 && <li>Air defence / radar linked to their system: {result.bases.linked}</li>}
            {Object.keys(result.bases.missing).length > 0 && (
              <li>
                No system in Weapons yet (add it there, they get linked):{' '}
                {Object.entries(result.bases.missing)
                  .map(([name, n]) => `${name} (${n})`)
                  .join(', ')}
              </li>
            )}
            {result.bases.duplicates > 0 && <li>Bases already on the map (skipped): {result.bases.duplicates}</li>}
            {result.layers.map((l) => (
              <li key={l.name}>
                <bdi>{l.name}</bdi>: {l.replaced ? 'replaced' : 'new version'} · {count(l.areas, 'area')},{' '}
                {count(l.lines, 'line')}, {count(l.icons, 'icon')}
              </li>
            ))}
            {result.events.saved + result.events.duplicates > 0 && <li>Strikes added: {result.events.saved}</li>}
            {result.events.duplicates > 0 && <li>Strikes already saved (skipped): {result.events.duplicates}</li>}
            {result.skipped > 0 && <li>Skipped: {result.skipped}</li>}
            {result.invalid > 0 && <li>Bad coordinates or at 0,0 (skipped): {result.invalid}</li>}
            {result.fileIcons > 0 && <li>With their own icon from the KMZ: {result.fileIcons}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}