import { Handle, IFC4 } from 'web-ifc'
import { PIXELS_PER_METER, WALL_HEIGHT_METERS } from '@/lib/dimensions'
import { makeBoxShape, makeLocalPlacement, newGuid } from '@/lib/ifc/writer'
import type { IfcCtx, IfcProductHandle } from '@/elements/types'
import type { Wall } from './types'
import { WALL_WIDTH } from './types'

export function writeWallIfc(wall: Wall, ctx: IfcCtx): IfcProductHandle | null {
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

  const placement = makeLocalPlacement(
    ctx.api,
    ctx.modelID,
    ctx.refs.storeyPlacement,
    cx,
    cy,
    0,
    dirX,
    dirY,
  )
  const shape = makeBoxShape(ctx.api, ctx.modelID, ctx.refs.context, length, thickness, WALL_HEIGHT_METERS)

  const wallEntity = new IFC4.IfcWallStandardCase(
    newGuid(ctx.api, ctx.modelID),
    ctx.refs.ownerHistory,
    new IFC4.IfcLabel('Wall'),
    null,
    null,
    placement,
    shape,
    null,
    IFC4.IfcWallTypeEnum.STANDARD,
  )
  ctx.api.WriteLine(ctx.modelID, wallEntity)
  return new Handle<IFC4.IfcWallStandardCase>(wallEntity.expressID)
}
