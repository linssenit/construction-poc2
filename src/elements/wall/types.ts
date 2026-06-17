import type { Point } from '@/lib/geometry'
import type { BaseElement } from '@/elements/types'

export const WALL_TYPE = 'wall' as const
export type WallType = typeof WALL_TYPE

export interface Wall extends BaseElement {
  type: WallType
  start: Point
  end: Point
  hasInfill: boolean
}

export type WallHandleId = 'start' | 'end'

export interface WallDraft {
  id: number
  start: Point
  end: Point
  hasInfill: boolean
}

export const WALL_WIDTH = 12
export const POLE_SNAP_PIXELS = 20
