import { PIXELS_PER_METER, WALL_HEIGHT_METERS } from '@/lib/dimensions'
import {
  ifcGuid,
  writeBoxShape,
  writeLocalPlacement,
} from '@/lib/ifc/writer'
import type { IfcCtx } from '@/elements/types'
import type { Wall } from './types'
import { WALL_WIDTH } from './types'

export function writeWallIfc(wall: Wall, ctx: IfcCtx): number | null {
  if (!wall.hasInfill) {
    return null
  }

  const startX = wall.start.x / PIXELS_PER_METER
  const startY = wall.start.y / PIXELS_PER_METER
  const endX = wall.end.x / PIXELS_PER_METER
  const endY = wall.end.y / PIXELS_PER_METER
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  const cx = (startX + endX) / 2
  const cy = (startY + endY) / 2
  const dirX = dx / length
  const dirY = dy / length
  const thickness = WALL_WIDTH / PIXELS_PER_METER

  const placement = writeLocalPlacement(ctx.writer, ctx.refs.storeyPlacement, cx, cy, 0, dirX, dirY)
  const shape = writeBoxShape(ctx.writer, ctx.refs.context, length, thickness, WALL_HEIGHT_METERS)

  return ctx.writer.add(
    `IFCWALLSTANDARDCASE('${ifcGuid()}',#${ctx.refs.ownerHistory},'Wall',$,$,#${placement},#${shape},$,.NOTDEFINED.)`,
  )
}
