
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