// Calls used by the admin page.
import { api } from './client'
import type {
  LocationInput,
  AdminNewsItem,
  NewsStatus,
  AdminEvent,
  EventStatus,
  EventType,
  ImportSummary,
  KmlImportInput,
  LayerImportInput,
  SaveLayerInput,
  SaveLayerResult,
  LayerVersion,
  MapLayer,
  LocationType,
  FolderChoice,
  MapImportPreview,
  MapImportResult,
  NewEvent,
  NewSide,
  Side,
  Weapon,
  WeaponInput,
  WeaponType,
} from '../types'

export async function login(username: string, password: string): Promise<string> {
  const { data } = await api.post<{ token: string }>('/auth/login', { username, password })
  return data.token
}

export async function fetchEventTypes(): Promise<EventType[]> {
  const { data } = await api.get<EventType[]>('/events/types')
  return data
}

// Returns the new event's id. The token is added automatically by client.ts.
export async function createEvent(event: NewEvent): Promise<number> {
  const { data } = await api.post<{ id: number }>('/events', event)
  return data.id
}

// Recent events for the admin list. No status = all statuses.
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

// Uploads a KML/KMZ file of bases / airports. dryRun = true → preview only, nothing is saved.
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

// ---------- Frontline / area layers ----------

export async function fetchLayerVersions(): Promise<LayerVersion[]> {
  const { data } = await api.get<LayerVersion[]>('/layers/versions')
  return data
}

// Uploads a KML/KMZ file of areas and lines as one version of a layer.
export async function importLayer(input: LayerImportInput): Promise<SaveLayerResult> {
  const form = new FormData()
  form.append('file', input.file)
  form.append('name', input.name)
  form.append('side_id', String(input.sideId))
  form.append('date', input.date)

  const { data } = await api.post<SaveLayerResult>('/layers/import', form)
  return data
}

// Saves shapes drawn in the map editor as one version of a layer.
export async function saveLayer(input: SaveLayerInput): Promise<SaveLayerResult> {
  const { data } = await api.post<SaveLayerResult>('/layers', input)
  return data
}

export async function deleteLayerVersion(id: number): Promise<void> {
  await api.delete(`/layers/${id}`)
}

// The newest version of every layer, hidden ones too (for the map editor)
export async function fetchAllLayers(): Promise<MapLayer[]> {
  const { data } = await api.get<MapLayer[]>('/layers/admin')
  return data
}

// Hides a layer (all its versions) from the public map, or shows it again
export async function setLayerHidden(name: string, hidden: boolean): Promise<void> {
  await api.patch('/layers/visibility', { name, hidden })
}

// ---------- Sides ----------

export async function createSide(side: NewSide): Promise<Side> {
  const { data } = await api.post<Side>('/sides', side)
  return data
}

// ---------- Weapons ----------

export async function fetchWeaponTypes(): Promise<WeaponType[]> {
  const { data } = await api.get<WeaponType[]>('/weapons/types')
  return data
}

export async function createWeapon(weapon: WeaponInput): Promise<Weapon> {
  const { data } = await api.post<Weapon>('/weapons', weapon)
  return data
}

export async function updateWeapon(id: number, weapon: WeaponInput): Promise<Weapon> {
  const { data } = await api.put<Weapon>(`/weapons/${id}`, weapon)
  return data
}

export async function deleteWeapon(id: number): Promise<void> {
  await api.delete(`/weapons/${id}`)
}

export async function deleteLocation(id: number): Promise<void> {
  await api.delete(`/locations/${id}`)
}

// Many at once (the "Delete selected" button). Returns how many were deleted.
export async function deleteLocations(ids: number[]): Promise<number> {
  const { data } = await api.post<{ deleted: number }>('/locations/delete-many', { ids })
  return data.deleted
}

// News: the admin list (published + hidden), hide / show, delete
export async function fetchAdminNews(): Promise<AdminNewsItem[]> {
  const { data } = await api.get<AdminNewsItem[]>('/news/admin')
  return data
}

export async function updateNewsStatus(id: number, status: NewsStatus): Promise<void> {
  await api.patch(`/news/${id}/status`, { status })
}

export async function deleteNews(id: number): Promise<void> {
  await api.delete(`/news/${id}`)
}

// The map editor: add / change one base
export async function createLocation(input: LocationInput): Promise<number> {
  const { data } = await api.post<{ id: number }>('/locations', input)
  return data.id
}

export async function updateLocation(id: number, input: LocationInput): Promise<void> {
  await api.put(`/locations/${id}`, input)
}

// The map editor: change one event (same fields as creating one; its status stays as it is)
export async function updateEvent(id: number, event: NewEvent): Promise<void> {
  await api.put(`/events/${id}`, event)
}

// ---------- Import map (one KML with bases, frontlines and strikes) ----------

// Step 1: reads the file and guesses what each folder is. Nothing is saved.
export async function previewMapImport(file: File, country: string): Promise<MapImportPreview> {
  const form = new FormData()
  form.append('file', file)
  form.append('country', country)
  const { data } = await api.post<MapImportPreview>('/map-import/preview', form)
  return data
}

// Step 2: saves every folder the way the admin chose (all or nothing). The file is sent again.
export async function importMap(file: File, country: string, date: string, choices: FolderChoice[]): Promise<MapImportResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('country', country)
  form.append('date', date)
  form.append('choices', JSON.stringify(choices)) // a form only sends text, so the list goes as JSON
  const { data } = await api.post<MapImportResult>('/map-import', form)
  return data
}

// ---------- Icons (pictures for bases and frontline pins) ----------

// The ids of all saved icons, newest first (the pictures themselves: iconUrl(id))
export async function fetchIcons(): Promise<number[]> {
  const { data } = await api.get<number[]>('/icons')
  return data
}

// Uploads a picture as a new icon (PNG, JPEG, GIF or WEBP, max 256 KB) and returns its id
export async function uploadIcon(file: File): Promise<number> {
  const form = new FormData()
  form.append('file', file)
  const { data } = await api.post<{ id: number }>('/icons', form)
  return data.id
}