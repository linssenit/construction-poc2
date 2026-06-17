import type { ToolCtx } from '@/elements/types'
import type { Point } from '@/lib/geometry'
import { addPoints } from '@/lib/geometry'
import type { Wall, WallHandleId } from './types'
import { resolveWallEndpoint } from './tool'

export function moveWallBy(wall: Wall, delta: Point): Wall {
  return {
    ...wall,
    start: addPoints(wall.start, delta),
    end: addPoints(wall.end, delta),
  }
}

export function moveWallHandle(wall: Wall, handleId: string, ctx: ToolCtx): Wall {
  const handle = handleId as WallHandleId
  const fixedPoint = handle === 'start' ? wall.end : wall.start
  const movedPoint = resolveWallEndpoint(fixedPoint, ctx)

  return { ...wall, [handle]: movedPoint }
}
