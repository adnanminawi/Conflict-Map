import { api } from './client'
import type { Side } from '../types'

// Every side of every country (public)
export async function fetchSides(): Promise<Side[]> {
  const { data } = await api.get<Side[]>('/sides')
  return data
}