import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import type { Wall } from '@/App'

type ThreeDViewerProps = {
  walls: Wall[]
  pixelsPerMeter: number
  wallWidth: number
}

const WALL_HEIGHT_METERS = 2.7
const POLE_HEIGHT_METERS = 2.4
const POLE_SIZE_METERS = 0.17
const SOKKEL_HEIGHT_METERS = 0.15
const SOKKEL_SIZE_METERS = 0.17
const STRUCTURE_GROUP_NAME = 'structure'

export function ThreeDViewer({ walls, pixelsPerMeter, wallWidth }: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<{
    components: OBC.Components
    world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>
  } | null>(null)

  useEffect(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    const components = new OBC.Components()
    const worlds = components.get(OBC.Worlds)
    const world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>()

    world.scene = new OBC.SimpleScene(components)
    world.renderer = new OBC.SimpleRenderer(components, container)
    world.camera = new OBC.SimpleCamera(components)

    components.init()
    world.scene.setup()
    world.scene.three.background = new THREE.Color('#f3f2ef')

    const grid = new THREE.GridHelper(40, 40, 0xd2cec7, 0xe4e1dc)
    world.scene.three.add(grid)

    world.camera.controls.setLookAt(8, 8, 8, 0, 0, 0)

    worldRef.current = { components, world }

    return () => {
      components.dispose()
      worldRef.current = null
    }
  }, [])

  useEffect(() => {
    const entry = worldRef.current

    if (!entry) {
      return
    }

    const { world } = entry
    const scene = world.scene.three
    const previous = scene.getObjectByName(STRUCTURE_GROUP_NAME)

    if (previous) {
      scene.remove(previous)
      disposeGroup(previous)
    }

    const group = buildStructureGroup(walls, pixelsPerMeter, wallWidth)
    scene.add(group)
  }, [walls, pixelsPerMeter, wallWidth])

  return <div ref={containerRef} className="drawing-canvas" aria-label="3D construction view" />
}

function buildStructureGroup(walls: Wall[], pixelsPerMeter: number, wallWidth: number) {
  const group = new THREE.Group()
  group.name = STRUCTURE_GROUP_NAME

  const thickness = wallWidth / pixelsPerMeter
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xeeeeee })
  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x8b6f47, roughness: 0.7 })
  const sokkelMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4956, roughness: 0.5 })

  for (const wall of walls) {
    if (!wall.hasInfill) {
      continue
    }

    const startX = wall.start.x / pixelsPerMeter
    const startZ = wall.start.y / pixelsPerMeter
    const endX = wall.end.x / pixelsPerMeter
    const endZ = wall.end.y / pixelsPerMeter

    const length = Math.hypot(endX - startX, endZ - startZ)

    if (length === 0) {
      continue
    }

    const geometry = new THREE.BoxGeometry(length, WALL_HEIGHT_METERS, thickness)
    const mesh = new THREE.Mesh(geometry, wallMaterial)

    mesh.position.set((startX + endX) / 2, WALL_HEIGHT_METERS / 2, (startZ + endZ) / 2)
    mesh.rotation.y = -Math.atan2(endZ - startZ, endX - startX)

    group.add(mesh)
  }

  const sokkelGeometry = new THREE.BoxGeometry(SOKKEL_SIZE_METERS, SOKKEL_HEIGHT_METERS, SOKKEL_SIZE_METERS)
  const poleGeometry = new THREE.BoxGeometry(POLE_SIZE_METERS, POLE_HEIGHT_METERS, POLE_SIZE_METERS)

  for (const { x, z } of getUniqueEndpoints(walls, pixelsPerMeter)) {
    const sokkel = new THREE.Mesh(sokkelGeometry, sokkelMaterial)
    sokkel.position.set(x, SOKKEL_HEIGHT_METERS / 2, z)
    group.add(sokkel)

    const pole = new THREE.Mesh(poleGeometry, poleMaterial)
    pole.position.set(x, SOKKEL_HEIGHT_METERS + POLE_HEIGHT_METERS / 2, z)
    group.add(pole)
  }

  return group
}

function getUniqueEndpoints(walls: Wall[], pixelsPerMeter: number) {
  const seen = new Map<string, { x: number; z: number }>()

  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const x = point.x / pixelsPerMeter
      const z = point.y / pixelsPerMeter
      const key = `${Math.round(x * 1000)}_${Math.round(z * 1000)}`

      if (!seen.has(key)) {
        seen.set(key, { x, z })
      }
    }
  }

  return seen.values()
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
    }
  })
}
