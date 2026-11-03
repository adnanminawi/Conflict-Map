import { useEffect, useState } from 'react'
import { fetchCountries } from '../api/countries'
import type { Country } from '../types'

interface Props {
  value: string // 'YE', or '' = none chosen
  onChange: (code: string) => void
  required?: boolean
}

// A dropdown of every country ("Yemen (YE)"), so nobody has to type a code.
// Tip for the admin: click it and type the first letters of the name to jump there.
export default function CountrySelect({ value, onChange, required }: Props) {
  const [countries, setCountries] = useState<Country[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    fetchCountries()
      .then(setCountries)
      .catch(() => setError(true))
  }, [])

  
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{error ? 'Could not load countries' : 'Choose a country…'}</option>
      {countries.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name_en} ({c.code})
        </option>
      ))}
    </select>
  )
}