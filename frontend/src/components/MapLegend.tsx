import { useState } from 'react'
import type { Category, LegendSide, Visible } from '../map/filters'
import militaryBaseIcon from '../assets/icons/military_base.png'
import airportIcon from '../assets/icons/airport.png'
import navalBaseIcon from '../assets/icons/naval_base.png'
import airDefenceIcon from '../assets/icons/air_defence.png'
import radarIcon from '../assets/icons/radar.png'
import missileBaseIcon from '../assets/icons/missile_base.png'
import fightingIcon from '../assets/icons/fighting.png'
import explosionIcon from '../assets/icons/explosion.png'

interface Props {
  sides: LegendSide[] // the selected country's sides (empty in "All countries")
  allCountries: boolean // "All countries" is chosen: no sides to show yet
  hiddenSides: number[]
  onToggleSide: (sideId: number) => void
  hiddenLayers: string[] // layer names the visitor switched off
  onToggleLayer: (name: string) => void
  showSirens: boolean // Israel or All countries: the siren areas are on the map, so they need a key
  visible: Visible
  onToggle: (category: Category) => void
  counts: Partial<Record<Category, number>> // how many of each the selected country has (0 or missing = no row)
  onShowAll: () => void // switch every type back on
}

// The types the visitor can show / hide, in this order, with the same picture as on the map.
// Strikes have no picture of their own (each event type has its color): a red dot stands for them.
const TYPES: { category: Category; label: string; icon?: string }[] = [
  { category: 'military_base', label: 'Military bases', icon: militaryBaseIcon },
  { category: 'airport', label: 'Airports', icon: airportIcon },
  { category: 'naval_base', label: 'Naval bases', icon: navalBaseIcon },
  { category: 'air_defence', label: 'Air defence', icon: airDefenceIcon },
  { category: 'radar', label: 'Radars', icon: radarIcon },
  { category: 'missile_base', label: 'Missile bases', icon: missileBaseIcon },
  { category: 'events', label: 'Strikes' },
  { category: 'fighting', label: 'Fighting', icon: fightingIcon },
  { category: 'explosion', label: 'Explosions', icon: explosionIcon },
]

// The map key: a small see-through box in the bottom-left corner of the map.
// It explains the frontline colors and the icons, and each checkbox shows or hides that side, layer or type.
export default function MapLegend({
  sides,
  allCountries,
  hiddenSides,
  onToggleSide,
  hiddenLayers,
  onToggleLayer,
  visible,
  onToggle,
  counts,
  onShowAll,
}: Props) {
  // Open on computers, closed on phones (it would cover the map)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

  // Only the types this country has: no empty "Naval bases (0)" rows
  const types = TYPES.filter((t) => (counts[t.category] ?? 0) > 0)
  const someHidden = types.some((t) => !visible[t.category])

  return (
    <div className="map-key" aria-label="Map key">
      <div className="map-key-head">
        <h2 className="side-title">Frontlines</h2>
        <button type="button" className="map-key-fold" aria-expanded={open} aria-label={open ? 'Hide the key' : 'Show the key'} onClick={() => setOpen(!open)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={open ? 'm6 9 6 6 6-6' : 'm6 15 6-6 6 6'} />
          </svg>
        </button>
      </div>

      {open && (
        <>
          {sides.length === 0 && (
            <p className="side-note">{allCountries ? 'Choose a country to see who holds which areas.' : 'No frontlines drawn for this country yet.'}</p>
          )}

          {sides.map((side) => {
            const on = !hiddenSides.includes(side.id)
            return (
              <div key={side.id} className="map-key-group">
                <label className="map-key-row">
                  <input type="checkbox" checked={on} onChange={() => onToggleSide(side.id)} />
                  {/* The side's color, see-through like its areas on the map */}
                  <span className="map-key-area" style={{ background: `${side.color}73`, borderColor: side.color }} />
                  {side.name}
                </label>
                {/* Its layers, one step in. A hidden side hides them all. */}
                {side.layers.length > 1 &&
                  side.layers.map((name) => (
                    <label key={name} className={on ? 'map-key-row map-key-layer' : 'map-key-row map-key-layer off'}>
                      <input type="checkbox" checked={!hiddenLayers.includes(name)} disabled={!on} onChange={() => onToggleLayer(name)} />
                      <bdi>{name}</bdi>
                    </label>
                  ))}
              </div>
            )
          })}

          {/* Bases, airports, air defence, strikes…: one checkbox per type the country has */}
          {types.length > 0 && (
            <div className="map-key-section">
              <div className="map-key-section-head">
                <h3 className="map-key-sub">On the map</h3>
                {someHidden && (
                  <button type="button" className="map-key-link" onClick={onShowAll}>
                    Show all
                  </button>
                )}
              </div>
              <div className="map-key-group">
                {types.map((t) => (
                  <label key={t.category} className={visible[t.category] ? 'map-key-row' : 'map-key-row off'}>
                    <input type="checkbox" checked={visible[t.category]} onChange={() => onToggle(t.category)} />
                    {t.icon ? <img className="map-key-icon" src={t.icon} alt="" /> : <span className="map-key-dot" aria-hidden="true" />}
                    <span className="map-key-label">{t.label}</span>
                    <span className="map-key-count">{counts[t.category]}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}