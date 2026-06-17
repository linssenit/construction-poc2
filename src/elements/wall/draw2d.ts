import { POLE_SIZE_PIXELS } from '@/lib/dimensions'
import type { Point } from '@/lib/geometry'
import {
  addScaled,
  getDistance,
  getNormal,
  offsetPoint,
} from '@/lib/geometry'
import { drawDimensionLine, drawHandle, formatDistance } from '@/lib/canvas'
import type { Draw2dCtx } from '@/elements/types'
import type { Wall } from './types'
import { WALL_WIDTH } from './types'

export function drawWall(wall: Wall, ctx: Draw2dCtx) {
  drawWallShape(ctx.ctx, wall, ctx.isDraft)

  if (!wall.hasInfill) {
    drawPoleMarkers(ctx.ctx, wall, ctx.selected, ctx.isDraft)
  }

  if (ctx.selected || ctx.isDraft) {
    drawWallGuides(ctx.ctx, wall, ctx.isDraft)
  }
}

export function drawWallDistanceLabels(walls: Wall[], context: CanvasRenderingContext2D) {
  if (walls.length === 0) {
    return
  }

  const centroid = computeWallsCentroid(walls)

  for (const wall of walls) {
    const outward = getOutwardNormal(wall, centroid)
    drawDistanceLabel(context, wall, outward)
  }
}

function drawWallShape(context: CanvasRenderingContext2D, wall: Wall, draft: boolean) {
  context.save()
  context.lineCap = 'square'
  context.lineJoin = 'miter'

  if (wall.hasInfill) {
    context.shadowColor = draft ? 'transparent' : 'rgba(0, 0, 0, 0.18)'
    context.shadowBlur = 0
    context.shadowOffsetX = draft ? 0 : 5
    context.shadowOffsetY = draft ? 0 : 6
    context.strokeStyle = draft ? '#16a9e6' : '#050505'
    context.lineWidth = WALL_WIDTH

    context.beginPath()
    context.moveTo(wall.start.x, wall.start.y)
    context.lineTo(wall.end.x, wall.end.y)
    context.stroke()
  } else {
    context.strokeStyle = draft ? '#16a9e6' : '#7a7570'
    context.lineWidth = 2
    context.setLineDash([6, 6])
    context.beginPath()
    context.moveTo(wall.start.x, wall.start.y)
    context.lineTo(wall.end.x, wall.end.y)
    context.stroke()
    context.setLineDash([])
  }

  context.restore()
}

function drawPoleMarkers(
  context: CanvasRenderingContext2D,
  wall: Wall,
  selected: boolean,
  draft: boolean,
) {
  const size = WALL_WIDTH
  const fill = draft ? '#16a9e6' : '#050505'
  const stroke = selected ? '#16a9e6' : 'rgba(0, 0, 0, 0.6)'

  context.save()
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = 1.5

  for (const point of [wall.start, wall.end]) {
    context.beginPath()
    context.rect(point.x - size / 2, point.y - size / 2, size, size)
    context.fill()
    context.stroke()
  }

  context.restore()
}

function drawWallGuides(context: CanvasRenderingContext2D, wall: Wall, draft: boolean) {
  context.save()
  context.strokeStyle = '#16a9e6'
  context.fillStyle = '#16a9e6'
  context.lineWidth = 2
  context.setLineDash(draft ? [10, 8] : [])

  context.beginPath()
  context.moveTo(wall.start.x, wall.start.y)
  context.lineTo(wall.end.x, wall.end.y)
  context.stroke()
  context.setLineDash([])

  drawHandle(context, wall.start)
  drawHandle(context, wall.end)
  context.restore()
}

function drawDistanceLabel(context: CanvasRenderingContext2D, wall: Wall, normal: Point) {
  const wallLength = getDistance(wall.start, wall.end)

  if (wallLength === 0) {
    return
  }

  const poleProjection = getPoleProjection(wall)
  const outerLength = wallLength + 2 * poleProjection
  const innerLength = Math.max(0, wallLength - 2 * poleProjection)

  const direction: Point = {
    x: (wall.end.x - wall.start.x) / wallLength,
    y: (wall.end.y - wall.start.y) / wallLength,
  }

  const innerOffset = 30
  const outerOffset = 54

  if (innerLength > 0) {
    const innerStart = offsetPoint(
      addScaled(wall.start, direction, poleProjection),
      normal,
      innerOffset,
    )
    const innerEnd = offsetPoint(
      addScaled(wall.end, direction, -poleProjection),
      normal,
      innerOffset,
    )

    drawDimensionLine(context, innerStart, innerEnd, formatDistance(innerLength), 'secondary')
  }

  const outerStart = offsetPoint(
    addScaled(wall.start, direction, -poleProjection),
    normal,
    outerOffset,
  )
  const outerEnd = offsetPoint(
    addScaled(wall.end, direction, poleProjection),
    normal,
    outerOffset,
  )

  drawDimensionLine(context, outerStart, outerEnd, formatDistance(outerLength), 'primary')
}

function computeWallsCentroid(walls: Wall[]): Point {
  if (walls.length === 0) {
    return { x: 0, y: 0 }
  }

  let sumX = 0
  let sumY = 0

  for (const wall of walls) {
    sumX += wall.start.x + wall.end.x
    sumY += wall.start.y + wall.end.y
  }

  const count = walls.length * 2

  return { x: sumX / count, y: sumY / count }
}

function getOutwardNormal(wall: Wall, centroid: Point): Point {
  const normal = getNormal(wall.start, wall.end)
  const midX = (wall.start.x + wall.end.x) / 2
  const midY = (wall.start.y + wall.end.y) / 2
  const dot = normal.x * (midX - centroid.x) + normal.y * (midY - centroid.y)

  return dot >= 0 ? normal : { x: -normal.x, y: -normal.y }
}

function getPoleProjection(wall: Wall): number {
  const length = getDistance(wall.start, wall.end)

  if (length === 0) {
    return 0
  }

  const dirX = Math.abs(wall.end.x - wall.start.x) / length
  const dirY = Math.abs(wall.end.y - wall.start.y) / length
  const maxAxis = Math.max(dirX, dirY)

  if (maxAxis === 0) {
    return 0
  }

  return (POLE_SIZE_PIXELS / 2) / maxAxis
}
