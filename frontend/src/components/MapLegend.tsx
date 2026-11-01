import { useState } from 'react'
import airportIcon from '../assets/icons/airport.png'
import militaryBaseIcon from '../assets/icons/military_base.png'
import navalBaseIcon from '../assets/icons/naval_base.png'
import fightingIcon from '../assets/icons/fighting.png'
import explosionIcon from '../assets/icons/explosion.png'
import { ALERT_COLORS } from '../map/alertsLayer'
import type { Category, Visible } from '../map/filters'

interface Props {
  visible: Visible
  onToggle: (category: Category) => void
  onShowAll: () => void
}

// The box in the corner: explains each symbol, and each line is a switch to show / hide it.
export default function MapLegend({ visible, onToggle, onShowAll }: Props) {
  // Open on computers, closed on phones (it would cover the map)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

  // One line = one switch
  function row(category: Category, symbol: React.ReactNode, label: string) {
    return (
      <label key={category} className={visible[category] ? 'legend-row' : 'legend-row off'}>
        <input type="checkbox" checked={visible[category]} onChange={() => onToggle(category)} />
        {symbol}
        {label}
      </label>
    )
  }

  return (
    <div className="map-panel map-legend">
      <button className="legend-header" onClick={() => setOpen(!open)}>
        Layers <span>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          {row('rockets', <span className="legend-alert" style={{ background: ALERT_COLORS.rockets }} />, `Siren: rockets `)}
          {row('drones', <span className="legend-alert" style={{ background: ALERT_COLORS.drone }} />, `Siren: drones `)}
          {row('events', <span className="legend-pin" />, 'Events (strike, drone…)')}
          {row('frontlines', <span className="legend-area" />, 'Frontlines & fighting')}
          {row('explosion', <img src={explosionIcon} alt="" />, 'Explosion')}
          {row('fighting', <img src={fightingIcon} alt="" />, 'Fighting')}
          {row('airport', <img src={airportIcon} alt="" />, 'Airports')}
          {row('military_base', <img src={militaryBaseIcon} alt="" />, 'Military bases')}
          {row('naval_base', <img src={navalBaseIcon} alt="" />, 'Naval bases')}

          <button className="legend-show-all" onClick={onShowAll}>
            Show all
          </button>

          <div className="legend-note">
            Siren alerts are unofficial and can be late.
            <br />
            For your safety, use the official Home Front Command app.
          </div>
        </>
      )}
    </div>
  )
}