import { ALL, countryName } from '../map/filters'

interface Props {
  countries: string[] // e.g. ['IR', 'IL', 'YE']
  selected: string // 'ALL' or a country code
  onSelect: (country: string) => void
}

// The tabs at the top of the map: All + one per country
export default function CountryTabs({ countries, selected, onSelect }: Props) {
  return (
    <nav className="map-panel country-tabs" aria-label="Countries">
      {[ALL, ...countries].map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={code === selected}
          className={code === selected ? 'country-tab active' : 'country-tab'}
          onClick={() => onSelect(code)}
        >
          {code === ALL ? 'All' : countryName(code)}
        </button>
      ))}
    </nav>
  )
}