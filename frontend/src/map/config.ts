// Map settings shared by every map in the app.
// The key lives in frontend/.env.local (VITE_MAPTILER_KEY).
// Other styles: 'streets-v2' (normal map), 'satellite' (imagery without labels).
export const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined
export const MAP_STYLE = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`
export const START_CENTER: [number, number] = [53, 30] // [lng, lat] — Iran / Gulf
export const START_ZOOM = 4