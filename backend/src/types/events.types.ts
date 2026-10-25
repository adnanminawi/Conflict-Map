
// One event as returned to the public map.
export interface PublicEvent {
  id: number;
  title: string;
  description: string | null;
  occurred_at: Date;
  created_at: Date;
  lng: number;
  lat: number;
  type_name: string;
  icon: string;
  color: string | null;
  location_name: string | null;
}