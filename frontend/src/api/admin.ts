// Calls used by the admin page.
import { api } from './client'
import type { EventType, NewEvent } from '../types'

export async function login(username: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/auth/login', { username, password })
  return data.token;
}

export async function fetchEventTypes(): Promise<EventType[]> {
  const { data } = await api.get<EventType[]>('/events/types')
  return data;
}

// Returns the new event's id. The token is added automatically by client.ts.
export async function createEvent(event: NewEvent): Promise<number> {
  const { data } = await api.post<{ id: number }>('/events', event)
  return data.id;
}