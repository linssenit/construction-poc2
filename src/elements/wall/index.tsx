import type { ElementModule } from '@/elements/types'
import { drawWall, drawWallDistanceLabels } from './draw2d'
import { hitTestWall } from './hitTest'
import { getWallSnapPoints } from './snap'
import { beginWallDraft, commitWallDraft, updateWallDraft } from './tool'
import { moveWallBy, moveWallHandle } from './move'
import { writeWallIfc } from './ifc'
import { WallProperties } from './properties'
import { WallIcon } from './icon'
import { wallPolesExtras } from './extras/poles'
import { wallEdgeBeamsExtras } from './extras/edgeBeams'
import type { Wall, WallDraft } from './types'
import { WALL_TYPE } from './types'

const initialWalls: Wall[] = [
  { id: 1, type: WALL_TYPE, start: { x: -260, y: -125 }, end: { x: 260, y: -125 }, hasInfill: false },
  { id: 2, type: WALL_TYPE, start: { x: 260, y: -125 }, end: { x: 260, y: 125 }, hasInfill: false },
  { id: 3, type: WALL_TYPE, start: { x: 260, y: 125 }, end: { x: -260, y: 125 }, hasInfill: false },
  { id: 4, type: WALL_TYPE, start: { x: -260, y: 125 }, end: { x: -260, y: -125 }, hasInfill: false },
]

export const wallModule: ElementModule<Wall, WallDraft> = {
  type: WALL_TYPE,
  tool: { id: 'wall', label: 'Walls', icon: WallIcon },
  createInitial: () => initialWalls,

  draw2d: drawWall,
  hitTest: hitTestWall,
  getSnapPoints: getWallSnapPoints,

  beginDraft: beginWallDraft,
  updateDraft: updateWallDraft,
  commitDraft: commitWallDraft,
  drawDraft: (draft, ctx) =>
    drawWall(
      { id: draft.id, type: WALL_TYPE, start: draft.start, end: draft.end, hasInfill: draft.hasInfill },
      ctx,
    ),

  moveBy: moveWallBy,
  moveHandle: moveWallHandle,

  writeIfc: writeWallIfc,

  renderProperties: WallProperties,

  extras: {
    draw2d(walls, ctx) {
      drawWallDistanceLabels(walls, ctx.ctx, ctx.unit)
      wallPolesExtras.draw2d?.(walls, ctx)
      // Edge beams are intentionally not drawn in 2D — IFC/3D only.
    },
    writeIfc(walls, ctx) {
      return [
        ...(wallPolesExtras.writeIfc?.(walls, ctx) ?? []),
        ...(wallEdgeBeamsExtras.writeIfc?.(walls, ctx) ?? []),
      ]
    },
  },
}

export type { Wall, WallDraft } from './types'
