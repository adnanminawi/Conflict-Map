import { useEffect, useRef, useState } from 'react'
import type * as maplibregl from 'maplibre-gl'
import type { GeoJSONStoreFeatures, TerraDraw } from 'terra-draw'
import { saveLayer } from '../api/admin'
import { getErrorMessage, isUnauthorized } from '../api/client'
import { createDraw, fromDraw, toDrawFeatures } from '../map/drawTools'
import { DEFAULT_COLOR, enableShapePopups } from '../map/shapesLayer'
import type { MapLayer } from '../types'

interface Props {
  map: maplibregl.Map
  layers: MapLayer[]
  onEditingChange: (layerName: string | null) => void // tells the map which layer to hide while editing
  onSaved: () => Promise<void> // reloads the layers after a save
}

type Tool = 'select' | 'area' | 'line' | 'arrow' | 'fighting' | 'explosion' | 'text'

// Each tool uses one Terra Draw mode. The hint explains how to use it.
const TOOLS: { tool: Tool; label: string; mode: string; hint: string }[] = [
  { tool: 'select', label: 'Select', mode: 'select', hint: 'Click a shape to change it. Drag it to move it, drag its corners to reshape it.' },
  { tool: 'area', label: 'Area', mode: 'polygon', hint: 'Click to add corners. Click the first corner again to finish.' },
  { tool: 'line', label: 'Line', mode: 'linestring', hint: 'Click to add points. Click the last point again to finish.' },
  { tool: 'arrow', label: 'Arrow', mode: 'linestring', hint: 'Like a line. The arrowhead goes at the last point.' },
  { tool: 'fighting', label: 'Fighting', mode: 'point', hint: 'Click where the fighting is.' },
  { tool: 'explosion', label: 'Explosion', mode: 'point', hint: 'Click where the explosion was.' },
  { tool: 'text', label: 'Text', mode: 'point', hint: 'Click where the text goes, then type it in the panel.' },
]

// How a new shape looks, depending on the tool that drew it
function defaultProps(tool: Tool) {
  if (tool === 'area') return { fill: DEFAULT_COLOR, stroke: DEFAULT_COLOR, 'fill-opacity': 0.35 }
  if (tool === 'line') return { stroke: DEFAULT_COLOR, 'stroke-width': 3, arrow: false }
  if (tool === 'arrow') return { stroke: DEFAULT_COLOR, 'stroke-width': 4, arrow: true }
  return { icon: tool } // fighting / explosion / text
}

const today = new Date().toLocaleDateString('en-CA') // "2026-10-29"

// The admin's editing panel on the map. Only shown when an admin is logged in.
export default function MapEditor({ map, layers, onEditingChange, onSaved }: Props) {
  const drawRef = useRef<TerraDraw | null>(null)
  const toolRef = useRef<Tool>('select') // the 'finish' event needs the current tool
  const keptRef = useRef<GeoJSONStoreFeatures[]>([]) // shapes Terra Draw can't edit: saved unchanged

  const [editing, setEditing] = useState<string | null>(null) // name of the layer being edited
  const [pick, setPick] = useState('') // layer name typed / chosen before editing
  const [tool, setTool] = useState<Tool>('select')
  const [selected, setSelected] = useState<{ id: string | number; props: Record<string, any> } | null>(null)
  const [date, setDate] = useState(today)
  const [changed, setChanged] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  // If the page closes while editing, remove the drawing tool from the map
  useEffect(() => () => drawRef.current?.stop(), [])

  function chooseTool(next: Tool) {
    toolRef.current = next
    setTool(next)
    setSelected(null)
    drawRef.current?.setMode(TOOLS.find((t) => t.tool === next)!.mode)
  }

  function startEditing() {
    const name = pick.trim()
    if (!name) return
    const layer = layers.find((l) => l.name === name) // existing layer, or undefined = new layer

    const draw = createDraw(map)
    draw.start()

    // Put the layer's shapes into the editor. Shapes Terra Draw refuses (e.g. areas with holes) are kept aside.
    const features = toDrawFeatures(layer?.geojson.features ?? [], () => draw.getFeatureId())
    const results = draw.addFeatures(features)
    keptRef.current = features.filter((_, i) => !results[i].valid)

    // A shape was drawn or changed
    draw.on('finish', (id, context) => {
      setChanged(true)
      if (context.action !== 'draw') return
      // New shape: give it its look, then select it so the admin can name it
      draw.updateFeatureProperties(id, defaultProps(toolRef.current))
      chooseTool('select')
      draw.selectFeature(id)
    })
    draw.on('select', (id) => setSelected({ id, props: { ...draw.getSnapshotFeature(id)?.properties } }))
    draw.on('deselect', () => setSelected(null))

    drawRef.current = draw
    enableShapePopups(false) // no popups while drawing
    setEditing(name)
    onEditingChange(name)
    setChanged(false)
    setError('')
    setMessage(keptRef.current.length > 0 ? `${keptRef.current.length} shapes can't be edited here. They will be kept as they are.` : '')
    chooseTool('select')
  }

  function stopEditing() {
    drawRef.current?.stop()
    drawRef.current = null
    keptRef.current = []
    enableShapePopups(true)
    setEditing(null)
    setSelected(null)
    onEditingChange(null)
  }

  // Change the selected shape (name, color, arrow…)
  function updateSelected(changes: Record<string, string | boolean>) {
    if (!selected || !drawRef.current) return
    drawRef.current.updateFeatureProperties(selected.id, changes)
    setSelected({ ...selected, props: { ...selected.props, ...changes } })
    setChanged(true)
  }

  function deleteSelected() {
    if (!selected || !drawRef.current) return
    drawRef.current.deselectFeature(selected.id)
    drawRef.current.removeFeatures([selected.id])
    setSelected(null)
    setChanged(true)
  }

  async function save() {
    if (!drawRef.current || !editing) return
    const features = [...fromDraw(drawRef.current.getSnapshot()), ...fromDraw(keptRef.current)]
    if (features.length === 0) {
      setError('Draw at least one shape before saving.')
      return
    }

    setBusy(true)
    setError('')
    try {
      const result = await saveLayer({ name: editing, date, features })
      await onSaved() // reload the layers, so the map shows the new version
      stopEditing()
      setMessage(`${result.replaced ? 'Replaced' : 'Saved'} "${editing}" for ${date}.`)
    } catch (err) {
      // Login expired: keep the drawing, so nothing is lost
      if (isUnauthorized(err)) setError('Your login expired. Log in again on /admin in a new tab, then click Save again.')
      else setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  function cancel() {
    if (changed && !window.confirm('Leave without saving? Your changes will be lost.')) return
    stopEditing()
    setMessage('')
  }

  // ---------- Not editing: choose a layer ----------
  if (!editing) {
    const exists = layers.some((l) => l.name === pick.trim())
    return (
      <div className="map-panel editor">
        <div className="editor-title">Edit map</div>
        <input
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          list="editor-layers"
          placeholder="Layer name, e.g. Yemen frontlines"
        />
        <datalist id="editor-layers">
          {layers.map((l) => (
            <option key={l.id} value={l.name} />
          ))}
        </datalist>
        <button className="btn btn-small" onClick={startEditing} disabled={!pick.trim()}>
          {exists || !pick.trim() ? 'Edit layer' : 'Create new layer'}
        </button>
        {message && <p className="editor-note">{message}</p>}
      </div>
    )
  }

  // ---------- Editing ----------
  const p = selected?.props
  return (
    <div className="map-panel editor">
      <div className="editor-title">Editing: {editing}</div>

      <div className="editor-tools">
        {TOOLS.map((t) => (
          <button key={t.tool} className={tool === t.tool ? 'tool active' : 'tool'} onClick={() => chooseTool(t.tool)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="editor-note">{TOOLS.find((t) => t.tool === tool)!.hint}</p>
      {message && <p className="editor-note">{message}</p>}

      {/* The selected shape */}
      {selected && p && (
        <div className="editor-section">
          <label>
            {p.icon === 'text' ? 'Text' : 'Name'}
            <input value={p.name ?? ''} onChange={(e) => updateSelected({ name: e.target.value })} />
          </label>

          {p.mode !== 'point' && (
            <label>
              Color
              <input
                type="color"
                value={p.stroke ?? p.fill ?? DEFAULT_COLOR}
                onChange={(e) =>
                  updateSelected(p.mode === 'polygon' ? { fill: e.target.value, stroke: e.target.value } : { stroke: e.target.value })
                }
              />
            </label>
          )}

          {p.mode === 'linestring' && (
            <label className="editor-check">
              <input type="checkbox" checked={p.arrow === true} onChange={(e) => updateSelected({ arrow: e.target.checked })} />
              Arrowhead at the end
            </label>
          )}

          {p.mode === 'point' && (
            <label>
              Type
              <select value={p.icon ?? 'explosion'} onChange={(e) => updateSelected({ icon: e.target.value })}>
                <option value="fighting">Fighting</option>
                <option value="explosion">Explosion</option>
                <option value="text">Text only</option>
              </select>
            </label>
          )}

          <label>
            Description
            <textarea rows={2} value={p.description ?? ''} onChange={(e) => updateSelected({ description: e.target.value })} />
          </label>

          <button className="btn btn-small btn-danger" onClick={deleteSelected}>
            Delete shape
          </button>
        </div>
      )}

      {/* Save */}
      <div className="editor-section">
        <label>
          Date this map shows
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <div className="editor-actions">
          <button className="btn btn-small" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button className="btn btn-small btn-ghost" onClick={cancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}