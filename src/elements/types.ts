import type { ComponentType, ReactNode } from 'react'
import type { Handle, IfcAPI, IFC4 } from 'web-ifc'
import type { Point } from '@/lib/geometry'
import type { SharedRefs } from '@/lib/ifc/writer'

export type ElementType = string
export type ElementId = number

export interface BaseElement {
  id: ElementId
  type: ElementType
}

export interface SelectionRef {
  type: ElementType
  id: ElementId
}

export type ElementCollection = Record<ElementType, BaseElement[]>

export interface HitTarget {
  kind: 'element' | 'handle'
  elementId: ElementId
  handleId?: string
}

export interface SnapPoint {
  point: Point
  sourceType: ElementType
  sourceId: ElementId
  handleId: string
}

export interface Modifiers {
  shift: boolean
}

export interface Draw2dCtx {
  ctx: CanvasRenderingContext2D
  scale: number
  selected: boolean
  isDraft: boolean
  allElements: ElementCollection
}

export interface IfcCtx {
  api: IfcAPI
  modelID: number
  refs: SharedRefs
  allElements: ElementCollection
}

export type IfcProductHandle = Handle<IFC4.IfcProduct>

export interface ToolCtx {
  worldPoint: Point
  snap: SnapPoint | null
  modifiers: Modifiers
  allElements: ElementCollection
}

export interface ElementExtras<E extends BaseElement> {
  draw2d?: (elements: E[], ctx: Omit<Draw2dCtx, 'selected' | 'isDraft'>) => void
  writeIfc?: (elements: E[], ctx: IfcCtx) => IfcProductHandle[]
  getSnapPoints?: (elements: E[]) => SnapPoint[]
}

export interface ToolDefinition {
  id: string
  label: string
  icon: ComponentType
}

export interface ElementModule<E extends BaseElement, D = E> {
  type: ElementType
  tool: ToolDefinition | null
  createInitial?: () => E[]

  draw2d: (element: E, ctx: Draw2dCtx) => void
  hitTest: (element: E, worldPoint: Point, scale: number) => HitTarget | null
  getSnapPoints: (element: E) => SnapPoint[]

  beginDraft?: (ctx: ToolCtx, nextId: () => ElementId) => D
  updateDraft?: (draft: D, ctx: ToolCtx) => D
  commitDraft?: (draft: D) => E | null
  drawDraft?: (draft: D, ctx: Draw2dCtx) => void

  moveBy: (element: E, delta: Point) => E
  moveHandle?: (element: E, handleId: string, ctx: ToolCtx) => E

  writeIfc: (element: E, ctx: IfcCtx) => IfcProductHandle | null

  renderProperties?: (props: { element: E; onChange: (next: E) => void }) => ReactNode

  extras?: ElementExtras<E>
}

// Variance escape hatch for the registry. Each module operates on its own typed slice
// via the by-type dispatch in registry.ts; outer call sites only see this opaque shape.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyElementModule = ElementModule<any, any>

export type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; pointerId: number; x: number; y: number }
  | { kind: 'draft'; pointerId: number; elementType: ElementType }
  | { kind: 'move-element'; pointerId: number; ref: SelectionRef; last: Point }
  | { kind: 'move-handle'; pointerId: number; ref: SelectionRef; handleId: string }
