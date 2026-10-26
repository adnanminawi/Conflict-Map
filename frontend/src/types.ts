
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
export interface EventType {
  id: number
  name: string
}

export interface NewEvent {
  title: string
  description: string
  event_type_id: number
  lat: number
  lng: number
  occurred_at: string // ISO date in UTC
  status: 'unverified' | 'confirmed' | 'false'
}
export interface EventType {
  id: number
  name: string
}

export interface NewEvent {
  title: string
  description: string
  event_type_id: number
  lat: number
  lng: number
  occurred_at: string // ISO date in UTC
  status: 'unverified' | 'confirmed' | 'false'
}