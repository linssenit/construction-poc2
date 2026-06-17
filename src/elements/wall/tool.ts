import type { ToolCtx } from '@/elements/types'
import type { Point } from '@/lib/geometry'
import { getDistance } from '@/lib/geometry'
import type { Wall, WallDraft } from './types'
import { WALL_TYPE } from './types'
import { snapAxis } from './snap'

export function beginWallDraft(ctx: ToolCtx, nextId: () => number): WallDraft {
  const start = ctx.snap?.point ?? ctx.worldPoint

  return {
    id: nextId(),
    start,
    end: start,
    hasInfill: true,
  }
}

export function updateWallDraft(draft: WallDraft, ctx: ToolCtx): WallDraft {
  const end = resolveWallEndpoint(draft.start, ctx)
  return { ...draft, end }
}

export function commitWallDraft(draft: WallDraft): Wall | null {
  if (getDistance(draft.start, draft.end) <= 8) {
    return null
  }

  return {
    id: draft.id,
    type: WALL_TYPE,
    start: draft.start,
    end: draft.end,
    hasInfill: true,
  }
}

export function resolveWallEndpoint(fixed: Point, ctx: ToolCtx): Point {
  if (ctx.snap) {
    return ctx.snap.point
  }

  return ctx.modifiers.shift ? snapAxis(fixed, ctx.worldPoint) : ctx.worldPoint
}
