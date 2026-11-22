import type { MapEvent } from '../types'

interface Props {
  events: MapEvent[] // the selected country's events, newest first
  onPick: (event: MapEvent) => void // the map flies there
}

const MAX_SHOWN = 100 // a long list is slow and nobody scrolls that far

// "6 Nov 2026, 17:59"
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Events page of the side panel: the confirmed events, newest first. Clicking one shows it on the map.
export default function EventsFeed({ events, onPick }: Props) {
  return (
    <section className="side-section" aria-labelledby="events-title">
      <h2 id="events-title" className="side-title">
        Confirmed events
      </h2>
      {events.length === 0 && <p className="side-note">No events here yet.</p>}
      <ul className="news-list">
        {events.slice(0, MAX_SHOWN).map((e) => (
          <li key={e.id}>
            <button type="button" className="news-item" onClick={() => onPick(e)}>
              <span className="news-meta">
                {when(e.occurred_at)}
                {e.location_name && (
                  <>
                    , <bdi>{e.location_name}</bdi>
                  </>
                )}
              </span>
              <span className="news-title" dir="auto">
                {e.title}
              </span>
              <span className="event-type">
                <span className="event-dot" style={{ background: e.color ?? '#c0262d' }} />
                {e.type_name}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}