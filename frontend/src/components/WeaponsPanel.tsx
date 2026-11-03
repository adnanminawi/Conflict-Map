import { useState } from 'react'
import type { PlacedWeapon } from '../map/weaponsLayer'
import type { Weapon } from '../types'

interface Props {
  weapons: Weapon[] // the weapons of the selected country tab
  placed: PlacedWeapon[] // what the visitor put on the map (all countries)
  placing: Weapon | null // chosen, waiting for a click on the map
  onPlace: (weapon: Weapon) => void
  onCancelPlacing: () => void
  onRemove: (id: number) => void
  onClearAll: () => void
}

// The box in the bottom-right corner: pick a weapon, click the map, see how far it reaches.
export default function WeaponsPanel({ weapons, placed, placing, onPlace, onCancelPlacing, onRemove, onClearAll }: Props) {
  // Open on computers, closed on phones (like the legend)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

  return (
    <div className="map-panel weapons-panel">
      <button className="legend-header" onClick={() => setOpen(!open)}>
        Weapon ranges <span>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <>
          {placing ? (
            <div className="weapons-placing">
              Click the map to place <strong>{placing.name}</strong>
              <button className="btn btn-small btn-ghost" onClick={onCancelPlacing}>
                Cancel
              </button>
            </div>
          ) : (
            <p className="weapons-hint">Choose a weapon, then click the map.</p>
          )}

          {weapons.length === 0 && <p className="weapons-hint">No weapons for this country yet.</p>}
          <div className="weapons-list">
            {weapons.map((w) => (
              <button
                key={w.id}
                className={placing?.id === w.id ? 'weapon-choice active' : 'weapon-choice'}
                onClick={() => onPlace(w)}
                title={w.side_name ? `${w.side_name} · ${w.country_name}` : w.country_name}
              >
                <span className="side-dot" style={{ background: w.side_color ?? '#22c55e' }} />
                <span className="weapon-name">{w.name}</span>
                <span className="weapon-range">{w.range_km.toLocaleString()} km</span>
              </button>
            ))}
          </div>

          {placed.length > 0 && (
            <>
              <div className="weapons-placed-title">
                On the map ({placed.length})
                <button className="legend-show-all" onClick={onClearAll}>
                  Clear all
                </button>
              </div>
              {placed.map((p) => (
                <div key={p.id} className="weapon-placed">
                  {p.weapon.name}
                  <button className="weapon-remove" onClick={() => onRemove(p.id)} title="Remove">
                    ×
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}