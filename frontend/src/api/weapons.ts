import { api } from './client'
import type { Weapon } from '../types'

// Every weapon, for the map's weapons panel (public)
export async function fetchWeapons(): Promise<Weapon[]> {
  const { data } = await api.get<Weapon[]>('/weapons')
  return data
}