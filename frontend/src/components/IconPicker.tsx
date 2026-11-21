import { useEffect, useRef, useState } from 'react'
import { fetchIcons, uploadIcon } from '../api/admin'
import { getErrorMessage } from '../api/client'
import { iconUrl } from '../map/fileIcons'

interface Props {
  value: number | null // the chosen icon's id (null = none chosen)
  onChange: (iconId: number | null) => void
  noneLabel?: string // e.g. "Type icon": a button to go back to no picture. Leave it out to hide that button.
}

// Pick a picture for a base or a frontline pin: one of the saved icons (from KMZ files or uploads),
// or upload a new one. The list is shared: an icon uploaded once can be used everywhere.
export default function IconPicker({ value, onChange, noneLabel }: Props) {
  const [icons, setIcons] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchIcons()
      .then(setIcons)
      .catch((err) => setError(getErrorMessage(err)))
  }, [])

  // Upload → the new icon goes first in the list and is chosen right away
  async function upload(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy(true)
    try {
      const id = await uploadIcon(file)
      setIcons((list) => [id, ...list.filter((i) => i !== id)]) // the same picture again = the same id
      onChange(id)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
      if (fileInput.current) fileInput.current.value = '' // so the same file can be chosen again
    }
  }

  return (
    <div className="icon-picker">
      <div className="icon-grid" role="listbox" aria-label="Icons">
        {noneLabel && (
          <button
            type="button"
            className={value === null ? 'icon-choice none active' : 'icon-choice none'}
            aria-selected={value === null}
            onClick={() => onChange(null)}
          >
            {noneLabel}
          </button>
        )}
        {icons.map((id) => (
          <button
            key={id}
            type="button"
            className={value === id ? 'icon-choice active' : 'icon-choice'}
            aria-selected={value === id}
            title={`Icon ${id}`}
            onClick={() => onChange(id)}
          >
            <img src={iconUrl(id)} alt={`Icon ${id}`} />
          </button>
        ))}
      </div>

      <button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={() => fileInput.current?.click()}>
        {busy ? 'Uploading…' : 'Upload a picture'}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <span className="editor-note">PNG, JPEG, GIF or WEBP, up to 256 KB. A small square picture works best.</span>
      {error && <p className="error">{error}</p>}
    </div>
  )
}