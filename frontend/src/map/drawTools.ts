// Everything about Terra Draw (the drawing library) lives here, so MapEditor.tsx stays readable.
import type * as maplibregl from 'maplibre-gl'
import type { Feature } from 'geojson'
import {
  TerraDraw,
  TerraDrawLineStringMode,
  TerraDrawPointMode,
  TerraDrawPolygonMode,
  TerraDrawSelectMode,
  TerraDrawModeUndoRedo,
  TerraDrawSessionUndoRedo,
  TerraDrawUndoRedoKeyboardShortcuts,
  type GeoJSONStoreFeatures,
  type HexColor,
} from 'terra-draw'
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter'
import { DEFAULT_COLOR } from './shapesLayer'

// Colors of the dots that stand for icons while editing
const ICON_COLORS: Record<string, HexColor> = { fighting: '#c81e28', explosion: '#f56e14', text: '#ffffff' }

// Read a color / number from a shape, or use a default
function color(f: GeoJSONStoreFeatures, key: string, fallback = DEFAULT_COLOR): HexColor {
  const value = f.properties[key]
  return (typeof value === 'string' ? value : fallback) as HexColor
}
function num(f: GeoJSONStoreFeatures, key: string, fallback: number): number {
  const value = f.properties[key]
  return typeof value === 'number' ? value : fallback
}
const HANDLES = {
  selectionPointWidth: 7,
  selectionPointColor: '#ffffff' as HexColor,
  selectionPointOutlineColor: '#111111' as HexColor,
  selectionPointOutlineWidth: 2,
  midPointWidth: 4,
  midPointColor: '#ffffff' as HexColor,
  midPointOpacity: 0.55,
  midPointOutlineColor: '#111111' as HexColor,
  midPointOutlineWidth: 1,
}
// Creates the drawing tool on the map. Shapes are drawn in their own colors.
export function createDraw(map: maplibregl.Map): TerraDraw {
  // Allowed while selected: move the shape, drag / add / delete its corners
  const editable = { draggable: true, coordinates: { draggable: true, midpoints: true, deletable: true } }

  return new TerraDraw({
    adapter: new TerraDrawMapLibreGLAdapter({ map }),
    undoRedo: {
      sessionLevel: new TerraDrawSessionUndoRedo(),
      modeLevel: new TerraDrawModeUndoRedo(),
      keyboardShortcuts: new TerraDrawUndoRedoKeyboardShortcuts(),
    },
    modes: [
      new TerraDrawPolygonMode({
        styles: {
          fillColor: (f) => color(f, 'fill'),
          fillOpacity: (f) => num(f, 'fill-opacity', 0.35),
          outlineColor: (f) => color(f, 'stroke', color(f, 'fill')),
          outlineWidth: 2,
        },
      }),
      new TerraDrawLineStringMode({
        styles: {
          lineStringColor: (f) => color(f, 'stroke'),
          lineStringWidth: (f) => num(f, 'stroke-width', 3),
        },
      }),
      new TerraDrawPointMode({
        styles: {
          pointColor: (f) => ICON_COLORS[f.properties.icon as string] ?? ICON_COLORS.explosion,
          pointWidth: 8,
          pointOutlineColor: '#000000',
          pointOutlineWidth: 2,
        },
      }),
      new TerraDrawSelectMode({
        // Delete only with the panel's button (so the panel always knows what changed). Escape = deselect.
        keyEvents: { deselect: 'Escape', delete: null, rotate: null, scale: null },
        styles: HANDLES,
        flags: {
          polygon: { feature: editable },
          linestring: { feature: editable },
          point: { feature: { draggable: true } },
        },
      }),
    ],
  })
}

// Our shapes → Terra Draw shapes. Terra Draw needs a "mode" and an id on every shape,
// and has no "Multi" shapes, so those are split into single ones.
export function toDrawFeatures(features: Feature[], newId: () => string | number): GeoJSONStoreFeatures[] {
  const result: GeoJSONStoreFeatures[] = []
  const add = (geometry: any, mode: string, properties: any) =>
    result.push({ id: newId(), type: 'Feature', geometry, properties: { ...properties, mode } })

  for (const f of features) {
    const g = f.geometry
    const p = f.properties ?? {}
    if (g.type === 'Point') add(g, 'point', p)
    else if (g.type === 'LineString') add(g, 'linestring', p)
    else if (g.type === 'Polygon') add(g, 'polygon', p)
    else if (g.type === 'MultiLineString') g.coordinates.forEach((c) => add({ type: 'LineString', coordinates: c }, 'linestring', p))
    else if (g.type === 'MultiPolygon') g.coordinates.forEach((c) => add({ type: 'Polygon', coordinates: c }, 'polygon', p))
  }
  return result
}

// Terra Draw also keeps helper points (corners, midpoints…). Only real, finished shapes are saved.
const HELPER_PROPERTIES = ['midPoint', 'selectionPoint', 'coordinatePoint', 'closingPoint', 'snappingPoint', 'currentlyDrawing']

export function fromDraw(snapshot: GeoJSONStoreFeatures[]): Feature[] {
  return snapshot
    .filter((f) => ['polygon', 'linestring', 'point'].includes(f.properties.mode as string))
    .filter((f) => !HELPER_PROPERTIES.some((key) => f.properties[key]))
    .map((f) => ({ type: 'Feature', geometry: f.geometry, properties: f.properties }))
}
function pressKey(map: maplibregl.Map, key: string) {
  for (const type of ['keydown', 'keyup']) {
    map.getCanvas().dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }))
  }
}
export const finishDrawing = (map: maplibregl.Map) => pressKey(map, 'Enter')
export const cancelDrawing = (map: maplibregl.Map) => pressKey(map, 'Escape')