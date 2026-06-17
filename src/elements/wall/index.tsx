import type { ElementModule } from '@/elements/types'
import { drawWall, drawWallDistanceLabels } from './draw2d'
import { hitTestWall } from './hitTest'
import { getWallSnapPoints } from './snap'
import { beginWallDraft, commitWallDraft, updateWallDraft } from './tool'
import { moveWallBy, moveWallHandle } from './move'
import { buildWallMesh } from './build3d'
import { writeWallIfc } from './ifc'
import { WallProperties } from './properties'
import { WallIcon } from './icon'
import { wallPolesExtras } from './extras/poles'
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

  build3d: buildWallMesh,
  writeIfc: writeWallIfc,

  renderProperties: WallProperties,

  extras: {
    ...wallPolesExtras,
    draw2d(walls, ctx) {
      drawWallDistanceLabels(walls, ctx.ctx)
      wallPolesExtras.draw2d?.(walls, ctx)
    },
  },
}

export type { Wall, WallDraft } from './types'
