import { useEffect, useState } from 'react'
import { deleteEvent, fetchAdminEvents, updateEventStatus } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { AdminEvent, EventStatus } from '../types'

interface Props {
  onLoggedOut: () => void
}

export default function EventList({ onLoggedOut }: Props) {
  const [events, setEvents] = useState<AdminEvent[]>([])
  const [filter, setFilter] = useState('unverified') // 'unverified' | 'confirmed' | 'false' | 'all'
  const [error, setError] = useState('')

  // Expired login → back to login. Anything else → show the message.
  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  // Get the list from the backend
  async function load() {
    setError('')
    try {
      const status = filter === 'all' ? undefined : (filter as EventStatus)
      setEvents(await fetchAdminEvents(status))
    } catch (err) {
      handleError(err)
    }
  }

  // Load when the page opens, and again when the filter changes
  useEffect(() => {
    load()
    // 
  }, [filter])

  async function changeStatus(id: number, status: EventStatus) {
    try {
      await updateEventStatus(id, status)
      await load() // reload the list so it's always correct
    } catch (err) {
      handleError(err)
    }
  }

  async function remove(id: number) {
    if (!window.confirm('Delete this event? This cannot be undone.')) return
    try {
      await deleteEvent(id)
      await load()
    } catch (err) {
      handleError(err)
    }
  }

  return (
    <div className="card wide">
      <div className="list-header">
        <h2>Events</h2>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="unverified">Unverified</option>
          <option value="confirmed">Confirmed</option>
          <option value="false">False</option>
          <option value="all">All</option>
        </select>
      </div>

      {error && <p className="error">{error}</p>}
      {events.length === 0 && <p className="muted">No events here.</p>}

      <ul className="event-list">
        {events.map((event) => (
          <li key={event.id} className="event-item">
            <div>
              <div className="event-title">
                <span className={`badge ${event.status}`}>{event.status}</span>
                {event.title}
              </div>
              <div className="event-meta">
                {event.type_name} · {new Date(event.occurred_at).toLocaleString()} · by {event.created_by_username}
              </div>
            </div>

            <div className="event-actions">
              {event.status !== 'confirmed' && (
                <button className="btn btn-small" onClick={() => changeStatus(event.id, 'confirmed')}>
                  Confirm
                </button>
              )}
              {event.status !== 'false' && (
                <button className="btn btn-small btn-ghost" onClick={() => changeStatus(event.id, 'false')}>
                  Mark false
                </button>
              )}
              <button className="btn btn-small btn-danger" onClick={() => remove(event.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}