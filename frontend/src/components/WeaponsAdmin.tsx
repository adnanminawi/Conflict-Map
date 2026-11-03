import { useEffect, useState } from 'react'
import { createWeapon, deleteWeapon, fetchWeaponTypes, updateWeapon } from '../api/admin'
import { fetchWeapons } from '../api/weapons'
import { fetchSides } from '../api/sides'
import { getErrorMessage, isUnauthorized } from '../api/client'
import CountrySelect from './CountrySelect'
import type { Side, Weapon, WeaponType } from '../types'

interface Props {
  onLoggedOut: () => void
}

// Add / edit / delete weapons and their range.
// A country with sides (e.g. Yemen) must say which side has the weapon. A country without sides has no side.
export default function WeaponsAdmin({ onLoggedOut }: Props) {
  const [weapons, setWeapons] = useState<Weapon[]>([])
  const [types, setTypes] = useState<WeaponType[]>([])
  const [sides, setSides] = useState<Side[]>([])

  // The form. editingId = null → adding a new weapon
  const [editingId, setEditingId] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [typeId, setTypeId] = useState('')
  const [country, setCountry] = useState('')
  const [sideId, setSideId] = useState('')
  const [range, setRange] = useState('')
  const [source, setSource] = useState('')
  const [description, setDescription] = useState('')

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function handleError(err: unknown) {
    if (isUnauthorized(err)) onLoggedOut()
    else setError(getErrorMessage(err))
  }

  async function loadWeapons() {
    try {
      setWeapons(await fetchWeapons())
    } catch (err) {
      handleError(err)
    }
  }

  useEffect(() => {
    loadWeapons()
    fetchWeaponTypes().then(setTypes).catch(handleError)
    fetchSides().then(setSides).catch(handleError)
  }, [])

  const countrySides = sides.filter((s) => s.country_code === country)

  function changeCountry(code: string) {
    setCountry(code)
    setSideId('') // the old side belongs to another country
  }

  // Empty the form, but keep the type and country: the admin often adds several weapons of the same country in a row
  function resetForm() {
    setEditingId(null)
    setName('')
    setSideId('')
    setRange('')
    setSource('')
    setDescription('')
  }

  function startEdit(w: Weapon) {
    setEditingId(w.id)
    setName(w.name)
    setTypeId(String(w.weapon_type_id))
    setCountry(w.country_code)
    setSideId(w.side_id ? String(w.side_id) : '')
    setRange(String(w.range_km))
    setSource(w.source ?? '')
    setDescription(w.description ?? '')
    setMessage('')
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setBusy(true)
    const input = {
      name: name.trim(),
      weapon_type_id: Number(typeId),
      country,
      side_id: sideId ? Number(sideId) : null,
      range_km: Number(range),
      source,
      description,
    }
    try {
      const saved = editingId === null ? await createWeapon(input) : await updateWeapon(editingId, input)
      setMessage(`${editingId === null ? 'Added' : 'Saved'} "${saved.name}" (${saved.range_km} km)`)
      resetForm()
      await loadWeapons()
    } catch (err) {
      handleError(err)
    } finally {
      setBusy(false)
    }
  }

  async function remove(w: Weapon) {
    if (!window.confirm(`Delete "${w.name}"?`)) return
    try {
      await deleteWeapon(w.id)
      if (editingId === w.id) resetForm()
      await loadWeapons()
    } catch (err) {
      handleError(err)
    }
  }

  return (
    <div className="stack">
      <form className="card" onSubmit={handleSubmit}>
        <h2>{editingId === null ? 'Add a weapon' : 'Edit weapon'}</h2>
        <p className="muted">Visitors can place these on the map to see how far they reach.</p>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Burkan-2H" required />
        </label>

        <div className="row">
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
          <label>
            Range (km)
            <input type="number" min={1} max={20000} step={1} value={range} onChange={(e) => setRange(e.target.value)} required />
          </label>
        </div>
        <p className="hint">For fighter jets and drones that fly back: use the combat radius (about half of the full range).</p>

        <div className="row">
          <label>
            Country
            <CountrySelect value={country} onChange={changeCountry} required />
          </label>
          {/* Only countries with sides need a side */}
          {countrySides.length > 0 && (
            <label>
              Side
              <select value={sideId} onChange={(e) => setSideId(e.target.value)} required>
                <option value="">Choose a side…</option>
                {countrySides.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <label>
          Source of the range (optional)
          <input value={source} onChange={(e) => setSource(e.target.value)} maxLength={255} placeholder="e.g. CSIS Missile Threat" />
        </label>

        <label>
          Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
        </label>

        {message && <p className="success">{message}</p>}
        {error && <p className="error">{error}</p>}

        <div className="row">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Saving…' : editingId === null ? 'Add weapon' : 'Save changes'}
          </button>
          {editingId !== null && (
            <button className="btn btn-ghost" type="button" onClick={resetForm}>
              Cancel editing
            </button>
          )}
        </div>
      </form>

      <div className="card wide">
        <h2>Weapons ({weapons.length})</h2>
        {weapons.length === 0 && <p className="muted">No weapons yet.</p>}

        <ul className="event-list">
          {weapons.map((w) => (
            <li key={w.id} className="event-item">
              <div className="event-info">
                <div className="event-title">
                  {w.name} · {w.range_km.toLocaleString()} km
                </div>
                <div className="event-meta">
                  {w.type_name} · {w.country_name}
                  {w.side_name && (
                    <>
                      {' · '}
                      <span className="side-dot" style={{ background: w.side_color ?? undefined }} /> {w.side_name}
                    </>
                  )}
                  {w.source && <> · source: {w.source}</>}
                </div>
              </div>
              <div className="event-actions">
                <button className="btn btn-small btn-ghost" onClick={() => startEdit(w)}>
                  Edit
                </button>
                <button className="btn btn-small btn-danger" onClick={() => remove(w)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}