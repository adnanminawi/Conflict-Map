import { useState } from 'react'
import { DEFAULT_RANGE_COLOR, type PlacedWeapon } from '../map/weaponsLayer'
import type { Weapon } from '../types'

interface Props {
  weapons: Weapon[] // the weapons of the selected country tab
  placed: PlacedWeapon[] // what the visitor put on the map (all countries)
  placing: Weapon | null // chosen, waiting for a click on the map
  onPlace: (weapon: Weapon) => void
  onCancelPlacing: () => void
  onRemove: (id: number) => void
  onClearAll: () => void
  // Reach from the border: only offered when one country tab is open
  reach: { countryName: string; on: boolean; loading: boolean; error: string } | null
  onToggleReach: () => void
  onHoverWeapon: (km: number | null) => void // highlights that weapon's ring while the reach is shown
  // "All" tab: show the countries instead of every weapon. Clicking one opens its tab.
  showCountries: boolean
  onSelectCountry: (code: string) => void
}

// Who has the weapon, as one label: "Houthis, Yemen" or just "United States"
const ownerOf = (w: Weapon) => (w.side_name ? `${w.side_name}, ${w.country_name}` : w.country_name)

// The weapons, grouped by who has them (groups in the order they arrive: by country, then side)
function groupByOwner(weapons: Weapon[]) {
  const groups: { owner: string; color: string; weapons: Weapon[] }[] = []
  for (const w of weapons) {
    const owner = ownerOf(w)
    let group = groups.find((g) => g.owner === owner)
    if (!group) {
      group = { owner, color: w.side_color ?? DEFAULT_RANGE_COLOR, weapons: [] }
      groups.push(group)
    }
    group.weapons.push(w)
  }
  // Shortest range first, like the rings from the border outwards
  for (const g of groups) g.weapons.sort((a, b) => a.range_km - b.range_km)
  return groups
}

// The countries that have weapons, with how many and the longest range (A to Z)
function countriesOf(weapons: Weapon[]) {
  const list: { code: string; name: string; count: number; longest: number }[] = []
  for (const w of weapons) {
    let c = list.find((x) => x.code === w.country_code)
    if (!c) {
      c = { code: w.country_code, name: w.country_name, count: 0, longest: 0 }
      list.push(c)
    }
    c.count++
    c.longest = Math.max(c.longest, w.range_km)
  }
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

// The box in the bottom-right corner: pick a weapon, click the map, see how far it reaches.
export default function WeaponsPanel({ weapons, placed, placing, onPlace, onCancelPlacing, onRemove, onClearAll, reach, onToggleReach, onHoverWeapon, showCountries, onSelectCountry }: Props) {
  // Open on computers, closed on phones (like the map key)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

  // The bars compare the ranges in this list: the longest one fills the bar
  const longest = Math.max(1, ...weapons.map((w) => w.range_km))

  return (
    <div className="map-panel weapons-panel">
      <button type="button" className="key-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Weapon reach
        <span className="key-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          {showCountries ? (
            <>
              <p className="reach-hint">Choose a country to see its weapons and how far they reach.</p>
              {weapons.length === 0 && <p className="reach-hint">No weapons listed yet.</p>}
              {/* Scrolls inside the box when there are many */}
              <div className="reach-list reach-list-countries"></div>
              <div className="reach-list">
                {countriesOf(weapons).map((c) => (
                  <button key={c.code} type="button" className="reach-weapon" onClick={() => onSelectCountry(c.code)}>
                    <span className="reach-line">
                      <span className="reach-name">{c.name}</span>
                      <span className="reach-km">up to {c.longest.toLocaleString()} km</span>
                    </span>
                    <span className="reach-type">{c.count === 1 ? '1 weapon' : `${c.count} weapons`}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              {placing ? (
                <div className="reach-placing" role="status">
                  <span>
                    Click the map where <strong>{placing.name}</strong> would launch from.
                  </span>
                  <button type="button" className="key-reset" onClick={onCancelPlacing}>
                    Cancel
                  </button>
                </div>
              ) : (
                weapons.length > 0 && <p className="reach-hint">Pick a weapon, then click the map to see how far it reaches.</p>
              )}

              {weapons.length === 0 && <p className="reach-hint">No weapons listed for this country yet.</p>}

              {/* Every distance this country's weapons reach, drawn from its border */}
              {reach && weapons.length > 0 && (
                <div className="reach-border">
                  <button type="button" className={reach.on ? 'reach-toggle on' : 'reach-toggle'} aria-pressed={reach.on} onClick={onToggleReach} disabled={reach.loading}>
                    {reach.loading ? 'Calculating…' : reach.on ? `Hide reach from ${reach.countryName}` : `Show reach from ${reach.countryName}`}
                  </button>
                  {reach.on && <p className="reach-hint">Each ring is measured from anywhere on the border. Point at a weapon to find its ring.</p>}
                  {reach.error && <p className="reach-hint reach-error">{reach.error}</p>}
                </div>
              )}

              {/* Scrolls inside the box when there are many */}
              <div className="reach-list">
                {groupByOwner(weapons).map((group) => (
                  <div key={group.owner} className="reach-group">
                    <div className="key-group-name">
                      <span className="side-dot" style={{ background: group.color }} /> {group.owner}
                    </div>
                    {group.weapons.map((w) => (
                      <button
                        key={w.id}
                        type="button"
                        className={placing?.id === w.id ? 'reach-weapon active' : 'reach-weapon'}
                        aria-pressed={placing?.id === w.id}
                        onClick={() => (placing?.id === w.id ? onCancelPlacing() : onPlace(w))}
                        onMouseEnter={() => onHoverWeapon(w.range_km)}
                        onMouseLeave={() => onHoverWeapon(null)}
                        onFocus={() => onHoverWeapon(w.range_km)}
                        onBlur={() => onHoverWeapon(null)}
                      >
                        <span className="reach-line">
                          <span className="reach-name">{w.name}</span>
                          <span className="reach-km">{w.range_km.toLocaleString()} km</span>
                        </span>
                        {/* Length of the bar = range compared with the longest weapon in the list */}
                        <span className="reach-bar" aria-hidden>
                          <span style={{ width: `${(w.range_km / longest) * 100}%`, background: group.color }} />
                        </span>
                        <span className="reach-type">{w.type_name}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}

          {placed.length > 0 && (
            <div className="reach-placed">
              <div className="reach-placed-head">
                <span className="key-group-name">On the map</span>
                <button type="button" className="key-reset" onClick={onClearAll}>
                  Remove all
                </button>
              </div>
              {placed.map((p) => (
                <div key={p.id} className="reach-placed-row">
                  <span className="side-dot" style={{ background: p.weapon.side_color ?? DEFAULT_RANGE_COLOR }} />
                  <span className="reach-name">{p.weapon.name}</span>
                  <span className="reach-km">{p.weapon.range_km.toLocaleString()} km</span>
                  <button type="button" className="reach-remove" onClick={() => onRemove(p.id)} aria-label={`Remove ${p.weapon.name}`}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}