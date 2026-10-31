
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
  country_code: string | null;
}
export type EventStatus = 'unverified' | 'confirmed' | 'false';

export interface CreateEventInput {
  event_type_id: number;
  title: string;
  description: string | null;
  occurred_at: Date;
  lat: number;
  lng: number;
  location_id: number | null;
  status: EventStatus;
  country_code: string;
}

export interface AdminEvent {
  id: number;
  title: string;
  occurred_at: Date;
  status: EventStatus;
  type_name: string;
  created_by_username: string;
}