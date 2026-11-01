import type { Feature, FeatureCollection } from 'geojson'

export interface MapEvent {
  id: number
  title: string
  description: string | null
  occurred_at: string // JSON turns dates into ISO strings
  created_at: string
  lng: number
  lat: number
  type_name: string
  icon: string
  color: string | null
  location_name: string | null
  country_code: string | null
}

// Same shape as GET /api/locations returns.
export interface MapLocation {
  id: number
  name: string
  country_code: string
  description: string | null
  lng: number
  lat: number
  type_code: string // 'military_base' | 'airport' | 'naval_base'
  type_name: string
  icon: string
}

// Event types for the admin form's dropdown (GET /api/events/types).
export interface EventType {
  id: number
  name: string
}

export type EventStatus = 'unverified' | 'confirmed' | 'false'

export interface NewEvent {
  title: string
  description: string
  event_type_id: number
  lat: number
  lng: number
  country_code: string
  occurred_at: string // ISO date in UTC
  status: EventStatus
}

// One event in the admin list (GET /api/events/admin) — includes unverified and false ones.
export interface AdminEvent {
  id: number
  title: string
  occurred_at: string
  status: EventStatus
  type_name: string
  created_by_username: string
}

export interface LocationType {
  id: number
  code: string // 'military_base' | 'airport' | 'naval_base'
  name: string
}

// What a KML import did, or would do in a preview (POST /api/locations/import).
export interface ImportSummary {
  dryRun: boolean
  found: number
  saved: number
  duplicates: number
  notPoints: number
  invalid: number
  autoNamed: number
}

export interface KmlImportInput {
  file: File
  type: string // location type code, e.g. 'military_base'
  country: string // 2-letter code, e.g. 'IR'
  dryRun: boolean // true = preview only, nothing is saved
}

// ---------- Sides ----------

// One side of a conflict in a country, e.g. Yemen → Houthis (GET /api/sides).
export interface Side {
  id: number
  country_code: string // "YE"
  name: string // "Houthis"
  color: string // "#A52714" — legend dot + the editor's default color
}

// What the admin sends to create a side (POST /api/sides).
export interface NewSide {
  country: string // 2 letters
  name: string
  color: string // "#RRGGBB"
}

// ---------- Frontline / area layers ----------

// The newest version of one layer (GET /api/layers).
export interface MapLayer {
  id: number
  name: string // e.g. "Taiz front"
  side_id: number
  side_name: string // "Houthis"
  side_color: string // "#A52714"
  country_code: string // "YE" — comes from the side
  snapshot_date: string // "2026-10-24"
  geojson: FeatureCollection
}

// One saved version, for the admin list (GET /api/layers/versions).
export interface LayerVersion {
  id: number
  name: string
  side_id: number
  side_name: string
  side_color: string
  country_code: string
  snapshot_date: string
  shape_count: number
  created_by_username: string
}

// What the admin sends to upload a layer.
export interface LayerImportInput {
  file: File
  name: string
  sideId: number
  date: string // "YYYY-MM-DD"
}

// What the map editor sends (POST /api/layers).
export interface SaveLayerInput {
  name: string
  side_id: number
  date: string // "YYYY-MM-DD"
  features: Feature[]
}

// What a save or upload did (POST /api/layers and /api/layers/import).
export interface SaveLayerResult {
  id: number
  replaced: boolean // same name + date existed → it was overwritten
  areas: number
  lines: number
  icons: number // icons + text labels
}

// ---------- Siren alerts ----------

export type AlertType = 'rockets' | 'drone' | 'other'

export interface MapAlert {
  id: number
  type: AlertType
  type_name: string
  started_at: string
  area_ids: number[]
}

export interface MapAlertArea {
  id: number
  name_he: string
  name_en: string | null
  name_ar: string | null
  lat: number
  lng: number
  polygon: number[][] | null // [[lng, lat], ...]
}

// GET /api/alerts: the alerts + the places they covered (each place once)
export interface AlertsResponse {
  alerts: MapAlert[]
  areas: MapAlertArea[]
}