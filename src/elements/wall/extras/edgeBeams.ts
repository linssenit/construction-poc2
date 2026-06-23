import { Handle, IFC4 } from 'web-ifc'
import {
  EDGE_BEAM_COLOR,
  EDGE_BEAM_HEIGHT_METERS,
  EDGE_BEAM_WIDTH_METERS,
  PIXELS_PER_METER,
  POLE_SIZE_METERS,
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

// A beam that "owns" a pole top is extended past the pole centre by half the
// pole footprint, so it spans the full top along its own axis.
const POLE_HALF_METERS = POLE_SIZE_METERS / 2
const BEAM_HALF_WIDTH_METERS = EDGE_BEAM_WIDTH_METERS / 2

/**
 * Edge beams ("Randbalk"). When the walls form one or more closed structures
 * (a ring of at least 3 connected walls — wall A's end meets wall B's start,
 * and so on back to A), an edge beam is laid along every wall that is part of
 * such a ring. Each beam rests on top of the poles at its two endpoints.
 *
 * At every pole the longest incident beam "owns" the pole top: it is extended
 * past the pole centre to fully cover the top. Any shorter beam meeting the
 * same pole is retracted until its end just touches the owner beam's side face,
 * so it does not sit over the pole top. A pole with a single beam is covered by
 * that beam.
 *
 * Nothing is drawn in the 2D view — beams only appear in the IFC / 3D output.
 */
export const wallEdgeBeamsExtras: ElementExtras<Wall> = {
  writeIfc(walls, ctx) {
    return buildEdgeBeams(walls).map((segment) => writeEdgeBeam(ctx, segment.a, segment.b))
  },
}

interface Segment {
  a: Point
  b: Point
}

interface LoopBeam {
  nodeA: number
  nodeB: number
}

/**
 * Lays out the loop beams and trims each endpoint so the longest beam at every
 * pole covers the top while shorter beams butt against it. Endpoints are
 * returned in metres, ready to extrude.
 */
function buildEdgeBeams(walls: Wall[]): Segment[] {
  const { nodes, beams } = findLoopGraph(walls)

  // Work in metres from here on.
  const points = nodes.map((node) => ({
    x: node.x / PIXELS_PER_METER,
    y: node.y / PIXELS_PER_METER,
  }))

  // Length and the unit direction from nodeA toward nodeB for each beam.
  const geom = beams.map((beam) => {
    const a = points[beam.nodeA]
    const b = points[beam.nodeB]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    return { length, ux: dx / length, uy: dy / length }
  })

  // Beams meeting at each pole.
  const incident: number[][] = points.map(() => [])
  beams.forEach((beam, index) => {
    incident[beam.nodeA].push(index)
    incident[beam.nodeB].push(index)
  })

  // Unit direction of beam `index` at `node`, pointing inward (toward the body).
  const inwardDir = (index: number, node: number): Point => {
    const { ux, uy } = geom[index]
    return beams[index].nodeA === node ? { x: ux, y: uy } : { x: -ux, y: -uy }
  }

  // The beam that covers the pole at `node`: the longest, ties broken by order.
  const ownerAtNode = (node: number): number => {
    let owner = incident[node][0]
    for (const index of incident[node]) {
      if (geom[index].length > geom[owner].length) {
        owner = index
      }
    }
    return owner
  }

  const endpointFor = (index: number, node: number): Point => {
    const p = points[node]
    const dir = inwardDir(index, node)

    if (incident[node].length === 1 || index === ownerAtNode(node)) {
      // Owner: extend outward (away from the body) to cover the whole pole top.
      return { x: p.x - dir.x * POLE_HALF_METERS, y: p.y - dir.y * POLE_HALF_METERS }
    }

    // Shorter beam: retract inward until its end touches the owner's side face.
    const ownerDir = inwardDir(ownerAtNode(node), node)
    const sin = Math.abs(dir.x * ownerDir.y - dir.y * ownerDir.x)
    const retract = sin < 1e-6 ? POLE_HALF_METERS : BEAM_HALF_WIDTH_METERS / sin
    const capped = Math.min(retract, geom[index].length - 0.01)
    return { x: p.x + dir.x * capped, y: p.y + dir.y * capped }
  }

  return beams.map((beam, index) => ({
    a: endpointFor(index, beam.nodeA),
    b: endpointFor(index, beam.nodeB),
  }))
}

/**
 * Returns the merged pole nodes and one beam (node pair) for every wall that
 * belongs to a closed loop. Endpoints are merged into shared nodes; a wall is
 * part of a loop when it is not a bridge in the resulting graph (i.e. removing
 * it keeps its two endpoints connected). A simple cycle needs ≥ 3 edges, so the
 * "at least 3 walls" requirement falls out naturally.
 */
function findLoopGraph(walls: Wall[]): { nodes: Point[]; beams: LoopBeam[] } {
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

  const beams = edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ index }) => !bridges.has(index))
    .map(({ edge }) => ({ nodeA: edge.a, nodeB: edge.b }))

  return { nodes, beams }
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
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)

  const cx = (a.x + b.x) / 2
  const cy = (a.y + b.y) / 2
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
