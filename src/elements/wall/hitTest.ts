import type { Point } from '@/lib/geometry'
import { getDistance, getDistanceToSegment } from '@/lib/geometry'
import type { HitTarget } from '@/elements/types'
import type { Wall } from './types'

export function hitTestWall(wall: Wall, worldPoint: Point, scale: number): HitTarget | null {
  const endpointThreshold = 12 / scale
  const wallThreshold = 10 / scale

  if (getDistance(worldPoint, wall.start) <= endpointThreshold) {
    return { kind: 'handle', elementId: wall.id, handleId: 'start' }
  }

  if (getDistance(worldPoint, wall.end) <= endpointThreshold) {
    return { kind: 'handle', elementId: wall.id, handleId: 'end' }
  }

  if (getDistanceToSegment(worldPoint, wall.start, wall.end) <= wallThreshold) {
    return { kind: 'element', elementId: wall.id }
  }

  return null
}
