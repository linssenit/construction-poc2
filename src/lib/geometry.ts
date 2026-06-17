export type Point = {
  x: number
  y: number
}

export type Viewport = {
  x: number
  y: number
  scale: number
}

export function addPoints(point: Point, delta: Point): Point {
  return { x: point.x + delta.x, y: point.y + delta.y }
}

export function offsetPoint(point: Point, direction: Point, distance: number): Point {
  return {
    x: point.x + direction.x * distance,
    y: point.y + direction.y * distance,
  }
}

export function addScaled(point: Point, direction: Point, scale: number): Point {
  return {
    x: point.x + direction.x * scale,
    y: point.y + direction.y * scale,
  }
}

export function getDistance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

export function getNormal(start: Point, end: Point): Point {
  const distance = getDistance(start, end)

  if (distance === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: -(end.y - start.y) / distance,
    y: (end.x - start.x) / distance,
  }
}

export function getDistanceToSegment(point: Point, start: Point, end: Point): number {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2

  if (lengthSquared === 0) {
    return getDistance(point, start)
  }

  const t = clamp(
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
      lengthSquared,
    0,
    1,
  )

  return getDistance(point, {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  })
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function screenToWorldPoint(
  localX: number,
  localY: number,
  rect: { width: number; height: number },
  viewport: Viewport,
): Point {
  return {
    x: (localX - rect.width / 2 - viewport.x) / viewport.scale,
    y: (localY - rect.height / 2 - viewport.y) / viewport.scale,
  }
}
