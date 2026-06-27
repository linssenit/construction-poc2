import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import * as OBC from '@thatopen/components'
import workerUrl from '@thatopen/fragments/worker?url'
import { generateIfc } from '@/lib/ifcExport'
import { POLE_COLOR } from '@/lib/dimensions'
import oakTextureUrl from '@/assets/oak_veneer_01_diff_4k.jpg'
import type { ElementCollection } from '@/elements/types'

type ThreeDViewerProps = {
  elements: ElementCollection
}

const MODEL_NAME = 'boomkamer-structure'

// Wood beams (poles + edge beams) are written with this flat colour by the IFC
// exporter. We match on it to re-skin only those materials with the oak texture.
const WOOD_COLOR = POLE_COLOR
const WOOD_COLOR_TOLERANCE = 0.03

/**
 * True when a fragments material is one of our wood beams. Fragments builds its
 * material colour straight from the IFC `IfcColourRgb`, but we can't be certain
 * whether it keeps the raw 0..1 values or linearises them, so we accept a match
 * against either interpretation.
 */
function isWoodMaterial(material: THREE.Material): material is THREE.MeshLambertMaterial {
  if (!(material instanceof THREE.MeshLambertMaterial)) {
    return false
  }

  const [r, g, b] = WOOD_COLOR
  const raw = new THREE.Color(r, g, b)
  const linear = new THREE.Color(r, g, b).convertSRGBToLinear()
  const { color } = material

  const close = (target: THREE.Color) =>
    Math.abs(color.r - target.r) < WOOD_COLOR_TOLERANCE &&
    Math.abs(color.g - target.g) < WOOD_COLOR_TOLERANCE &&
    Math.abs(color.b - target.b) < WOOD_COLOR_TOLERANCE

  return close(raw) || close(linear)
}

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

    // Oak veneer applied to every wood beam. The diffuse map is an sRGB colour
    // texture; UVs are projected in metres (see the tiles handler below), so the
    // repeat sets how many metres one tile spans (here ~1.25m per tile).
    const oakTexture = new THREE.TextureLoader().load(oakTextureUrl)
    oakTexture.colorSpace = THREE.SRGBColorSpace
    oakTexture.wrapS = THREE.RepeatWrapping
    oakTexture.wrapT = THREE.RepeatWrapping
    oakTexture.repeat.set(0.8, 0.8)

    // Fragments renders with flat MeshLambertMaterials whose colour comes from
    // the IFC surface style. As each material is registered, swap the wood ones
    // for a textured MeshStandardMaterial carrying the oak map. The replacement
    // is a StandardMaterial so `isWoodMaterial` skips it on the re-entrant
    // `set`, avoiding an infinite loop.
    fragments.core.models.materials.list.onItemSet.add(({ key, value }) => {
      if (!isWoodMaterial(value)) {
        return
      }

      const textured = new THREE.MeshStandardMaterial({
        map: oakTexture,
        roughness: 0.8,
        metalness: 0,
        side: value.side,
      }) as unknown as THREE.MeshLambertMaterial
      fragments.core.models.materials.list.set(key, textured)
      void fragments.core.update(true)
    })

    // Fragments geometry ships without UVs, so a `map` alone collapses to a
    // single texel. Project cubic UVs (in metres) onto each tile mesh as it is
    // created — the dominant face normal picks which two axes drive U/V. Applied
    // to every tile; only the wood material samples the oak map.
    fragments.core.models.list.onItemSet.add(({ value: model }) => {
      model.tiles.onItemSet.add(({ value: mesh }) => {
        const geometry = mesh.geometry
        if ('isLODGeometry' in geometry || !geometry.index) {
          return
        }

        const indexArray = geometry.index.array
        const positions = geometry.attributes.position.array
        const normals = geometry.attributes.normal.array
        const uvArray = new Float32Array((positions.length / 3) * 2)

        for (let i = 0; i < indexArray.length; i += 1) {
          const index = indexArray[i]
          const x = positions[index * 3]
          const y = positions[index * 3 + 1]
          const z = positions[index * 3 + 2]

          const absNx = Math.abs(normals[index * 3])
          const absNy = Math.abs(normals[index * 3 + 1])
          const absNz = Math.abs(normals[index * 3 + 2])

          if (absNx > absNy && absNx > absNz) {
            uvArray[index * 2] = y
            uvArray[index * 2 + 1] = z
          } else if (absNy > absNx && absNy > absNz) {
            uvArray[index * 2] = x
            uvArray[index * 2 + 1] = z
          } else {
            uvArray[index * 2] = x
            uvArray[index * 2 + 1] = y
          }
        }

        geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2))
      })
    })

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
      oakTexture.dispose()
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
      if (cancelled) {
        return
      }

      await viewer.ifcLoader.load(bytes, true, MODEL_NAME)
      if (cancelled) {
        return
      }

      // The grid is an infinite shader plane fixed at world Y=0; it can't be
      // moved. Instead, drop the model so its base rests on that plane, leaving
      // the grid at the bottom of the model rather than slicing through it.
      const model = viewer.fragments.list.get(MODEL_NAME)
      if (model && Number.isFinite(model.box.min.y)) {
        model.object.position.y -= model.box.min.y
        model.object.updateMatrixWorld(true)
        await viewer.fragments.core.update(true)
      }
    }

    void sync()

    return () => {
      cancelled = true
    }
  }, [elements])

  return <div ref={containerRef} className="drawing-canvas" aria-label="3D construction view" />
}
