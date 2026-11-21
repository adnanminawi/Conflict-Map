// One base / airport as returned to the map.
export interface MapLocation {
  id: number;
  name: string;
  country_code: string;
  description: string | null;
  lng: number;
  lat: number;
  type_code: string;
  type_name: string;
  icon: string;
  weapon_id: number | null; // the defence system at this site (null = none)
  icon_id: number | null; // the icon from its KMZ file (null = the icon of its type)
}

// What a KML import did (or would do, in a dry run).
export interface ImportSummary {
  dryRun: boolean;
  found: number; // placemarks in the file
  saved: number; // saved (or would be saved, in a dry run)
  duplicates: number; // already in the database (within 50 m)
  notPoints: number; // lines / polygons, skipped
  invalid: number; // bad coordinates, skipped
  autoNamed: number; // had no real name, got one like "Military base EG-001"
  byType: Record<string, number>; // saved per type name, e.g. { "Air defence": 94, "Radar": 18 }
  guessed: number; // how many got their type from their name / folder (the rest: the chosen type)
  linked: number; // air defence / radar sites linked to their system by name (e.g. "ID" → Iron Dome)
  noSystem: number; // air defence / radar sites saved with no system (no name matched)
  fileIcons: number; // sites that got the icon from their KMZ file
}

// What the admin sends to add or change one location on the map
export interface SaveLocationInput {
  typeCode: string; // e.g. "air_defence"
  name: string;
  countryCode: string; // 2 letters, e.g. "IL"
  description: string | null;
  lat: number;
  lng: number;
  weaponId: number | null;
  iconId?: number | null; // a saved icon; null = the icon of its type; undefined = keep the one it has
}

// One location as the repository saves it (the type code already turned into its id)
export interface LocationRow {
  typeId: number;
  name: string;
  countryCode: string;
  lng: number;
  lat: number;
  description: string | null;
  weaponId: number | null;
  iconId?: number | null; // its own icon (from a KMZ, or chosen by the admin); undefined = keep the one it has
}