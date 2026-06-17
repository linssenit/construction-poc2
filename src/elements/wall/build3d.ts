import * as THREE from 'three'
import { WALL_HEIGHT_METERS } from '@/lib/dimensions'
import type { Build3dCtx } from '@/elements/types'
import type { Wall } from './types'
import { WALL_WIDTH } from './types'

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee })

export function buildWallMesh(wall: Wall, ctx: Build3dCtx) {
  if (!wall.hasInfill) {
    return
  }

  const startX = wall.start.x / ctx.pixelsPerMeter
  const startZ = wall.start.y / ctx.pixelsPerMeter
  const endX = wall.end.x / ctx.pixelsPerMeter
  const endZ = wall.end.y / ctx.pixelsPerMeter
  const length = Math.hypot(endX - startX, endZ - startZ)

  if (length === 0) {
    return
  }

  const thickness = WALL_WIDTH / ctx.pixelsPerMeter
  const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT_METERS, thickness)
  const mesh = new THREE.Mesh(geometry, wallMaterial)

  mesh.position.set((startX + endX) / 2, WALL_HEIGHT_METERS / 2, (startZ + endZ) / 2)
  mesh.rotation.y = -Math.atan2(endZ - startZ, endX - startX)

  ctx.group.add(mesh)
}
