import { Handle, IFC4 } from 'web-ifc'
import {
  EDGE_BEAM_COLOR,
  EDGE_BEAM_HEIGHT_METERS,
  EDGE_BEAM_WIDTH_METERS,
  PIXELS_PER_METER,
  POLE_SIZE_PIXELS,
  POLE_TOP_METERS,
} from '@/lib/dimensions'
import type { Point } from '@/lib/geometry'
import { makeBoxShape, makeLocalPlacement, newGuid } from '@/lib/ifc/writer'
import type { ElementExtras, IfcCtx, IfcProductHandle } from '@/elements/types'
import type { Wall } from '../types'

// Endpoints this close are treated as the same node (same pole). Matches the
// pole-merge tolerance so a beam always connects two poles, not phantom points.
const NODE_MERGE_TOLERANCE_PIXELS = POLE_SIZE_PIXELS

/**
 * Edge beams ("Randbalk"). When the walls form one or more closed structures
 * (a ring of at least 3 connected walls — wall A's end meets wall B's start,
 * and so on back to A), an edge beam is laid along every wall that is part of
 * such a ring. Each beam rests on top of the poles at its two endpoints.
 *
 * Nothing is drawn in the 2D view — beams only appear in the IFC / 3D output.
 */
export const wallEdgeBeamsExtras: ElementExtras<Wall> = {
  writeIfc(walls, ctx) {
    return findLoopSegments(walls).map((segment) => writeEdgeBeam(ctx, segment.a, segment.b))
  },
}

interface Segment {
  a: Point
  b: Point
}

/**
 * Returns one segment (node-to-node) for every wall that belongs to a closed
 * loop. Endpoints are merged into shared nodes; a wall is part of a loop when
 * it is not a bridge in the resulting graph (i.e. removing it keeps its two
 * endpoints connected). A simple cycle needs ≥ 3 edges, so the "at least 3
 * walls" requirement falls out naturally.
 */
function findLoopSegments(walls: Wall[]): Segment[] {
  const nodes: Point[] = []

  const nodeIndex = (point: Point): number => {
    for (let i = 0; i < nodes.length; i += 1) {
      if (Math.hypot(nodes[i].x - point.x, nodes[i].y - point.y) <= NODE_MERGE_TOLERANCE_PIXELS) {
        return i
      }
    }
    nodes.push({ x: point.x, y: point.y })
    return nodes.length - 1
  }

  // Build edges, dropping zero-length walls (both endpoints share a node).
  const edges = walls
    .map((wall) => ({ a: nodeIndex(wall.start), b: nodeIndex(wall.end) }))
    .filter((edge) => edge.a !== edge.b)

  const adjacency: Array<Array<{ to: number; edge: number }>> = nodes.map(() => [])
  edges.forEach((edge, index) => {
    adjacency[edge.a].push({ to: edge.b, edge: index })
    adjacency[edge.b].push({ to: edge.a, edge: index })
  })

  const bridges = findBridges(nodes.length, adjacency)

  return edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ index }) => !bridges.has(index))
    .map(({ edge }) => ({ a: nodes[edge.a], b: nodes[edge.b] }))
}

/** Tarjan bridge finding. Bridge edges are the ones NOT part of any cycle. */
function findBridges(
  nodeCount: number,
  adjacency: Array<Array<{ to: number; edge: number }>>,
): Set<number> {
  const discovery = new Array<number>(nodeCount).fill(-1)
  const low = new Array<number>(nodeCount).fill(0)
  const bridges = new Set<number>()
  let timer = 0

  const dfs = (node: number, parentEdge: number) => {
    discovery[node] = low[node] = timer
    timer += 1

    for (const { to, edge } of adjacency[node]) {
      if (edge === parentEdge) {
        continue
      }
      if (discovery[to] === -1) {
        dfs(to, edge)
        low[node] = Math.min(low[node], low[to])
        if (low[to] > discovery[node]) {
          bridges.add(edge)
        }
      } else {
        low[node] = Math.min(low[node], discovery[to])
      }
    }
  }

  for (let node = 0; node < nodeCount; node += 1) {
    if (discovery[node] === -1) {
      dfs(node, -1)
    }
  }

  return bridges
}

function writeEdgeBeam(ctx: IfcCtx, a: Point, b: Point): IfcProductHandle {
  const ax = a.x / PIXELS_PER_METER
  const ay = a.y / PIXELS_PER_METER
  const bx = b.x / PIXELS_PER_METER
  const by = b.y / PIXELS_PER_METER

  const dx = bx - ax
  const dy = by - ay
  const length = Math.hypot(dx, dy)

  const cx = (ax + bx) / 2
  const cy = (ay + by) / 2
  const dirX = dx / length
  const dirY = dy / length

  // Box extrudes upward from its placement, so place it on the pole tops.
  const placement = makeLocalPlacement(
    ctx.api,
    ctx.modelID,
    ctx.refs.storeyPlacement,
    cx,
    cy,
    POLE_TOP_METERS,
    dirX,
    dirY,
  )
  const shape = makeBoxShape(
    ctx.api,
    ctx.modelID,
    ctx.refs.context,
    length,
    EDGE_BEAM_WIDTH_METERS,
    EDGE_BEAM_HEIGHT_METERS,
    EDGE_BEAM_COLOR,
  )

  const entity = new IFC4.IfcBeam(
    newGuid(ctx.api, ctx.modelID),
    ctx.refs.ownerHistory,
    new IFC4.IfcLabel('Randbalk'),
    null,
    null,
    placement,
    shape,
    null,
    IFC4.IfcBeamTypeEnum.BEAM,
  )
  ctx.api.WriteLine(ctx.modelID, entity)
  return new Handle<IFC4.IfcBeam>(entity.expressID)
}
