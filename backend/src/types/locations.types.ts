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
}