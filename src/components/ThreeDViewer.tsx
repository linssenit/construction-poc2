import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import { ELEMENT_MODULES, MODULE_ORDER } from '@/elements/registry'
import type { ElementCollection } from '@/elements/types'

type ThreeDViewerProps = {
  elements: ElementCollection
  pixelsPerMeter: number
}

const STRUCTURE_GROUP_NAME = 'structure'

export function ThreeDViewer({ elements, pixelsPerMeter }: ThreeDViewerProps) {
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

    const group = buildStructureGroup(elements, pixelsPerMeter)
    scene.add(group)
  }, [elements, pixelsPerMeter])

  return <div ref={containerRef} className="drawing-canvas" aria-label="3D construction view" />
}

function buildStructureGroup(elements: ElementCollection, pixelsPerMeter: number) {
  const group = new THREE.Group()
  group.name = STRUCTURE_GROUP_NAME

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    const slice = elements[type] ?? []

    for (const el of slice) {
      mod.build3d(el, { group, pixelsPerMeter, allElements: elements })
    }

    if (mod.extras?.build3d) {
      mod.extras.build3d(slice, { group, pixelsPerMeter, allElements: elements })
    }
  }

  return group
}

function disposeGroup(group: THREE.Object3D) {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose()
    }
  })
}
