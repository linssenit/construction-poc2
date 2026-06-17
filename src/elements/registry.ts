import { wallModule } from './wall'
import type {
  AnyElementModule,
  ElementCollection,
  ElementId,
  ElementType,
  HitTarget,
  SnapPoint,
  ToolDefinition,
} from './types'

export const ELEMENT_MODULES: Record<ElementType, AnyElementModule> = {
  [wallModule.type]: wallModule,
}

export const MODULE_ORDER: ElementType[] = [wallModule.type]

export function listModules(): AnyElementModule[] {
  return MODULE_ORDER.map((type) => ELEMENT_MODULES[type])
}

export function getModule(type: ElementType): AnyElementModule | undefined {
  return ELEMENT_MODULES[type]
}

export function listTools(): Array<{ tool: ToolDefinition; type: ElementType }> {
  const out: Array<{ tool: ToolDefinition; type: ElementType }> = []

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    if (mod.tool) {
      out.push({ tool: mod.tool, type })
    }
  }

  return out
}

export function seedElements(): ElementCollection {
  const collection: ElementCollection = {}

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    collection[type] = mod.createInitial ? [...mod.createInitial()] : []
  }

  return collection
}

export function nextElementId(collection: ElementCollection, type: ElementType): ElementId {
  const slice = collection[type] ?? []
  let max = 0
  for (const el of slice) {
    if (el.id > max) {
      max = el.id
    }
  }
  return max + 1
}

export function collectSnapPoints(
  collection: ElementCollection,
  exclude?: { type: ElementType; id: ElementId; handleId?: string },
): SnapPoint[] {
  const out: SnapPoint[] = []

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    const slice = collection[type] ?? []

    for (const el of slice) {
      for (const sp of mod.getSnapPoints(el)) {
        if (
          exclude &&
          sp.sourceType === exclude.type &&
          sp.sourceId === exclude.id &&
          (exclude.handleId === undefined || sp.handleId === exclude.handleId)
        ) {
          continue
        }
        out.push(sp)
      }
    }

    if (mod.extras?.getSnapPoints) {
      out.push(...mod.extras.getSnapPoints(slice))
    }
  }

  return out
}

export function findNearestSnap(
  point: { x: number; y: number },
  threshold: number,
  collection: ElementCollection,
  exclude?: { type: ElementType; id: ElementId; handleId?: string },
): SnapPoint | null {
  const snaps = collectSnapPoints(collection, exclude)
  let best: SnapPoint | null = null
  let bestDistance = threshold

  for (const sp of snaps) {
    const distance = Math.hypot(sp.point.x - point.x, sp.point.y - point.y)
    if (distance <= bestDistance) {
      best = sp
      bestDistance = distance
    }
  }

  return best
}

export function findFirstHit(
  collection: ElementCollection,
  worldPoint: { x: number; y: number },
  scale: number,
): { type: ElementType; target: HitTarget } | null {
  // Pass 1: handles win over bodies even on lower-priority elements.
  for (let i = MODULE_ORDER.length - 1; i >= 0; i -= 1) {
    const type = MODULE_ORDER[i]
    const mod = ELEMENT_MODULES[type]
    const slice = collection[type] ?? []
    for (let j = slice.length - 1; j >= 0; j -= 1) {
      const hit = mod.hitTest(slice[j], worldPoint, scale)
      if (hit?.kind === 'handle') {
        return { type, target: hit }
      }
    }
  }

  // Pass 2: element bodies.
  for (let i = MODULE_ORDER.length - 1; i >= 0; i -= 1) {
    const type = MODULE_ORDER[i]
    const mod = ELEMENT_MODULES[type]
    const slice = collection[type] ?? []
    for (let j = slice.length - 1; j >= 0; j -= 1) {
      const hit = mod.hitTest(slice[j], worldPoint, scale)
      if (hit?.kind === 'element') {
        return { type, target: hit }
      }
    }
  }

  return null
}
