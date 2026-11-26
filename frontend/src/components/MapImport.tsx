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

// Adds one folder's counts into a total: { 'SA-2': 28 } + { 'SA-2': 3, HAWK: 12 } → { 'SA-2': 31, HAWK: 12 }
function addCounts(total: Record<string, number>, more: Record<string, number>) {
  for (const [key, n] of Object.entries(more)) total[key] = (total[key] ?? 0) + n
}

// "SA-2 (28), HAWK (12)", the biggest first
function listCounts(counts: Record<string, number>, label: (key: string) => string = (k) => k) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${label(key)} (${n})`)
    .join(', ')
}

// "EWR (1 x 36D6…)" and "EWR (Radome)" → "EWR": the name before the bracket, so one system is one line.
// The same name in other capitals ("Hawk" / "HAWK") is joined too, under the first spelling met.
function groupByName(counts: Record<string, number>): Record<string, number> {
  const grouped: Record<string, number> = {}
  const spelling: Record<string, string> = {} // lower-case name → the spelling shown
  for (const [label, n] of Object.entries(counts)) {
    const name = label.split(' (')[0].trim() || label
    const key = name.toLowerCase()
    spelling[key] ??= name
    addCounts(grouped, { [spelling[key]]: n })
  }
  return grouped
}

const SHORT_LIST = 6 // the missing systems shown before "+N more"

// One Google Earth / My Maps file with bases, frontlines and strikes.
// Step 1: read the file → the backend guesses what each folder is.
// Step 2: a short summary of what will be imported, and only the problems. The full folder list is folded.
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
  const [allSystems, setAllSystems] = useState(false) // "+N more" was clicked: show every missing system

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
    setAllSystems(false)
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

  // Changes several folders at once (used by the alerts: "put them all in…", "save them as…")
  function changeMany(indexes: number[], patch: Partial<FolderChoice>) {
    setChoices((all) => all.map((c) => (indexes.includes(c.index) ? { ...c, ...patch } : c)))
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

  // ---------- Fields shared by the alerts and the folder list ----------

  // Side + layer name of a frontline folder
  function layerFields(c: FolderChoice) {
    return (
      <>
        <label>
          Side
          <select value={c.sideId ?? ''} onChange={(e) => change(c.index, { sideId: e.target.value ? Number(e.target.value) : null })}>
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
          <input dir="auto" value={c.layerName ?? ''} onChange={(e) => change(c.index, { layerName: e.target.value })} />
        </label>
      </>
    )
  }

  // Event type of a strikes folder
  function eventTypeField(c: FolderChoice) {
    return (
      <label>
        Event type
        <select
          value={c.eventTypeId ?? ''}
          onChange={(e) => change(c.index, { eventTypeId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Choose…</option>
          {eventTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
    )
  }

  // ---------- The full folder list (folded under "Change folders") ----------

  function folderList() {
    if (!preview) return null
    return (
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
                  {f.unclear > 0 && (
                    <div className="row">
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
                    </div>
                  )}
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

              {c.action === 'layer' && <div className="import-folder-detail row">{layerFields(c)}</div>}

              {c.action === 'events' && (
                <div className="import-folder-detail row">
                  {eventTypeField(c)}
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
    )
  }

  // ---------- The short version: what will be imported, and only the problems ----------

  // Each folder with the admin's current choice
  const folders = preview ? preview.folders.map((f) => ({ f, c: choices[f.index] })).filter(({ c }) => c) : []
  const withAction = (action: FolderAction) => folders.filter(({ c }) => c.action === action)
  const baseFolders = withAction('bases')
  const pinFolders = [...baseFolders, ...withAction('events')] // the folders whose pins get a country

  // What will be imported
  const baseTotal = baseFolders.reduce((n, { f }) => n + f.points, 0)
  const basesByType: Record<string, number> = {}
  for (const { f, c } of baseFolders) {
    addCounts(basesByType, f.baseTypes)
    if (f.unclear > 0 && c.typeCode) addCounts(basesByType, { [c.typeCode]: f.unclear }) // they get the folder's type
  }
  const layerNames = [...new Set(withAction('layer').map(({ c }) => c.layerName?.trim() || ''))].filter((n) => n !== '')
  const eventTotal = withAction('events').reduce((n, { f }) => n + f.points, 0)
  const skippedFolders = withAction('skip')

  // Problems worth a look (they don't stop the import)
  const missingRaw: Record<string, number> = {} // air defence / radar systems not in the Weapons tab
  for (const { f } of baseFolders) addCounts(missingRaw, f.systems.missing)
  const missingSystems = groupByName(missingRaw)
  const missingSorted = Object.entries(missingSystems).sort((a, b) => b[1] - a[1])
  const missingShown = allSystems ? missingSorted : missingSorted.slice(0, SHORT_LIST)
  const missingSites = missingSorted.reduce((n, [, sites]) => n + sites, 0)

  const unclearFolders = baseFolders.filter(({ f }) => f.unclear > 0) // pins with no clear type
  const unclearTotal = unclearFolders.reduce((n, { f }) => n + f.unclear, 0)
  // The type each folder gives them: one type for all → that type in the dropdown, several → "their folder's type"
  const unclearByType: Record<string, number> = {}
  for (const { f, c } of unclearFolders) if (c.typeCode) addCounts(unclearByType, { [c.typeCode]: f.unclear })
  const unclearTypes = Object.keys(unclearByType)
  const unclearValue = unclearTypes.length === 1 ? unclearTypes[0] : ''

  // Pins that fall in another country than the main one (found from their location)
  const mixedFolders = pinFolders.filter(({ f }) => Object.keys(f.countries).some((code) => code !== country))
  const otherCountries: Record<string, number> = {}
  for (const { f, c } of mixedFolders) {
    if (c.fileCountry) continue // the admin put them all in the main country
    for (const [code, n] of Object.entries(f.countries)) if (code !== country) addCounts(otherCountries, { [code]: n })
  }
  const allInMain = mixedFolders.length > 0 && mixedFolders.every(({ c }) => c.fileCountry)

  const noAlerts =
    missing.length === 0 && Object.keys(missingSystems).length === 0 && unclearTotal === 0 && mixedFolders.length === 0

  return (
    <div className="card wide">
      <h2>Import map</h2>
      <p className="muted">
        One Google Earth or My Maps file with bases, frontlines and strikes. Read it first, check the summary, then import.
        Nothing is saved until you click Import.
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
          {/* What will be imported, in a few lines */}
          <div className="import-summary ready">
            <strong>
              Ready to import from {count(preview.found, 'placemark')}
            </strong>
            <ul>
              {baseTotal > 0 && (
                <li>
                  {count(baseTotal, 'base')}
                  {Object.keys(basesByType).length > 0 && ` · ${listCounts(basesByType, typeName)}`}
                </li>
              )}
              {layerNames.length > 0 && (
                <li>
                  {count(layerNames.length, 'frontline layer')}: <bdi>{layerNames.join(', ')}</bdi>
                </li>
              )}
              {eventTotal > 0 && <li>{count(eventTotal, 'strike')}</li>}
              {skippedFolders.length > 0 && <li className="import-skipped-line">{count(skippedFolders.length, 'folder')} skipped</li>}
              {nothingChosen && <li>Nothing: every folder is skipped.</li>}
            </ul>
          </div>

          {/* Only the problems */}
          <div className="import-alerts">
            {/* Must be fixed: the Import button waits for these */}
            {missing.map((c) => {
              const f = preview.folders[c.index]
              return (
                <div key={c.index} className="import-alert alert-error">
                  <p>
                    <strong dir="auto">{f.name}</strong>: {c.action === 'layer' ? 'choose its side and layer name.' : 'choose its event type.'}
                  </p>
                  <div className="row">{c.action === 'layer' ? layerFields(c) : eventTypeField(c)}</div>
                </div>
              )
            })}

            {/* Imported anyway, but their range won't show */}
            {Object.keys(missingSystems).length > 0 && (
              <div className="import-alert alert-warn">
                <p>
                  <strong>
                    {count(missingSites, 'site')} with a system that isn't in the Weapons tab, so no range will show:
                  </strong>{' '}
                  {missingShown.map(([name, n]) => `${name} (${n})`).join(', ')}
                  {missingSorted.length > SHORT_LIST && (
                    <>
                      {' '}
                      <button type="button" className="link-button small" onClick={() => setAllSystems(!allSystems)}>
                        {allSystems ? 'show less' : `+${missingSorted.length - SHORT_LIST} more`}
                      </button>
                    </>
                  )}
                </p>
                <p className="import-alert-note">Add them in Weapons with their range, before or after importing: the sites get linked when you add them.</p>
              </div>
            )}

            {/* Pins with no type: one type for all of them */}
            {unclearTotal > 0 && (
              <div className="import-alert alert-info">
                <label className="inline-field">
                  <span>{count(unclearTotal, 'pin')} with no clear type will be saved as</span>
                  <select
                    value={unclearValue}
                    onChange={(e) => {
                      if (e.target.value) changeMany(unclearFolders.map(({ f }) => f.index), { typeCode: e.target.value })
                    }}
                  >
                    {/* Several folders, several types: say so, instead of showing only the first one */}
                    {unclearValue === '' && (
                      <option value="">their folder's type: {listCounts(unclearByType, typeName)}</option>
                    )}
                    {types.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            {/* Pins outside the main country */}
            {mixedFolders.length > 0 && (
              <div className="import-alert alert-info">
                {!allInMain && (
                  <p>
                    Not in {country}, from their location: {listCounts(otherCountries)}.
                  </p>
                )}
                <label className="bulk-check">
                  <input
                    type="checkbox"
                    checked={allInMain}
                    onChange={(e) => changeMany(mixedFolders.map(({ f }) => f.index), { fileCountry: e.target.checked })}
                  />
                  Put them all in {country} (borders are simplified: pins near a border can land in the wrong country)
                </label>
              </div>
            )}

            {noAlerts && !nothingChosen && <p className="import-ok">✓ No problems found.</p>}
          </div>

          {/* The full list, for when a guess is wrong */}
          <details className="import-details">
            <summary>Change folders ({preview.folders.length})</summary>
            {folderList()}
          </details>

          <p className="hint">
            Frontline layers and strikes get the date {date}. Folders with the same layer name are joined into one layer. Bases already on the map (same type, within 50 m) are skipped.
          </p>

          <div className="row">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={startOver}>
              Cancel
            </button>
            <button className="btn" type="button" disabled={busy || missing.length > 0 || nothingChosen} onClick={runImport}>
              {busy ? 'Importing…' : missing.length > 0 ? 'Fix the red items first' : '2. Import'}
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