import { api } from './client'
import type { MapLayer } from '../types'

// Frontlines and areas for the public map (newest version of each layer)
export async function fetchLayers(): Promise<MapLayer[]> {
  const { data } = await api.get<MapLayer[]>('/layers')
  return data
}