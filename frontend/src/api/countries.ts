import { api } from './client'
import type { Country } from '../types'

// The list never changes while the page is open, so it is loaded once and shared
// (several forms can ask for it at the same time; they all get the same request).
let loading: Promise<Country[]> | null = null

export function fetchCountries(): Promise<Country[]> {
  if (!loading) {
    loading = api.get<Country[]>('/countries').then((res) => res.data)
    loading.catch(() => (loading = null)) // failed → try again next time
  }
  return loading
}