import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import workerUrl from '@thatopen/fragments/worker?url'
import { generateIfc } from '@/lib/ifcExport'
import type { ElementCollection } from '@/elements/types'

type ThreeDViewerProps = {
  elements: ElementCollection
}

const MODEL_NAME = 'kommerce-structure'

type ViewerHandle = {
  components: OBC.Components
  world: OBC.SimpleWorld<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer>
  fragments: OBC.FragmentsManager
  ifcLoader: OBC.IfcLoader
  ready: Promise<void>
}

export function ThreeDViewer({ elements }: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewerRef = useRef<ViewerHandle | null>(null)

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


    world.camera.controls.setLookAt(8, 8, 8, 0, 0, 0)

    const fragments = components.get(OBC.FragmentsManager)
    fragments.init(workerUrl)
    // Fragments render lazily; refresh whenever the camera settles or a model loads.
    world.camera.controls.addEventListener('rest', () => void fragments.core.update(true))

    fragments.list.onItemSet.add(({ value: model }) => {
      model.useCamera(world.camera.three)
      world.scene.three.add(model.object)
      void fragments.core.update(true)
    })

    const grids = components.get(OBC.Grids);
    grids.create(world);


    const ifcLoader = components.get(OBC.IfcLoader)
    ifcLoader.settings.wasm = { path: '/', absolute: true }
    const ready = ifcLoader.setup({ autoSetWasm: false })

    viewerRef.current = { components, world, fragments, ifcLoader, ready }

    return () => {
      components.dispose()
      viewerRef.current = null
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current

    if (!viewer) {
      return
    }

    let cancelled = false

    const sync = async () => {
      await viewer.ready

      const bytes = await generateIfc(elements)
      if (cancelled) {
        return
      }

      if (viewer.fragments.list.has(MODEL_NAME)) {
        await viewer.fragments.core.disposeModel(MODEL_NAME)
      }
      if (!cancelled) {
        await viewer.ifcLoader.load(bytes, true, MODEL_NAME)
      }

    }

    void sync()

    return () => {
      cancelled = true
    }
  }, [elements])

  return <div ref={containerRef} className="drawing-canvas" aria-label="3D construction view" />
}
