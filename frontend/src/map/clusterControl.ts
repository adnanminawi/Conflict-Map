// Group button: under the ruler. Off (the default) = every base and event shows on its own.
// On = nearby bases and events merge into circles with a number (zoomed out, until zoom 8).
import type { GeoJSONSource, IControl, Map as MapLibreMap } from 'maplibre-gl'

// The map sources that can be grouped (bases and events)
const SOURCES = ['locations', 'events']
const CLUSTER_UNTIL_ZOOM = 8 // from zoom 9, everything shows on its own even when grouping is on
const CLUSTER_RADIUS = 45 // px: points closer than this on screen merge

// Four dots coming together (+ in the middle): nearby points merge into one group
const GROUP_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">
  <circle cx="7" cy="7" r="2.6" fill="currentColor" stroke="none" />
  <circle cx="17" cy="7" r="2.6" fill="currentColor" stroke="none" />
  <circle cx="7" cy="17" r="2.6" fill="currentColor" stroke="none" />
  <circle cx="17" cy="17" r="2.6" fill="currentColor" stroke="none" />
  <path d="M10 12h4M12 10v4" stroke-linecap="round" />
</svg>`

export class ClusterControl implements IControl {
  private map: MapLibreMap | null = null
  private box: HTMLDivElement | null = null
  private button: HTMLButtonElement | null = null
  private on = false

  onAdd(map: MapLibreMap) {
    this.map = map
    this.box = document.createElement('div')
    this.box.className = 'maplibregl-ctrl maplibregl-ctrl-group'

    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'measure-button' // same look as the ruler button
    this.button.title = 'Group nearby points'
    this.button.setAttribute('aria-label', 'Group nearby points')
    this.button.setAttribute('aria-pressed', 'false')
    this.button.innerHTML = GROUP_ICON
    this.button.onclick = () => this.toggle()

    this.box.appendChild(this.button)
    return this.box
  }

  onRemove() {
    this.box?.remove()
    this.map = null
  }

  private toggle() {
    this.on = !this.on
    this.button?.classList.toggle('active', this.on)
    this.button?.setAttribute('aria-pressed', String(this.on))
    this.button && (this.button.title = this.on ? 'Show every point' : 'Group nearby points')

    // Turn grouping on or off for bases and events (the data stays the same)
    for (const id of SOURCES) {
      const source = this.map?.getSource(id) as GeoJSONSource | undefined
      source?.setClusterOptions({ cluster: this.on, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_UNTIL_ZOOM })
    }
  }
}