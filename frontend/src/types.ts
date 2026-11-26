import type { Feature, FeatureCollection } from 'geojson'

// Same shape as GET /api/events returns.
export interface MapEvent {
  id: number
  event_type_id: number
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
  country_code: string | null // "IR", "IL"… null = not set (old events)
}

// Same shape as GET /api/locations returns.
export interface MapLocation {
  id: number
  name: string
  country_code: string
  description: string | null
  lng: number
  lat: number
  type_code: string // 'military_base' | 'airport' | 'naval_base' | 'air_defence' | 'radar' | 'missile_base'
  type_name: string
  icon: string
  weapon_id: number | null // air defence / radar sites: the system there (null = none)
  icon_id: number | null // its icon from a KMZ file (null = the icon of its type)
}

// Event types for the admin form's dropdown (GET /api/events/types).
export interface EventType {
  id: number
  name: string
  color: string | null // the pin color on the map
}

export type EventStatus = 'unverified' | 'confirmed' | 'false'

export interface NewEvent {
  title: string
  description: string
  event_type_id: number
  lat: number
  lng: number
  country_code: string // 2 letters, e.g. "IR"
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
  type_color: string | null
  country_code: string | null // null = old events with no country
  lng: number
  lat: number
  created_by_username: string
}

// Location types for the KML import dropdown (GET /api/locations/types).
export interface LocationType {
  id: number
  code: string // 'military_base' | 'airport' | 'naval_base'
  name: string
}

// What the admin sends to import a KML/KMZ file of bases / airports.
export interface KmlImportInput {
  file: File
  type: string // location type code, e.g. 'military_base'
  country: string // 2-letter code, e.g. 'IR'
  dryRun: boolean // true = preview only, nothing is saved
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
  byType: Record<string, number> // saved per type name, e.g. { "Air defence": 105, "Radar": 19 }
  guessed: number // got their type from their name / folder; the rest got the chosen type
  linked: number // air defence / radar sites linked to their system by name (e.g. "ID" → Iron Dome)
  noSystem: number // air defence / radar sites with no system (no name matched)
  fileIcons: number // sites that keep the icon from their KMZ file
}

// ---------- Countries ----------

// One country (GET /api/countries)
export interface Country {
  code: string // 'YE'
  name_en: string // 'Yemen'
  name_ar: string // 'اليمن'
}

// ---------- Frontline / area layers ----------

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

// The newest version of one layer (GET /api/layers).
export interface MapLayer {
  id: number
  name: string // e.g. "Taiz front"
  side_id: number
  side_name: string // "Houthis"
  side_color: string // "#A52714"
  country_code: string // "YE" — comes from the side
  snapshot_date: string // "2026-10-24"
  hidden?: boolean // the admin hid it from the public map (only in the admin's list)
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
  hidden: boolean // the admin hid this layer from the public map
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

// ---------- Weapons ----------

// launcher, drone, fighter… (GET /api/weapons/types)
export interface WeaponType {
  id: number
  code: string // 'launcher'
  name: string // 'Missile launcher'
}

// One weapon (GET /api/weapons)
export interface Weapon {
  id: number
  name: string // 'Burkan-2H'
  range_km: number // the radius drawn on the map
  source: string | null
  description: string | null
  weapon_type_id: number
  type_code: string
  type_name: string
  country_code: string // 'YE'
  country_name: string // 'Yemen'
  side_id: number | null // null = the country has no sides
  side_name: string | null
  side_color: string | null
  linked_sites?: number // only right after adding / saving: sites on the map that got linked to it
}

// What the admin form sends (POST /api/weapons and PUT /api/weapons/:id)
export interface WeaponInput {
  name: string
  weapon_type_id: number
  country: string
  side_id: number | null
  range_km: number
  source: string
  description: string
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

// News from the RSS feeds (GET /api/news)
export interface NewsItem {
  id: number
  title: string
  summary: string
  url: string | null
  source_name: string
  lang: 'en' | 'ar'
  published_at: string
}

// 'published' = on the site, 'draft' = hidden by the admin
export type NewsStatus = 'draft' | 'published'

// What the admin sees (GET /api/news/admin)
export interface AdminNewsItem extends NewsItem {
  status: NewsStatus
  country_codes: string[] // the countries the item is about, e.g. ['YE', 'SA'] ([] = none found)
}

// What the admin sends to add or change one base on the map (POST / PUT /api/locations)
export interface LocationInput {
  type: string // a location type code, e.g. 'air_defence'
  name: string
  country_code: string
  description: string | null
  lat: number
  lng: number
  weapon_id: number | null // the system at this site (air defence / radar only)
  icon_id: number | null // its own icon (a saved picture), null = the icon of its type
}

// ---------- Import map (one KML with bases, frontlines and strikes) ----------

// Where a folder's items go
export type FolderAction = 'bases' | 'layer' | 'events' | 'skip'

// One folder of the file, with the backend's guesses (POST /api/map-import/preview)
export interface PreviewFolder {
  index: number
  name: string
  points: number
  areas: number
  lines: number
  action: FolderAction
  baseTypes: Record<string, number> // pins per base type, e.g. { airport: 6 }
  unclear: number // pins with no type: they get typeCode
  fileIcons: number // pins whose icon is a picture inside the KMZ
  typeCode: string
  // Air defence / radar pins: found in Weapons (their range shows), and the systems missing from it, e.g. { 'SA-2': 28 }
  systems: { linked: number; missing: Record<string, number> }
  countries: Record<string, number> // pins per country, e.g. { YE: 40, SA: 1 }
  sideId: number | null
  layerName: string
}

export interface MapImportPreview {
  found: number
  folders: PreviewFolder[]
}

// What the admin chose for one folder
export interface FolderChoice {
  index: number
  action: FolderAction
  typeCode?: string
  fileCountry?: boolean
  sideId?: number | null
  layerName?: string
  eventTypeId?: number | null
}

export interface MapImportResult {
  bases: { saved: number; duplicates: number; linked: number; missing: Record<string, number>; byType: Record<string, number> }
  layers: { name: string; replaced: boolean; areas: number; lines: number; icons: number }[]
  events: { saved: number; duplicates: number }
  skipped: number
  invalid: number
  fileIcons: number // bases and frontline pins that got their icon from the KMZ
}