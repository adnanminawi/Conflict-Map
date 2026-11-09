import { useState } from 'react'
import type { PlacedWeapon } from '../map/weaponsLayer'
import type { Weapon } from '../types'

interface Props {
  systems: Weapon[] // the air defence systems and radars of the open country tab
  colorOf: (w: Weapon) => string // the system's color, the same on the map
  sitesOf: (w: Weapon) => number // how many sites on the map have this system
  selectedId: number | null // the system whose coverage is shown
  onSelect: (id: number | null) => void
  loading: boolean // the coverage is being calculated
  allOn: boolean // "Show all together" is on
  onToggleAll: () => void
  placed: PlacedWeapon[] // systems the visitor placed by hand
  placing: Weapon | null
  onPlace: (w: Weapon) => void
  onCancelPlacing: () => void
  onRemove: (id: number) => void
  onClearAll: () => void
  // "All" tab: show the countries instead. Clicking one opens its tab.
  showCountries: boolean
  onSelectCountry: (code: string) => void
}

// The countries that have systems, with how many (A to Z)
function countriesOf(systems: Weapon[]) {
  const list: { code: string; name: string; count: number }[] = []
  for (const w of systems) {
    let c = list.find((x) => x.code === w.country_code)
    if (!c) {
      c = { code: w.country_code, name: w.country_name, count: 0 }
      list.push(c)
    }
    c.count++
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

// The box under the weapons: click a system to see where its sites cover, or place one anywhere.
export default function DefencePanel(props: Props) {
  const { systems, colorOf, sitesOf, selectedId, onSelect, loading, allOn, onToggleAll, placed, placing, onPlace, onCancelPlacing, onRemove, onClearAll } = props
  const [open, setOpen] = useState(true)

  // Interceptors first, radars after, each shortest range first
  const groups = [
    { title: 'Interceptors', items: systems.filter((w) => w.type_code === 'air_defence') },
    { title: 'Radars', items: systems.filter((w) => w.type_code === 'radar') },
  ].map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.range_km - b.range_km) }))
  const longest = Math.max(1, ...systems.map((w) => w.range_km))

  return (
    <div className="map-panel weapons-panel">
      <button type="button" className="key-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Air defence
        <span className="key-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          {props.showCountries ? (
            <>
              <p className="reach-hint">Choose a country to see its air defence.</p>
              {systems.length === 0 && <p className="reach-hint">No air defence listed yet.</p>}
              <div className="reach-list reach-list-countries">
                {countriesOf(systems).map((c) => (
                  <button key={c.code} type="button" className="reach-weapon" onClick={() => props.onSelectCountry(c.code)}>
                    <span className="reach-line">
                      <span className="reach-name">{c.name}</span>
                    </span>
                    <span className="reach-type">{c.count === 1 ? '1 system' : `${c.count} systems`}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {placing ? (
                <div className="reach-placing" role="status">
                  <span>
                    Click the map where <strong>{placing.name}</strong> would stand.
                  </span>
                  <button type="button" className="key-reset" onClick={onCancelPlacing}>
                    Cancel
                  </button>
                </div>
              ) : (
                systems.length > 0 && <p className="reach-hint">Choose a system to see where its sites cover, or place it anywhere.</p>
              )}
              {systems.length === 0 && <p className="reach-hint">No air defence listed for this country yet.</p>}

              {/* Every system of this country at once, each in its color (radars dashed) */}
              {systems.length > 1 && (
                <div className="reach-border">
                  <button type="button" className={allOn ? 'reach-toggle on' : 'reach-toggle'} aria-pressed={allOn} onClick={onToggleAll} disabled={loading}>
                    {allOn && loading ? 'Drawing…' : allOn ? 'Hide all' : 'Show all together'}
                  </button>
                  {allOn && <p className="reach-hint">Solid lines intercept, dashed lines are radars. Click a system to see it alone.</p>}
                </div>
              )}

              <div className="reach-list">
                {groups
                  .filter((g) => g.items.length > 0)
                  .map((g) => (
                    <div key={g.title} className="reach-group">
                      <div className="key-group-name">{g.title}</div>
                      {g.items.map((w) => {
                        const selected = selectedId === w.id || allOn
                        const sites = sitesOf(w)
                        return (
                          // A row, not a button: it holds its own "Place it" button
                          <div
                            key={w.id}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selected}
                            className={selected ? 'reach-weapon active' : 'reach-weapon'}
                            onClick={() => onSelect(selectedId === w.id ? null : w.id)}
                            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(selectedId === w.id ? null : w.id))}
                          >
                            <span className="reach-line">
                              <span className="reach-name">{w.name}</span>
                              <span className="reach-km">{w.range_km.toLocaleString()} km</span>
                            </span>
                            <span className="reach-bar" aria-hidden>
                              <span style={{ width: `${(w.range_km / longest) * 100}%`, background: colorOf(w) }} />
                            </span>
                            <span className="reach-type defence-row-foot">
                              {selectedId === w.id && loading ? 'Drawing…' : sites === 0 ? 'No sites on the map' : sites === 1 ? '1 site' : `${sites} sites`}
                              <button
                                type="button"
                                className="place-btn"
                                aria-pressed={placing?.id === w.id}
                                onClick={(e) => {
                                  e.stopPropagation() // placing is not selecting
                                  if (placing?.id === w.id) onCancelPlacing()
                                  else onPlace(w)
                                }}
                              >
                                {placing?.id === w.id ? 'Cancel' : 'Place it'}
                              </button>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  ))}
              </div>
            </>
          )}

          {placed.length > 0 && (
            <div className="reach-placed">
              <div className="reach-placed-head">
                <span className="key-group-name">Placed on the map</span>
                <button type="button" className="key-reset" onClick={onClearAll}>
                  Remove all
                </button>
              </div>
              {placed.map((p) => (
                <div key={p.id} className="reach-placed-row">
                  <span className="side-dot" style={{ background: colorOf(p.weapon) }} />
                  <span className="reach-name">{p.weapon.name}</span>
                  <span className="reach-km">{p.weapon.range_km.toLocaleString()} km</span>
                  <button type="button" className="reach-remove" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.weapon.name}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="reach-hint defence-note">Approximate published ranges, not actual coverage.</p>
        </>
      )}
    </div>
  )
}