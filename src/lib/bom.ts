import {
  EDGE_BEAM_HEIGHT_METERS,
  EDGE_BEAM_WIDTH_METERS,
  POLE_HEIGHT_METERS,
  POLE_SIZE_METERS,
  SOKKEL_HEIGHT_METERS,
  SOKKEL_SIZE_METERS,
} from '@/lib/dimensions'
import { EDGE_BEAM_MATERIAL, buildEdgeBeams } from '@/elements/wall/extras/edgeBeams'
import { POLE_MATERIAL, SOKKEL_MATERIAL, getPoleNodes } from '@/elements/wall/extras/poles'
import { WALL_TYPE } from '@/elements/wall/types'
import type { Wall } from '@/elements/wall/types'
import type { ElementCollection } from '@/elements/types'

/** One row in the bill of materials. Lengths are in metres. */
export interface BomLine {
  key: string
  label: string
  /** Material the piece is made of, e.g. "Douglas". */
  material: string
  /** Cross-section (wood) or footprint (sokkel), e.g. "170 × 170 mm". */
  section: string
  /** Number of pieces. */
  count: number
  /** Length per piece — only set when every piece has the same length. */
  unitLengthM?: number
  /** Total linear metres for this row. */
  totalLengthM: number
}

export interface Bom {
  wood: BomLine[]
  sokkels: BomLine[]
  totalWoodMeters: number
}

const mm = (meters: number) => Math.round(meters * 1000)

/**
 * Computes the bill of materials directly from the drawn elements, reusing the
 * exact geometry the IFC writers use (pole nodes + edge-beam segments) so the
 * quantities always match the 3D model.
 */
export function computeBom(elements: ElementCollection): Bom {
  const walls = (elements[WALL_TYPE] ?? []) as Wall[]

  const nodes = getPoleNodes(walls)
  const beams = buildEdgeBeams(walls)

  const wood: BomLine[] = []

  // Poles ("Palen") — one per shared node, all the same height.
  if (nodes.length > 0) {
    wood.push({
      key: 'pole',
      label: 'Paal',
      material: POLE_MATERIAL,
      section: `${mm(POLE_SIZE_METERS)} × ${mm(POLE_SIZE_METERS)} mm`,
      count: nodes.length,
      unitLengthM: POLE_HEIGHT_METERS,
      totalLengthM: nodes.length * POLE_HEIGHT_METERS,
    })
  }

  // Edge beams ("Randbalk") — variable lengths, summed into one row.
  if (beams.length > 0) {
    const totalLengthM = beams.reduce(
      (sum, seg) => sum + Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y),
      0,
    )
    wood.push({
      key: 'randbalk',
      label: 'Randbalk',
      material: EDGE_BEAM_MATERIAL,
      section: `${mm(EDGE_BEAM_WIDTH_METERS)} × ${mm(EDGE_BEAM_HEIGHT_METERS)} mm`,
      count: beams.length,
      totalLengthM,
    })
  }

  const sokkels: BomLine[] = []
  if (nodes.length > 0) {
    sokkels.push({
      key: 'sokkel',
      label: 'Sokkel',
      material: SOKKEL_MATERIAL,
      section: `${mm(SOKKEL_SIZE_METERS)} × ${mm(SOKKEL_SIZE_METERS)} × ${mm(SOKKEL_HEIGHT_METERS)} mm`,
      count: nodes.length,
      totalLengthM: nodes.length * SOKKEL_HEIGHT_METERS,
    })
  }

  const totalWoodMeters = wood.reduce((sum, line) => sum + line.totalLengthM, 0)

  return { wood, sokkels, totalWoodMeters }
}