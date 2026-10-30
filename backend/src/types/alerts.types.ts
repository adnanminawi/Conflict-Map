import type { AlertType } from '../utils/alertParser';

// One alert for the map (GET /api/alerts)
export interface MapAlert {
  id: number;
  type: AlertType;
  type_name: string;
  started_at: Date;
  area_ids: number[];
}

// One place that has (had) an alert, with its outline
export interface MapAlertArea {
  id: number;
  name_he: string;
  name_en: string | null;
  name_ar: string | null;
  lat: number;
  lng: number;
  polygon: number[][] | null; // [[lng, lat], ...]
}

// GET /api/alerts returns alerts + their areas. Each area is sent once, even if it had several alerts.
export interface AlertsResponse {
  alerts: MapAlert[];
  areas: MapAlertArea[];
}

// What the service saves for one time block of a message
export interface NewAlert {
  externalId: string;
  type: AlertType;
  startedAt: Date;
  rawText: string;
  areaIds: number[];
}
export interface AlertAreaName {
  id: number;
  name_ru: string | null;
  name_he: string;
}