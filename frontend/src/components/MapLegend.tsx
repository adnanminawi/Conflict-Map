import { useState } from 'react'
import type { Category, LegendSide, Visible } from '../map/filters'

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
}

// The map key: a small see-through box in the bottom-left corner of the map.
// It explains the frontline colors, and each checkbox shows or hides that side or layer.
export default function MapLegend({ sides, allCountries, hiddenSides, onToggleSide, hiddenLayers, onToggleLayer, }: Props) {
  // Open on computers, closed on phones (it would cover the map)
  const [open, setOpen] = useState(() => window.innerWidth > 600)

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

          
        </>
      )}
    </div>
  )
}