// Icons that came inside KMZ files (a tank, a flag…). They are saved on the server: /api/icons/12.
// The map only loads one when a pin needs it: MapLibre asks for the missing picture, and we fetch it then.
import type * as maplibregl from 'maplibre-gl'
import { drawFireDot, drawPin } from './Eventslayer'

const API = `${import.meta.env.VITE_API_URL ?? ''}/api`

// The address of an icon's picture, for <img src> (the icon picker)
export function iconUrl(iconId: number) {
  return `${API}/icons/${iconId}`
}

// Image names: "file-icon-128-12" (bases: drawn like our 128 px icons) or "file-icon-64-12" (frontline pins: like our 64 px icons).
// The layers build these names themselves (locationsLayer.ts, shapesLayer.ts).

// MapLibre asks this resolver for any picture it doesn't have, and waits for it before drawing the pin.
// It is the ONLY place that answers: once a resolver is set, MapLibre no longer sends 'styleimagemissing',
// so the event pins are drawn here too.
export function enableFileIcons(map: maplibregl.Map) {
  map.setMissingStyleImageResolver(async (id) => {
    // Event pins, one per event type color: "pin-#E53935" → a red pin
    if (id.startsWith('pin-')) {
      if (!map.hasImage(id)) map.addImage(id, drawPin(id.slice(4)), { pixelRatio: 2 })
      return
    }
    // Fires at sea: one red dot for all of them
    if (id === 'fire-dot') {
      if (!map.hasImage(id)) map.addImage(id, drawFireDot(), { pixelRatio: 2 })
      return
    }

    const match = /^file-icon-(\d+)-(\d+)$/.exec(id)
    if (!match) return // not ours: MapLibre reports it as missing, like before
    const [, size, iconId] = match
    try {
      const { data } = await map.loadImage(iconUrl(Number(iconId)))
      // pixelRatio: a 64 px picture in a "128" layer is drawn like our 128 px icons (same size on the map)
      const pixelRatio = Math.max(data.width, data.height) / Number(size)
      if (!map.hasImage(id)) map.addImage(id, data, { pixelRatio })
    } catch {
      // a picture that can't load: the pin has no icon, its name still shows
    }
  })
}