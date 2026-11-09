// One event as returned to the public map.
export interface PublicEvent {
  id: number;
  event_type_id: number; // the map editor needs it to show the right type
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
  country_code: string | null; // "IR", "IL"… null = not set (old events)
}

export type EventStatus = 'unverified' | 'confirmed' | 'false';

// Data the admin sends to create an event.
export interface CreateEventInput {
  event_type_id: number;
  title: string;
  description: string | null;
  occurred_at: Date;
  lat: number;
  lng: number;
  location_id: number | null;
  country_code: string; // 2 letters, e.g. "IR"
  status: EventStatus;
}

// One event as shown in the admin list (all statuses).
export interface AdminEvent {
  id: number;
  title: string;
  occurred_at: Date;
  status: EventStatus;
  type_name: string;
  created_by_username: string;
}