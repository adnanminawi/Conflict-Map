import { api } from './client'
import type { MapLocation } from '../types'

export async function fetchLocations(): Promise<MapLocation[]> {
  const { data } = await api.get<MapLocation[]>('/locations')
  return data
}