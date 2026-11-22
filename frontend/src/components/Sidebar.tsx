import type { ReactNode } from 'react'
import { ALL, countryName } from '../map/filters'

export type View = 'map' | 'events' | 'news' | 'reach'

interface Props {
  view: View
  onView: (view: View) => void
  newCount: number // news that arrived since the visitor last opened News
  countries: string[] // e.g. ['IR', 'IL', 'YE']
  country: string // 'ALL' or a country code
  onSelectCountry: (code: string) => void
  children: ReactNode // what the chosen page shows under the country picker
}

// The icons of the menu: simple line drawings, colored by the text color (currentColor)
const ICONS: Record<View, ReactNode> = {
  map: (
    <>
      <path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </>
  ),
  events: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  news: (
    <>
      <path d="M5 4h11v16H7a2 2 0 0 1-2-2z" />
      <path d="M16 9h3v9a2 2 0 0 1-2 2h-1" />
      <path d="M8 8h5M8 12h5M8 16h3" />
    </>
  ),
  reach: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
}

const LABELS: Record<View, string> = { map: 'Map', events: 'Events', news: 'News', reach: 'Weapon reach' }

// The white panel on the left: the menu, the country, then the chosen page (news, events, weapons…)
export default function Sidebar({ view, onView, newCount, countries, country, onSelectCountry, children }: Props) {
  return (
    <aside className={`sidebar view-${view}`}>
      <nav className="side-nav" aria-label="Sections">
        {(Object.keys(LABELS) as View[]).map((v) => (
          <button
            key={v}
            type="button"
            className={v === view ? 'side-nav-item active' : 'side-nav-item'}
            aria-current={v === view ? 'page' : undefined}
            onClick={() => onView(v)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[v]}
            </svg>
            {LABELS[v]}
            {v === 'news' && newCount > 0 && <span className="side-badge">{newCount} new</span>}
          </button>
        ))}
      </nav>

      <label className="side-country">
        <span className="side-country-label">Country</span>
        <select value={country} onChange={(e) => onSelectCountry(e.target.value)}>
          <option value={ALL}>All countries</option>
          {countries.map((code) => (
            <option key={code} value={code}>
              {countryName(code)}
            </option>
          ))}
        </select>
      </label>

      <div className="side-body">{children}</div>
    </aside>
  )
}