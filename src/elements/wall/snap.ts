import type { SnapPoint } from '@/elements/types'
import type { Wall } from './types'
import { WALL_TYPE } from './types'

export function getWallSnapPoints(wall: Wall): SnapPoint[] {
  return [
    { point: wall.start, sourceType: WALL_TYPE, sourceId: wall.id, handleId: 'start' },
    { point: wall.end, sourceType: WALL_TYPE, sourceId: wall.id, handleId: 'end' },
  ]
}

export function snapAxis(start: { x: number; y: number }, end: { x: number; y: number }) {
  const deltaX = end.x - start.x
  const deltaY = end.y - start.y

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: end.x, y: start.y }
  }

  return { x: start.x, y: end.y }
}
