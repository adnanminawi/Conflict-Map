import { api } from './client'
import type { MapEvent } from '../types'

export async function fetchEvents(): Promise<MapEvent[]> {
  const { data } = await api.get<MapEvent[]>('/events')
  return data;
}