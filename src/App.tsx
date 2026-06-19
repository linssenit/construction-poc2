import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import { ThreeDViewer } from '@/components/ThreeDViewer'
import { Toolbar } from '@/components/Toolbar'
import { PropertiesPanel } from '@/components/PropertiesPanel'
import { downloadIfc } from '@/lib/ifcExport'
import { drawGrid, drawSnapIndicator } from '@/lib/canvas'
import type { Point, Viewport } from '@/lib/geometry'
import { clamp, screenToWorldPoint } from '@/lib/geometry'
import {
  ELEMENT_MODULES,
  MODULE_ORDER,
  findFirstHit,
  findNearestSnap,
  nextElementId,
  seedElements,
} from '@/elements/registry'
import type {
  BaseElement,
  ElementCollection,
  ElementType,
  Interaction,
  SelectionRef,
  SnapPoint,
} from '@/elements/types'
import './App.css'

type Unit = 'mm' | 'cm' | 'm'
type ViewMode = '2d' | '3d'

const MIN_ZOOM = 0.45
const MAX_ZOOM = 2.4
const SNAP_PIXELS = 20

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLElement | null>(null)
  const interactionRef = useRef<Interaction>({ kind: 'none' })

  const [elements, setElements] = useState<ElementCollection>(() => seedElements())
  const [draft, setDraft] = useState<{ type: ElementType; data: unknown } | null>(null)
  const [selected, setSelected] = useState<SelectionRef | null>(null)
  const [activeToolId, setActiveToolId] = useState<string | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 90, y: 40, scale: 1 })
  const [viewMode, setViewMode] = useState<ViewMode>('2d')
  const [unit, setUnit] = useState<Unit>('cm')
  const [snapTarget, setSnapTarget] = useState<SnapPoint | null>(null)

  const zoomPercentage = Math.round(viewport.scale * 100)
  const activeToolType = useMemo(() => {
    if (!activeToolId) return null
    for (const type of MODULE_ORDER) {
      if (ELEMENT_MODULES[type].tool?.id === activeToolId) {
        return type
      }
    }
    return null
  }, [activeToolId])

  const updateElement = (type: ElementType, id: number, updater: (el: BaseElement) => BaseElement) => {
    setElements((current) => ({
      ...current,
      [type]: (current[type] ?? []).map((el) => (el.id === id ? updater(el) : el)),
    }))
  }

  const handlePropertiesChange = (next: BaseElement) => {
    setElements((current) => ({
      ...current,
      [next.type]: (current[next.type] ?? []).map((el) => (el.id === next.id ? next : el)),
    }))
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const canvasWrap = canvasWrapRef.current

    if (!canvas || !canvasWrap) {
      return
    }

    const draw = () => {
      const rect = canvasWrap.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1

      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`

      const context = canvas.getContext('2d')

      if (!context) {
        return
      }

      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      renderScene(context, rect.width, rect.height, {
        viewport,
        elements,
        draft,
        selected,
        snapTarget,
      })
    }

    draw()

    const resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(canvasWrap)

    return () => resizeObserver.disconnect()
  }, [elements, draft, selected, snapTarget, viewport, viewMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      if (!selected) {
        return
      }

      setElements((current) => ({
        ...current,
        [selected.type]: (current[selected.type] ?? []).filter((el) => el.id !== selected.id),
      }))
      setSelected(null)
      setDraft(null)
      interactionRef.current = { kind: 'none' }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selected])

  const zoomAround = (nextScale: number, screenX?: number, screenY?: number) => {
    const canvasWrap = canvasWrapRef.current

    setViewport((current) => {
      const scale = clamp(nextScale, MIN_ZOOM, MAX_ZOOM)

      if (!canvasWrap || scale === current.scale) {
        return { ...current, scale }
      }

      const rect = canvasWrap.getBoundingClientRect()
      const localX = screenX ?? rect.width / 2
      const localY = screenY ?? rect.height / 2
      const world = screenToWorldPoint(localX, localY, rect, current)

      return {
        x: localX - rect.width / 2 - world.x * scale,
        y: localY - rect.height / 2 - world.y * scale,
        scale,
      }
    })
  }

  const getWorldPoint = (event: PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvasWrap = canvasWrapRef.current
    if (!canvasWrap) return null

    const rect = canvasWrap.getBoundingClientRect()
    return screenToWorldPoint(event.clientX - rect.left, event.clientY - rect.top, rect, viewport)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()

      const canvasWrap = canvasWrapRef.current
      if (!canvasWrap) return

      const rect = canvasWrap.getBoundingClientRect()
      const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1

      setViewport((current) => {
        const scale = clamp(current.scale * zoomFactor, MIN_ZOOM, MAX_ZOOM)

        if (scale === current.scale) {
          return current
        }

        const localX = event.clientX - rect.left
        const localY = event.clientY - rect.top
        const world = screenToWorldPoint(localX, localY, rect, current)

        return {
          x: localX - rect.width / 2 - world.x * scale,
          y: localY - rect.height / 2 - world.y * scale,
          scale,
        }
      })
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [viewMode])

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const worldPoint = getWorldPoint(event)
    if (!worldPoint) return

    event.currentTarget.setPointerCapture(event.pointerId)

    const hit = findFirstHit(elements, worldPoint, viewport.scale)

    if (hit?.target.kind === 'handle') {
      setSelected({ type: hit.type, id: hit.target.elementId })
      interactionRef.current = {
        kind: 'move-handle',
        pointerId: event.pointerId,
        ref: { type: hit.type, id: hit.target.elementId },
        handleId: hit.target.handleId!,
      }
      return
    }

    if (hit?.target.kind === 'element') {
      setSelected({ type: hit.type, id: hit.target.elementId })
      interactionRef.current = {
        kind: 'move-element',
        pointerId: event.pointerId,
        ref: { type: hit.type, id: hit.target.elementId },
        last: worldPoint,
      }
      return
    }

    setSelected(null)

    if (activeToolType) {
      const mod = ELEMENT_MODULES[activeToolType]
      if (!mod.beginDraft) return

      const threshold = SNAP_PIXELS / viewport.scale
      const snap = findNearestSnap(worldPoint, threshold, elements)
      const draftData = mod.beginDraft(
        {
          worldPoint,
          snap,
          modifiers: { shift: event.shiftKey },
          allElements: elements,
        },
        () => nextElementId(elements, activeToolType),
      )

      setDraft({ type: activeToolType, data: draftData })
      interactionRef.current = {
        kind: 'draft',
        pointerId: event.pointerId,
        elementType: activeToolType,
      }
      return
    }

    interactionRef.current = {
      kind: 'pan',
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current
    if (interaction.kind === 'none' || interaction.pointerId !== event.pointerId) {
      return
    }

    if (interaction.kind === 'pan') {
      const deltaX = event.clientX - interaction.x
      const deltaY = event.clientY - interaction.y

      interactionRef.current = { ...interaction, x: event.clientX, y: event.clientY }
      setViewport((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }))
      return
    }

    const worldPoint = getWorldPoint(event)
    if (!worldPoint) return

    if (interaction.kind === 'draft') {
      const mod = ELEMENT_MODULES[interaction.elementType]
      if (!mod.updateDraft || !draft) return

      const threshold = SNAP_PIXELS / viewport.scale
      const snap = findNearestSnap(worldPoint, threshold, elements)

      setSnapTarget(snap)
      const next = mod.updateDraft(draft.data, {
        worldPoint,
        snap,
        modifiers: { shift: event.shiftKey },
        allElements: elements,
      })
      setDraft({ type: interaction.elementType, data: next })
      return
    }

    if (interaction.kind === 'move-element') {
      const delta = {
        x: worldPoint.x - interaction.last.x,
        y: worldPoint.y - interaction.last.y,
      }

      interactionRef.current = { ...interaction, last: worldPoint }
      const mod = ELEMENT_MODULES[interaction.ref.type]
      updateElement(interaction.ref.type, interaction.ref.id, (el) => mod.moveBy(el, delta))
      return
    }

    if (interaction.kind === 'move-handle') {
      const mod = ELEMENT_MODULES[interaction.ref.type]
      if (!mod.moveHandle) return

      const threshold = SNAP_PIXELS / viewport.scale
      const snap = findNearestSnap(worldPoint, threshold, elements, {
        type: interaction.ref.type,
        id: interaction.ref.id,
      })

      setSnapTarget(snap)
      updateElement(interaction.ref.type, interaction.ref.id, (el) =>
        mod.moveHandle!(el, interaction.handleId, {
          worldPoint,
          snap,
          modifiers: { shift: event.shiftKey },
          allElements: elements,
        }),
      )
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current

    if (interaction.kind === 'draft' && interaction.pointerId === event.pointerId && draft) {
      const mod = ELEMENT_MODULES[interaction.elementType]
      const finalized = mod.commitDraft ? mod.commitDraft(draft.data) : null

      if (finalized) {
        setElements((current) => ({
          ...current,
          [interaction.elementType]: [...(current[interaction.elementType] ?? []), finalized],
        }))
        setSelected({ type: interaction.elementType, id: finalized.id })
      }

      setDraft(null)
    }

    if (interaction.kind !== 'none' && interaction.pointerId === event.pointerId) {
      interactionRef.current = { kind: 'none' }
      setSnapTarget(null)
    }
  }

  return (
    <main className="construction-viewer" aria-label="Construction Viewer">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark bg-primary text-primary-foreground border-none text-sm" aria-hidden="true">
            CV
          </span>
          <span className="tracking-tight">kommerce</span>
        </div>
        <div className="project-title">
          <span>Project</span>
          <strong>Example House</strong>
        </div>
        <div className="header-actions">
          <Button size="sm" className="h-9 px-4 gap-2" onClick={() => { void downloadIfc(elements) }}>
            <ExportIcon />
            <span>Export</span>
          </Button>
        </div>
      </header>

      <section className="drawing-space" aria-label="Drawing space" ref={canvasWrapRef}>
        {viewMode === '2d' ? (
          <canvas
            ref={canvasRef}
            className={`drawing-canvas ${activeToolType ? 'drawing-canvas--draw' : ''}`}
            aria-label="Construction drawing canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        ) : (
          <ThreeDViewer elements={elements} />
        )}
      </section>

      <Toolbar activeToolId={activeToolId} onSelectTool={setActiveToolId} />

      <div className="floating-panel zoom-controls" aria-label="Zoom controls">
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          aria-label="Zoom in"
          onClick={() => zoomAround(viewport.scale * 1.12)}
        >
          +
        </Button>
        <span className="text-[10px] font-bold text-muted-foreground">{zoomPercentage}%</span>
        <Button
          variant="secondary"
          size="icon"
          className="h-8 w-8"
          aria-label="Zoom out"
          onClick={() => zoomAround(viewport.scale / 1.12)}
        >
          -
        </Button>
      </div>

      <div className="floating-panel view-switch" aria-label="View mode">
        {(['2d', '3d'] as const).map((mode) => (
          <Button
            key={mode}
            variant={viewMode === mode ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-10"
            onClick={() => setViewMode(mode)}
          >
            {mode.toUpperCase()}
          </Button>
        ))}
      </div>

      {viewMode === '2d' && (
        <PropertiesPanel selection={selected} elements={elements} onChange={handlePropertiesChange} />
      )}

      <div className="floating-panel unit-switch p-1 gap-1" aria-label="Size unit">
        {(['mm', 'cm', 'm'] as const).map((sizeUnit) => (
          <Button
            key={sizeUnit}
            variant={unit === sizeUnit ? 'default' : 'ghost'}
            size="sm"
            className="h-8 px-3"
            onClick={() => setUnit(sizeUnit)}
          >
            {sizeUnit}
          </Button>
        ))}
      </div>
    </main>
  )
}

function renderScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    viewport: Viewport
    elements: ElementCollection
    draft: { type: ElementType; data: unknown } | null
    selected: SelectionRef | null
    snapTarget: SnapPoint | null
  },
) {
  const { viewport, elements, draft, selected, snapTarget } = options
  const originX = width / 2 + viewport.x
  const originY = height / 2 + viewport.y

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#f3f2ef'
  context.fillRect(0, 0, width, height)

  drawGrid(context, width, height, originX, originY, viewport.scale)

  context.save()
  context.translate(originX, originY)
  context.scale(viewport.scale, viewport.scale)

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    const slice = elements[type] ?? []

    for (const el of slice) {
      mod.draw2d(el, {
        ctx: context,
        scale: viewport.scale,
        selected: selected?.type === type && selected.id === el.id,
        isDraft: false,
        allElements: elements,
      })
    }

    if (mod.extras?.draw2d) {
      mod.extras.draw2d(slice, {
        ctx: context,
        scale: viewport.scale,
        allElements: elements,
      })
    }
  }

  if (draft) {
    const mod = ELEMENT_MODULES[draft.type]
    mod.drawDraft?.(draft.data, {
      ctx: context,
      scale: viewport.scale,
      selected: false,
      isDraft: true,
      allElements: elements,
    })
  }

  if (snapTarget) {
    drawSnapIndicator(context, snapTarget.point, viewport.scale)
  }

  context.restore()
}

function ExportIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="presentation"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default App
