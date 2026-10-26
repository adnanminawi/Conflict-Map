// Calls used by the admin page.
import { api } from './client'
import type { AdminEvent, EventStatus, EventType, NewEvent } from '../types'

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
export async function fetchAdminEvents(status?: EventStatus): Promise<AdminEvent[]> {
  const { data } = await api.get<AdminEvent[]>('/events/admin', { params: { status } })
  return data
}

export async function updateEventStatus(id: number, status: EventStatus): Promise<void> {
  await api.patch(`/events/${id}/status`, { status })
}

export async function deleteEvent(id: number): Promise<void> {
  await api.delete(`/events/${id}`)
}