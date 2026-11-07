import { useEffect, useState } from 'react'
import airportIcon from '../assets/icons/airport.png'
import militaryBaseIcon from '../assets/icons/military_base.png'
import navalBaseIcon from '../assets/icons/naval_base.png'
import airDefenceIcon from '../assets/icons/air_defence.png'
import radarIcon from '../assets/icons/radar.png'
import fightingIcon from '../assets/icons/fighting.png'
import explosionIcon from '../assets/icons/explosion.png'
import { ALERT_COLORS, ALERT_MINUTES } from '../map/alertsLayer'
import { ALL_VISIBLE, type Category, type LegendSide, type Visible } from '../map/filters'

interface Props {
  visible: Visible
  onToggle: (category: Category) => void
  onShowAll: () => void
  sides: LegendSide[] // the selected country's sides (empty in "All")
  hiddenSides: number[]
  onToggleSide: (sideId: number) => void
  autoFold: boolean // a country with weapons is open: fold the key so the weapons box gets the room
}

// The map key in the bottom-left corner. Each line explains a symbol,
// and clicking the line shows or hides it on the map (a dimmed line = hidden).
export default function MapLegend({ visible, onToggle, onShowAll, sides, hiddenSides, onToggleSide, autoFold }: Props) {
  // Open on computers, closed on phones (it would cover the map)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

  // Country with weapons (e.g. Iran) → fold the key. Back to "All" or a country without weapons → open it again (on computers).
  // The visitor can still open it with its title.
  useEffect(() => {
    setOpen(!autoFold && window.innerWidth > 600)
  }, [autoFold])

  // Something is hidden → offer "Show everything"
  const somethingHidden = hiddenSides.length > 0 || (Object.keys(ALL_VISIBLE) as Category[]).some((c) => !visible[c])

  // One line of the key = one switch
  function row(category: Category, symbol: React.ReactNode, label: string, detail?: string) {
    const on = visible[category]
    return (
      <button
        key={category}
        type="button"
        className={on ? 'key-row' : 'key-row off'}
        aria-pressed={on}
        title={on ? 'Click to hide' : 'Click to show'}
        onClick={() => onToggle(category)}
      >
        <span className="key-symbol">{symbol}</span>
        <span className="key-label">
          {label}
          {detail && <span className="key-detail">{detail}</span>}
        </span>
      </button>
    )
  }

  return (
    <div className="map-panel map-legend">
      <button type="button" className="key-title" aria-expanded={open} onClick={() => setOpen(!open)}>
        Map key
        <span className="key-chevron" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <>
          <div className="key-group">
            <div className="key-group-name">Sirens in Israel</div>
            {row('rockets', <span className="key-swatch" style={{ background: ALERT_COLORS.rockets }} />, 'Rockets', `last ${ALERT_MINUTES} min`)}
            {row('drones', <span className="key-swatch" style={{ background: ALERT_COLORS.drone }} />, 'Drones', `last ${ALERT_MINUTES} min`)}
          </div>

          <div className="key-group">
            <div className="key-group-name">On the ground</div>
            {row('events', <span className="legend-pin" />, 'Confirmed events')}
            {row('frontlines', <span className="key-area" />, 'Frontlines')}
            {/* The selected country's sides, indented under Frontlines */}
            {sides.map((side) => {
              const on = !hiddenSides.includes(side.id)
              return (
                <button
                  key={side.id}
                  type="button"
                  className={on && visible.frontlines ? 'key-row key-side' : 'key-row key-side off'}
                  aria-pressed={on}
                  disabled={!visible.frontlines}
                  onClick={() => onToggleSide(side.id)}
                >
                  <span className="key-symbol">
                    <span className="side-dot" style={{ background: side.color }} />
                  </span>
                  <span className="key-label">{side.name}</span>
                </button>
              )
            })}
            {row('fighting', <img src={fightingIcon} alt="" />, 'Fighting')}
            {row('explosion', <img src={explosionIcon} alt="" />, 'Explosions')}
          </div>

          <div className="key-group">
            <div className="key-group-name">Military sites</div>
            {row('airport', <img src={airportIcon} alt="" />, 'Airports')}
            {row('military_base', <img src={militaryBaseIcon} alt="" />, 'Military bases')}
            {row('naval_base', <img src={navalBaseIcon} alt="" />, 'Naval bases')}
            {row('air_defence', <img src={airDefenceIcon} alt="" />, 'Air defence')}
            {row('radar', <img src={radarIcon} alt="" />, 'Radars')}
          </div>

          {somethingHidden && (
            <button type="button" className="key-reset" onClick={onShowAll}>
              Show everything
            </button>
          )}

          <p className="key-note">Siren alerts are unofficial and may be late. Follow the Home Front Command app for your safety.</p>
        </>
      )}
    </div>
  )
}