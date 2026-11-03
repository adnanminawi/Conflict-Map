import { useState } from 'react'
import { createSide } from '../api/admin'
import { getErrorMessage } from '../api/client'
import type { Side } from '../types'
import CountrySelect from './CountrySelect'

interface Props {
  sides: Side[] // every side of every country
  country: string
  sideId: number | null
  onCountryChange: (country: string) => void
  onSideChange: (sideId: number | null) => void
  onSideCreated: (side: Side) => void // the parent adds it to its list
}

// Country → side (or create a new side). Used by the upload form and the map editor.
export default function SidePicker({ sides, country, sideId, onCountryChange, onSideChange, onSideCreated }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#E5484D')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const countrySides = sides.filter((s) => s.country_code === country)

  function changeCountry(code: string) {
    onCountryChange(code)
    // The chosen side belongs to another country → clear it
    if (sides.find((s) => s.id === sideId)?.country_code !== code) onSideChange(null)
  }

  function changeSide(value: string) {
    if (value === 'new') {
      setCreating(true)
      return
    }
    setCreating(false)
    onSideChange(value ? Number(value) : null)
  }

  async function addSide() {
    setError('')
    setBusy(true)
    try {
      const side = await createSide({ country, name: newName.trim(), color: newColor })
      onSideCreated(side)
      onSideChange(side.id)
      setCreating(false)
      setNewName('')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <label>
        Country
        <CountrySelect value={country} onChange={changeCountry} required />
      </label>

      <label>
        Side
        <select
          value={creating ? 'new' : (sideId ?? '')}
          onChange={(e) => changeSide(e.target.value)}
          disabled={country.length !== 2}
          required
        >
          <option value="">{country.length === 2 ? 'Choose a side' : 'Choose the country first'}</option>
          {countrySides.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value="new">+ New side…</option>
        </select>
      </label>

      {creating && (
        <div className="new-side">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Side name, e.g. Houthis" />
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} title="Legend color" />
          <button type="button" className="btn btn-small" onClick={addSide} disabled={busy || !newName.trim()}>
            Add
          </button>
          <button type="button" className="btn btn-small btn-ghost" onClick={() => setCreating(false)}>
            Cancel
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </>
  )
}