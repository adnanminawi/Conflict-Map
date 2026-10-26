import { useEffect, useState } from 'react'
import { createEvent, fetchEventTypes } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import type { EventType } from '../types'

interface Props {
  onLoggedOut: () => void
}

// Current local time in the format <input type="datetime-local"> expects: "2026-10-25T18:30"
function nowForInput(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

export default function EventForm({ onLoggedOut }: Props) {
  const [types, setTypes] = useState<EventType[]>([])

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [typeId, setTypeId] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [occurredAt, setOccurredAt] = useState(nowForInput())
  const [status, setStatus] = useState<'unverified' | 'confirmed' | 'false'>('unverified')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Load the event types for the dropdown
  useEffect(() => {
    fetchEventTypes()
      .then(setTypes)
      .catch(() => setError('Could not load event types'))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setSaving(true)
    try {
      const id = await createEvent({
        title,
        description,
        event_type_id: Number(typeId),
        lat: Number(lat),
        lng: Number(lng),
        occurred_at: new Date(occurredAt).toISOString(), // local time → UTC
        status,
      })
      setMessage(`Event #${id} saved`)
      setTitle('')
      setDescription('')
    } catch (err) {
      if (isUnauthorized(err)) onLoggedOut() // login expired → back to the login form
      else setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

    return (
    <form className="card" onSubmit={handleSubmit}>
      <h2>Add event</h2>
      <p className="muted">New events are hidden from the public map until confirmed.</p>

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
      </label>

      <label>
        Type
        <select value={typeId} onChange={(e) => setTypeId(e.target.value)} required>
          <option value="">Choose…</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>

      <div className="section-title">Location</div>

      <div className="row">
        <label>
          Latitude
          <input type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} required />
        </label>
        <label>
          Longitude
          <input type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} required />
        </label>
      </div>

      <div className="section-title">Time &amp; status</div>

      <label>
        When it happened (your local time)
        <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
      </label>

      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="unverified">Unverified (hidden)</option>
          <option value="confirmed">Confirmed (on the map)</option>
          <option value="false">False</option>
        </select>
      </label>

      <div className="section-title">Details</div>

      <label>
        Description (optional)
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </label>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      <button className="btn" type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save event'}
      </button>
    </form>
  )
}