
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