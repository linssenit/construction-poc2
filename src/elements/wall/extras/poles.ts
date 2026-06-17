import * as THREE from 'three'
import { PIXELS_PER_METER, POLE_HEIGHT_METERS, POLE_SIZE_METERS, SOKKEL_HEIGHT_METERS, SOKKEL_SIZE_METERS } from '@/lib/dimensions'
import { getDistance } from '@/lib/geometry'
import type { Point } from '@/lib/geometry'
import {
  ifcGuid,
  writeBoxShape,
  writeLocalPlacement,
} from '@/lib/ifc/writer'
import type { ElementExtras, IfcCtx } from '@/elements/types'
import type { Wall } from '../types'

const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.7 })
const sokkelMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4956, roughness: 0.5 })
const sokkelGeometry = new THREE.BoxGeometry(SOKKEL_SIZE_METERS, SOKKEL_HEIGHT_METERS, SOKKEL_SIZE_METERS)
const poleGeometry = new THREE.BoxGeometry(POLE_SIZE_METERS, POLE_HEIGHT_METERS, POLE_SIZE_METERS)

const POLE_MERGE_TOLERANCE_METERS = POLE_SIZE_METERS

export const wallPolesExtras: ElementExtras<Wall> = {
  draw2d(walls, ctx) {
    drawPoleAngles(ctx.ctx, walls)
  },
  build3d(walls, ctx) {
    for (const { x, z } of getUniqueEndpointsMeters(walls)) {
      const sokkel = new THREE.Mesh(sokkelGeometry, sokkelMaterial)
      sokkel.position.set(x, SOKKEL_HEIGHT_METERS / 2, z)
      ctx.group.add(sokkel)

      const pole = new THREE.Mesh(poleGeometry, poleMaterial)
      pole.position.set(x, SOKKEL_HEIGHT_METERS + POLE_HEIGHT_METERS / 2, z)
      ctx.group.add(pole)
    }
  },
  writeIfc(walls, ctx) {
    const ids: number[] = []

    for (const [x, y] of getUniqueEndpointsForIfc(walls)) {
      ids.push(writeSokkel(ctx, x, y))
      ids.push(writePole(ctx, x, y))
    }

    return ids
  },
}

function writeSokkel(ctx: IfcCtx, x: number, y: number): number {
  const placement = writeLocalPlacement(ctx.writer, ctx.refs.storeyPlacement, x, y, 0, 1, 0)
  const shape = writeBoxShape(ctx.writer, ctx.refs.context, SOKKEL_SIZE_METERS, SOKKEL_SIZE_METERS, SOKKEL_HEIGHT_METERS)

  return ctx.writer.add(
    `IFCFOOTING('${ifcGuid()}',#${ctx.refs.ownerHistory},'Sokkel',$,$,#${placement},#${shape},$,.PAD_FOOTING.)`,
  )
}

function writePole(ctx: IfcCtx, x: number, y: number): number {
  const placement = writeLocalPlacement(ctx.writer, ctx.refs.storeyPlacement, x, y, SOKKEL_HEIGHT_METERS, 1, 0)
  const shape = writeBoxShape(ctx.writer, ctx.refs.context, POLE_SIZE_METERS, POLE_SIZE_METERS, POLE_HEIGHT_METERS)

  return ctx.writer.add(
    `IFCCOLUMN('${ifcGuid()}',#${ctx.refs.ownerHistory},'Pole',$,$,#${placement},#${shape},$,.COLUMN.)`,
  )
}

function getUniqueEndpointsMeters(walls: Wall[]): Array<{ x: number; z: number }> {
  const seen = new Map<string, { x: number; z: number }>()

  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const x = point.x / PIXELS_PER_METER
      const z = point.y / PIXELS_PER_METER
      const key = `${Math.round(x * 1000)}_${Math.round(z * 1000)}`

      if (!seen.has(key)) {
        seen.set(key, { x, z })
      }
    }
  }

  return [...seen.values()]
}

function getUniqueEndpointsForIfc(walls: Wall[]): Array<[number, number]> {
  const points: Array<[number, number]> = []

  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const x = point.x / PIXELS_PER_METER
      const y = point.y / PIXELS_PER_METER

      const exists = points.some(
        ([px, py]) => Math.hypot(px - x, py - y) <= POLE_MERGE_TOLERANCE_METERS,
      )

      if (!exists) {
        points.push([x, y])
      }
    }
  }

  return points
}

function drawPoleAngles(context: CanvasRenderingContext2D, walls: Wall[]) {
  const poles = new Map<string, { position: Point; directions: number[] }>()

  for (const wall of walls) {
    const length = getDistance(wall.start, wall.end)

    if (length === 0) {
      continue
    }

    const startDir = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x)
    const endDir = Math.atan2(wall.start.y - wall.end.y, wall.start.x - wall.end.x)

    addPoleDirection(poles, wall.start, startDir)
    addPoleDirection(poles, wall.end, endDir)
  }

  for (const { position, directions } of poles.values()) {
    if (directions.length < 2) {
      continue
    }

    const sorted = [...directions].sort((a, b) => a - b)

    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i]
      const next = sorted[(i + 1) % sorted.length]
      let gap = next - current

      if (i === sorted.length - 1) {
        gap = next + Math.PI * 2 - current
      }

      if (gap <= 0.01 || gap >= Math.PI - 0.01) {
        continue
      }

      drawAngleArc(context, position, current, gap)
    }
  }
}

function addPoleDirection(
  poles: Map<string, { position: Point; directions: number[] }>,
  position: Point,
  direction: number,
) {
  const key = `${Math.round(position.x)}_${Math.round(position.y)}`
  const entry = poles.get(key)

  if (entry) {
    entry.directions.push(direction)
    return
  }

  poles.set(key, { position, directions: [direction] })
}

function drawAngleArc(
  context: CanvasRenderingContext2D,
  position: Point,
  startAngle: number,
  gap: number,
) {
  const radius = 22
  const labelDistance = radius + 12
  const midAngle = startAngle + gap / 2
  const labelX = position.x + Math.cos(midAngle) * labelDistance
  const labelY = position.y + Math.sin(midAngle) * labelDistance
  const degrees = (gap * 180) / Math.PI
  const label = `${degrees.toFixed(1)}°`

  context.save()
  context.strokeStyle = '#77828c'
  context.fillStyle = '#ffffff'
  context.lineWidth = 1.25
  context.beginPath()
  context.arc(position.x, position.y, radius, startAngle, startAngle + gap)
  context.stroke()

  context.font = '11px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const textWidth = context.measureText(label).width + 8
  context.beginPath()
  context.roundRect(labelX - textWidth / 2, labelY - 9, textWidth, 18, 4)
  context.fillStyle = '#ffffff'
  context.strokeStyle = '#d2cec7'
  context.fill()
  context.stroke()

  context.fillStyle = '#2f3d48'
  context.fillText(label, labelX, labelY)
  context.restore()
}

