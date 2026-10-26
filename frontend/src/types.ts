// Same shape as GET /api/events returns.
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