import type { MapLocation } from '../types'

export async function fetchLocations(): Promise<MapLocation[]> {
  const res = await fetch('/api/locations')
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`)
  return res.json()
}
  