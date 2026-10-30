import { api } from './client'
import type { AlertsResponse } from '../types'

// Siren alerts of the last `minutes` (saved by the backend from the Telegram channel)
export async function fetchAlerts(minutes = 60): Promise<AlertsResponse> {
  const { data } = await api.get<AlertsResponse>('/alerts', { params: { minutes } })
  return data
}