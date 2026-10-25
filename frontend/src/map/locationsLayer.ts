import * as maplibregl from 'maplibre-gl'
import type { MapLocation } from '../types'
import { buildPopup } from './popup'
import airportIcon from '../assets/icons/airport.png'
import militaryBaseIcon from '../assets/icons/military_base.png'
import navalBaseIcon from '../assets/icons/naval_base.png'

// Which picture to use for each location type
const ICONS: Record<string, string> = {
  airport: airportIcon,
  military_base: militaryBaseIcon,
  naval_base: navalBaseIcon,
}

// Puts one icon on the map for each base / airport
export function addLocationMarkers(map: maplibregl.Map, locations: MapLocation[]) {
  for (const location of locations) {
    // 1. The icon
    const img = document.createElement('img')
    img.src = ICONS[location.type_code] ?? militaryBaseIcon
    img.width = 28
    img.height = 28
    img.style.cursor = 'pointer'

    // 2. The popup that opens on click
    const popup = new maplibregl.Popup({ offset: 14 }).setDOMContent(
      buildPopup(location.name, location.type_name, [location.country_code, location.description]),
    )

    // 3. Put it on the map
    new maplibregl.Marker({ element: img })
      .setLngLat([location.lng, location.lat])
      .setPopup(popup)
      .addTo(map)
  }
}