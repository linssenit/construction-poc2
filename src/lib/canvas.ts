import { PIXELS_PER_METER } from '@/lib/dimensions'
import type { Unit } from '@/lib/dimensions'
import type { Point } from '@/lib/geometry'
import { getDistance } from '@/lib/geometry'

export function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  scale: number,
) {
  const minorStep = 40 * scale
  const majorStep = minorStep * 5

  context.save()
  context.lineWidth = 1
  drawGridLines(context, width, height, originX, originY, minorStep, '#e4e1dc')
  drawGridLines(context, width, height, originX, originY, majorStep, '#d2cec7')
  context.restore()
}

function drawGridLines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  step: number,
  color: string,
) {
  const startX = originX + Math.floor((0 - originX) / step) * step
  const startY = originY + Math.floor((0 - originY) / step) * step

  context.beginPath()
  context.strokeStyle = color

  for (let x = startX; x <= width; x += step) {
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }

  for (let y = startY; y <= height; y += step) {
    context.moveTo(0, y)
    context.lineTo(width, y)
  }

  context.stroke()
}

export function drawSnapIndicator(context: CanvasRenderingContext2D, point: Point, scale: number) {
  const radius = 14 / scale

  context.save()
  context.strokeStyle = '#16a9e6'
  context.fillStyle = 'rgba(22, 169, 230, 0.18)'
  context.lineWidth = 2 / scale
  context.beginPath()
  context.arc(point.x, point.y, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

export function drawHandle(context: CanvasRenderingContext2D, point: Point) {
  context.save()
  context.fillStyle = '#ffffff'
  context.strokeStyle = '#16a9e6'
  context.lineWidth = 2
  context.beginPath()
  context.arc(point.x, point.y, 7, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

export function drawDimensionLine(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  label: string,
  emphasis: 'primary' | 'secondary',
) {
  const length = getDistance(from, to)

  if (length === 0) {
    return
  }

  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const arrowSize = 9
  const color = emphasis === 'primary' ? '#111111' : '#77828c'
  const lineWidth = emphasis === 'primary' ? 1.25 : 1
  const fontWeight = emphasis === 'primary' ? '600' : '400'
  const fontSize = emphasis === 'primary' ? 13 : 11

  context.save()
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = lineWidth
  context.lineCap = 'butt'

  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
  context.stroke()

  drawArrowhead(context, from, angle + Math.PI, arrowSize)
  drawArrowhead(context, to, angle, arrowSize)

  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2

  let textAngle = angle
  if (textAngle >= Math.PI / 2) {
    textAngle -= Math.PI
  } else if (textAngle < -Math.PI / 2) {
    textAngle += Math.PI
  }

  context.translate(midX, midY)
  context.rotate(textAngle)

  context.font = `${fontWeight} ${fontSize}px Inter, system-ui, sans-serif`
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const textWidth = context.measureText(label).width
  const padding = 5

  context.fillStyle = '#f3f2ef'
  context.fillRect(-textWidth / 2 - padding, -fontSize / 2 - 2, textWidth + padding * 2, fontSize + 4)

  context.fillStyle = color
  context.fillText(label, 0, 0)
  context.restore()
}

function drawArrowhead(context: CanvasRenderingContext2D, tip: Point, angle: number, size: number) {
  const baseX = tip.x - Math.cos(angle) * size
  const baseY = tip.y - Math.sin(angle) * size
  const halfWidth = size * 0.32
  const perpX = -Math.sin(angle) * halfWidth
  const perpY = Math.cos(angle) * halfWidth

  context.beginPath()
  context.moveTo(tip.x, tip.y)
  context.lineTo(baseX + perpX, baseY + perpY)
  context.lineTo(baseX - perpX, baseY - perpY)
  context.closePath()
  context.fill()
}

export function formatDistance(distance: number, unit: Unit = 'm'): string {
  const meters = distance / PIXELS_PER_METER

  switch (unit) {
    case 'mm':
      return `${Math.round(meters * 1000)} mm`
    case 'cm':
      return `${(meters * 100).toFixed(1)} cm`
    case 'm':
      return `${meters.toFixed(2)} m`
  }
}
