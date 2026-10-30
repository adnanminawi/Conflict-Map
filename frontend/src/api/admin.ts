// Calls used by the admin page.
import { api } from './client'
import type { AdminEvent, EventStatus, EventType, ImportSummary,KmlImportInput, LocationType, NewEvent,LayerVersion,SaveLayerInput,SaveLayerResult,LayerImportInput} from '../types'

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
export async function fetchLocationTypes(): Promise<LocationType[]> {
  const { data } = await api.get<LocationType[]>('/locations/types')
  return data
}

// Uploads a KML/KMZ file. dryRun = true → preview only, nothing is saved.
export async function importKml(input: KmlImportInput): Promise<ImportSummary> {
  // Files can't go in JSON, so we send a form (multipart/form-data)
  const form = new FormData()
  form.append('file', input.file)
  form.append('type', input.type)
  form.append('country', input.country)
  form.append('dryRun', String(input.dryRun))

  const { data } = await api.post<ImportSummary>('/locations/import', form)
  return data
}

export async function fetchLayerVersions(): Promise<LayerVersion[]> {
  const { data } = await api.get<LayerVersion[]>('/layers/versions')
  return data
}

// Uploads a KML/KMZ file of areas and lines as one version of a layer.
export async function importLayer(input: LayerImportInput): Promise<SaveLayerResult> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('name', input.name)
  form.append('date', input.date)

  const { data } = await api.post<SaveLayerResult>('/layers/import', form)
  return data
}

export async function deleteLayerVersion(id: number): Promise<void> {
  await api.delete(`/layers/${id}`)
}

export async function saveLayer(input: SaveLayerInput): Promise<SaveLayerResult> {
  const { data } = await api.post<SaveLayerResult>('/layers', input)
  return data
}