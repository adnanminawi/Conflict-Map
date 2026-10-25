import type { MapEvent } from '../types'

export async function fetchEvents(): Promise<MapEvent[]> {
  const res = await fetch('/api/events')
  if (!res.ok) throw new Error(`Failed to load events (${res.status})`)
  return res.json()
}