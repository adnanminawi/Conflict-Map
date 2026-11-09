// While the admin edits bases and events on the map, a click on a base or an event
// picks it for editing instead of opening its popup. locationsLayer.ts and eventsLayer.ts ask here first.

export type PickKind = 'location' | 'event'
type PickHandler = (kind: PickKind, id: number) => void

let handler: PickHandler | null = null

// The edit box turns picking on (with what to do) and off (null)
export function setPickHandler(fn: PickHandler | null) {
  handler = fn
}

export function getPickHandler(): PickHandler | null {
  return handler
}