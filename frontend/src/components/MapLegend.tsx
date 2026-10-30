import airportIcon from '../assets/icons/airport.png'
import militaryBaseIcon from '../assets/icons/military_base.png'
import navalBaseIcon from '../assets/icons/naval_base.png'
import fightingIcon from '../assets/icons/fighting.png'
import explosionIcon from '../assets/icons/explosion.png'
// The small box in the corner that explains what each symbol means.
export default function MapLegend() {
  return (
    <div className="map-panel map-legend">
      <div className="legend-row">
        <span className="legend-pin" /> Event (strike, drone…)
      </div>
      <div className="legend-row">
        <span className="legend-area" /> Frontline / fighting area
      </div>
      <div className="legend-row">
        <img src={fightingIcon} alt="" /> Fighting
      </div>
      <div className="legend-row">
        <img src={explosionIcon} alt="" /> Explosion
      </div>
      <div className="legend-row">
        <img src={airportIcon} alt="" /> Airport
      </div>
      <div className="legend-row">
        <img src={militaryBaseIcon} alt="" /> Military base
      </div>
      <div className="legend-row">
        <img src={navalBaseIcon} alt="" /> Naval base
      </div>
    </div>
  )
}