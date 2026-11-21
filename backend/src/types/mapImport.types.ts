// The "Import map" tab: one KML with bases, frontlines and strikes, sorted folder by folder.

// Where a folder's items go
export type FolderAction = 'bases' | 'layer' | 'events' | 'skip';
export const FOLDER_ACTIONS: FolderAction[] = ['bases', 'layer', 'events', 'skip'];

// Step 1 (preview): one folder of the file, with our guesses. Nothing is saved.
export interface PreviewFolder {
  index: number; // the folder's position in the file (the import refers to folders by it)
  name: string; // "القواعد العسكرية", or "(no folder)"
  points: number; // pins
  areas: number;
  lines: number;
  action: FolderAction; // our guess
  baseTypes: Record<string, number>; // pins per base type read from their name / icon, e.g. { airport: 6 }
  unclear: number; // pins with no type found: they get the folder's type (typeCode)
  fileIcons: number;
  typeCode: string; // the type for unclear pins (guessed from the folder's name, else military_base)
  countries: Record<string, number>; // pins per country found from the borders, e.g. { YE: 36, SA: 2 }
  sideId: number | null; // frontlines: the guessed side (null = the admin must choose)
  layerName: string; // frontlines: the layer name (the folder's name)
}

export interface MapImportPreview {
  found: number; // all placemarks in the file
  folders: PreviewFolder[];
}

// Step 2 (import): what the admin chose for one folder
export interface FolderChoice {
  index: number;
  action: FolderAction;
  typeCode?: string; // bases: the type for unclear pins
  fileCountry?: boolean; // bases / events: true = every pin gets the file's country (not the one found from the borders)
  sideId?: number; // layer
  layerName?: string; // layer
  eventTypeId?: number; // events
}

// What the import did
export interface MapImportResult {
  bases: { saved: number; duplicates: number; linked: number; byType: Record<string, number> };
  layers: { name: string; replaced: boolean; areas: number; lines: number; icons: number }[];
  events: { saved: number; duplicates: number };
  skipped: number; // placemarks in "skip" folders, plus lines / areas in bases or strikes folders
  invalid: number; // pins with bad coordinates (or at 0,0)
  fileIcons: number; // bases and frontline pins that got their icon from the KMZ
}