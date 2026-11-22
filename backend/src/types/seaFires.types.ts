// seaFires: TypeScript types.

// One hot spot from a FIRMS CSV line, already cleaned
export interface Hotspot {
  lat: number;
  lng: number;
  detectedAt: Date; // when the satellite saw it
  satellite: string; // the FIRMS source, e.g. VIIRS_NOAA20_NRT
  frp: number | null; // fire power in megawatts
  confidence: string; // 'n' nominal or 'h' high
}