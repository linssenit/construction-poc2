import { useEffect, useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { Button } from "@/components/ui/button"
import { ThreeDViewer } from "@/components/ThreeDViewer"
import './App.css'

type Unit = 'mm' | 'cm' | 'm'
type ViewMode = '2d' | '3d'
type Tool = 'wall' | null

type Point = {
  x: number
  y: number
}

export type Wall = {
  id: number
  start: Point
  end: Point
  hasInfill: boolean
}

type Viewport = {
  x: number
  y: number
  scale: number
}

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; pointerId: number; x: number; y: number }
  | { kind: 'draw-wall'; pointerId: number; start: Point; end: Point }
  | { kind: 'move-wall'; pointerId: number; wallId: number; last: Point }
  | { kind: 'move-endpoint'; pointerId: number; wallId: number; endpoint: 'start' | 'end' }

type HitTarget =
  | { kind: 'endpoint'; wallId: number; endpoint: 'start' | 'end' }
  | { kind: 'wall'; wallId: number }
  | null

const MIN_ZOOM = 0.45
const MAX_ZOOM = 2.4
const WALL_WIDTH = 12
const PIXELS_PER_METER = 40
const POLE_SNAP_PIXELS = 20

const initialWalls: Wall[] = [
  { id: 1, start: { x: -260, y: -125 }, end: { x: 260, y: -125 }, hasInfill: true },
  { id: 2, start: { x: 260, y: -125 }, end: { x: 260, y: 125 }, hasInfill: true },
  { id: 3, start: { x: 260, y: 125 }, end: { x: -260, y: 125 }, hasInfill: true },
  { id: 4, start: { x: -260, y: 125 }, end: { x: -260, y: -125 }, hasInfill: true },
]

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const canvasWrapRef = useRef<HTMLElement | null>(null)
  const interactionRef = useRef<Interaction>({ kind: 'none' })
  const nextWallIdRef = useRef(5)
  const [activeTool, setActiveTool] = useState<Tool>(null)
  const [walls, setWalls] = useState<Wall[]>(initialWalls)
  const [draftWall, setDraftWall] = useState<Wall | null>(null)
  const [selectedWallId, setSelectedWallId] = useState<number | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ x: 90, y: 40, scale: 1 })
  const [viewMode, setViewMode] = useState<ViewMode>('2d')
  const [unit, setUnit] = useState<Unit>('cm')
  const [snapTarget, setSnapTarget] = useState<Point | null>(null)

  const zoomPercentage = Math.round(viewport.scale * 100)
  const selectedWall = selectedWallId === null ? null : walls.find((wall) => wall.id === selectedWallId) ?? null

  const toggleSelectedWallInfill = () => {
    if (selectedWallId === null) {
      return
    }

    setWalls((current) =>
      current.map((wall) =>
        wall.id === selectedWallId ? { ...wall, hasInfill: !wall.hasInfill } : wall,
      ),
    )
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
      drawCanvas(context, rect.width, rect.height, {
        viewport,
        walls,
        draftWall,
        selectedWallId,
        snapTarget,
      })
    }

    draw()

    const resizeObserver = new ResizeObserver(draw)
    resizeObserver.observe(canvasWrap)

    return () => resizeObserver.disconnect()
  }, [draftWall, selectedWallId, viewport, walls, viewMode, snapTarget])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return
      }

      setWalls((current) => {
        if (selectedWallId === null) {
          return current
        }

        return current.filter((wall) => wall.id !== selectedWallId)
      })
      setSelectedWallId(null)
      setDraftWall(null)
      interactionRef.current = { kind: 'none' }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedWallId])

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

    if (!canvasWrap) {
      return null
    }

    const rect = canvasWrap.getBoundingClientRect()

    return screenToWorldPoint(event.clientX - rect.left, event.clientY - rect.top, rect, viewport)
  }

  useEffect(() => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()

      const canvasWrap = canvasWrapRef.current

      if (!canvasWrap) {
        return
      }

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

    if (!worldPoint) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)

    const hitTarget = getHitTarget(worldPoint, walls, viewport.scale)

    if (hitTarget?.kind === 'endpoint') {
      setSelectedWallId(hitTarget.wallId)
      interactionRef.current = {
        kind: 'move-endpoint',
        pointerId: event.pointerId,
        wallId: hitTarget.wallId,
        endpoint: hitTarget.endpoint,
      }
      return
    }

    if (hitTarget?.kind === 'wall') {
      setSelectedWallId(hitTarget.wallId)
      interactionRef.current = {
        kind: 'move-wall',
        pointerId: event.pointerId,
        wallId: hitTarget.wallId,
        last: worldPoint,
      }
      return
    }

    setSelectedWallId(null)

    if (activeTool === 'wall') {
      const threshold = POLE_SNAP_PIXELS / viewport.scale
      const start = findNearestPole(worldPoint, walls, undefined, threshold) ?? worldPoint
      const wall: Wall = {
        id: nextWallIdRef.current,
        start,
        end: start,
        hasInfill: true,
      }

      setDraftWall(wall)
      interactionRef.current = {
        kind: 'draw-wall',
        pointerId: event.pointerId,
        start,
        end: start,
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

      interactionRef.current = {
        ...interaction,
        x: event.clientX,
        y: event.clientY,
      }
      setViewport((current) => ({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY,
      }))
      return
    }

    const worldPoint = getWorldPoint(event)

    if (!worldPoint) {
      return
    }

    if (interaction.kind === 'draw-wall') {
      const threshold = POLE_SNAP_PIXELS / viewport.scale
      const snappedPole = findNearestPole(worldPoint, walls, undefined, threshold)
      const end = snappedPole ?? snapWallPoint(interaction.start, worldPoint, event.shiftKey)

      setSnapTarget(snappedPole)
      interactionRef.current = { ...interaction, end }
      setDraftWall({
        id: nextWallIdRef.current,
        start: interaction.start,
        end,
        hasInfill: true,
      })
      return
    }

    if (interaction.kind === 'move-wall') {
      const delta = {
        x: worldPoint.x - interaction.last.x,
        y: worldPoint.y - interaction.last.y,
      }

      interactionRef.current = { ...interaction, last: worldPoint }
      setWalls((current) =>
        current.map((wall) =>
          wall.id === interaction.wallId
            ? {
                ...wall,
                start: addPoints(wall.start, delta),
                end: addPoints(wall.end, delta),
              }
            : wall,
        ),
      )
      return
    }

    if (interaction.kind === 'move-endpoint') {
      const threshold = POLE_SNAP_PIXELS / viewport.scale
      const snappedPole = findNearestPole(worldPoint, walls, interaction.wallId, threshold)

      setSnapTarget(snappedPole)
      setWalls((current) =>
        current.map((wall) => {
          if (wall.id !== interaction.wallId) {
            return wall
          }

          const fixedPoint = interaction.endpoint === 'start' ? wall.end : wall.start
          const movedPoint = snappedPole ?? snapWallPoint(fixedPoint, worldPoint, event.shiftKey)

          return {
            ...wall,
            [interaction.endpoint]: movedPoint,
          }
        }),
      )
    }
  }

  const handlePointerUp = (event: PointerEvent<HTMLCanvasElement>) => {
    const interaction = interactionRef.current

    if (interaction.kind === 'draw-wall' && interaction.pointerId === event.pointerId) {
      const length = getDistance(interaction.start, interaction.end)

      if (length > 8) {
        setWalls((current) => [
          ...current,
          {
            id: nextWallIdRef.current,
            start: interaction.start,
            end: interaction.end,
            hasInfill: true,
          },
        ])
        setSelectedWallId(nextWallIdRef.current)
        nextWallIdRef.current += 1
      }

      setDraftWall(null)
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
      </header>

      <section className="drawing-space" aria-label="Drawing space" ref={canvasWrapRef}>
        {viewMode === '2d' ? (
          <canvas
            ref={canvasRef}
            className={`drawing-canvas ${activeTool === 'wall' ? 'drawing-canvas--draw' : ''}`}
            aria-label="Construction drawing canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        ) : (
          <ThreeDViewer walls={walls} pixelsPerMeter={PIXELS_PER_METER} wallWidth={WALL_WIDTH} />
        )}
      </section>

      <nav className="floating-panel left-menu flex flex-col gap-2" aria-label="Tools">
        <Button
          variant={activeTool === 'wall' ? "default" : "outline"}
          size="sm"
          className="w-full h-auto py-2 flex-col gap-1"
          onClick={() => setActiveTool((tool) => (tool === 'wall' ? null : 'wall'))}
        >
          <WallIcon />
          <span>Walls</span>
        </Button>
      </nav>

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
            variant={viewMode === mode ? "default" : "ghost"}
            size="sm"
            className="h-8 w-10"
            onClick={() => setViewMode(mode)}
          >
            {mode.toUpperCase()}
          </Button>
        ))}
      </div>

      {selectedWall && viewMode === '2d' && (
        <div className="floating-panel wall-properties" aria-label="Wall properties">
          <span className="wall-properties-label">Infill between poles</span>
          <Button
            variant={selectedWall.hasInfill ? "default" : "outline"}
            size="sm"
            className="h-8 px-3"
            onClick={toggleSelectedWallInfill}
          >
            {selectedWall.hasInfill ? 'On' : 'Off'}
          </Button>
        </div>
      )}

      <div className="floating-panel unit-switch p-1 gap-1" aria-label="Size unit">
        {(['mm', 'cm', 'm'] as const).map((sizeUnit) => (
          <Button
            key={sizeUnit}
            variant={unit === sizeUnit ? "default" : "ghost"}
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

function drawCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  options: {
    viewport: Viewport
    walls: Wall[]
    draftWall: Wall | null
    selectedWallId: number | null
    snapTarget: Point | null
  },
) {
  const { viewport, walls, draftWall, selectedWallId, snapTarget } = options
  const originX = width / 2 + viewport.x
  const originY = height / 2 + viewport.y

  context.clearRect(0, 0, width, height)
  context.fillStyle = '#f3f2ef'
  context.fillRect(0, 0, width, height)

  drawGrid(context, width, height, originX, originY, viewport.scale)

  context.save()
  context.translate(originX, originY)
  context.scale(viewport.scale, viewport.scale)
  drawWalls(context, walls, selectedWallId)

  if (draftWall) {
    drawWall(context, draftWall, true, true)
  }

  if (snapTarget) {
    drawSnapIndicator(context, snapTarget, viewport.scale)
  }

  context.restore()
}

function drawSnapIndicator(context: CanvasRenderingContext2D, point: Point, scale: number) {
  const radius = 14 / scale

  context.save()
  context.strokeStyle = '#16a9e6'
  context.fillStyle = 'rgba(22, 169, 230, 0.18)'
  context.lineWidth = 2 / scale
  context.beginPath()
  context.arc(point.x, point.y, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  scale: number,
) {
  const minorStep = 40 * scale
  const majorStep = minorStep * 5

  context.save()
  context.lineWidth = 1

  drawGridLines(context, width, height, originX, originY, minorStep, '#e4e1dc')
  drawGridLines(context, width, height, originX, originY, majorStep, '#d2cec7')

  context.restore()
}

function drawGridLines(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  originX: number,
  originY: number,
  step: number,
  color: string,
) {
  const startX = originX + Math.floor((0 - originX) / step) * step
  const startY = originY + Math.floor((0 - originY) / step) * step

  context.beginPath()
  context.strokeStyle = color

  for (let x = startX; x <= width; x += step) {
    context.moveTo(x, 0)
    context.lineTo(x, height)
  }

  for (let y = startY; y <= height; y += step) {
    context.moveTo(0, y)
    context.lineTo(width, y)
  }

  context.stroke()
}

function drawWalls(
  context: CanvasRenderingContext2D,
  walls: Wall[],
  selectedWallId: number | null,
) {
  walls.forEach((wall) => {
    drawWall(context, wall, wall.id === selectedWallId, false)
  })
}

function drawWall(context: CanvasRenderingContext2D, wall: Wall, selected: boolean, draft: boolean) {
  context.save()
  context.lineCap = 'square'
  context.lineJoin = 'miter'

  if (wall.hasInfill) {
    context.shadowColor = draft ? 'transparent' : 'rgba(0, 0, 0, 0.18)'
    context.shadowBlur = 0
    context.shadowOffsetX = draft ? 0 : 5
    context.shadowOffsetY = draft ? 0 : 6
    context.strokeStyle = draft ? '#16a9e6' : '#050505'
    context.lineWidth = WALL_WIDTH

    context.beginPath()
    context.moveTo(wall.start.x, wall.start.y)
    context.lineTo(wall.end.x, wall.end.y)
    context.stroke()
  } else {
    context.strokeStyle = draft ? '#16a9e6' : '#7a7570'
    context.lineWidth = 2
    context.setLineDash([6, 6])
    context.beginPath()
    context.moveTo(wall.start.x, wall.start.y)
    context.lineTo(wall.end.x, wall.end.y)
    context.stroke()
    context.setLineDash([])
  }

  context.restore()

  if (!wall.hasInfill) {
    drawPoleMarkers(context, wall, selected, draft)
  }

  if (selected || draft) {
    drawWallGuides(context, wall, draft)
  }
}

function drawPoleMarkers(context: CanvasRenderingContext2D, wall: Wall, selected: boolean, draft: boolean) {
  const size = WALL_WIDTH
  const fill = draft ? '#16a9e6' : '#050505'
  const stroke = selected ? '#16a9e6' : 'rgba(0, 0, 0, 0.6)'

  context.save()
  context.fillStyle = fill
  context.strokeStyle = stroke
  context.lineWidth = 1.5

  for (const point of [wall.start, wall.end]) {
    context.beginPath()
    context.rect(point.x - size / 2, point.y - size / 2, size, size)
    context.fill()
    context.stroke()
  }

  context.restore()
}

function drawWallGuides(context: CanvasRenderingContext2D, wall: Wall, draft: boolean) {
  context.save()
  context.strokeStyle = '#16a9e6'
  context.fillStyle = '#16a9e6'
  context.lineWidth = 2
  context.setLineDash(draft ? [10, 8] : [])

  context.beginPath()
  context.moveTo(wall.start.x, wall.start.y)
  context.lineTo(wall.end.x, wall.end.y)
  context.stroke()
  context.setLineDash([])

  drawHandle(context, wall.start)
  drawHandle(context, wall.end)
  drawDistanceLabel(context, wall)
  context.restore()
}

function drawHandle(context: CanvasRenderingContext2D, point: Point) {
  context.save()
  context.fillStyle = '#ffffff'
  context.strokeStyle = '#16a9e6'
  context.lineWidth = 2
  context.beginPath()
  context.arc(point.x, point.y, 7, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function drawDistanceLabel(context: CanvasRenderingContext2D, wall: Wall) {
  const label = formatDistance(getDistance(wall.start, wall.end))
  const midpoint = {
    x: (wall.start.x + wall.end.x) / 2,
    y: (wall.start.y + wall.end.y) / 2,
  }
  const normal = getNormal(wall.start, wall.end)
  const x = midpoint.x + normal.x * 26
  const y = midpoint.y + normal.y * 26

  context.save()
  context.font = '13px Inter, system-ui, sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'

  const textWidth = context.measureText(label).width + 18
  context.fillStyle = '#ffffff'
  context.strokeStyle = '#d2cec7'
  context.lineWidth = 1
  context.beginPath()
  context.roundRect(x - textWidth / 2, y - 13, textWidth, 26, 6)
  context.fill()
  context.stroke()

  context.fillStyle = '#111111'
  context.fillText(label, x, y)
  context.restore()
}

function screenToWorldPoint(
  localX: number,
  localY: number,
  rect: DOMRect,
  viewport: Viewport,
): Point {
  return {
    x: (localX - rect.width / 2 - viewport.x) / viewport.scale,
    y: (localY - rect.height / 2 - viewport.y) / viewport.scale,
  }
}

function getHitTarget(point: Point, walls: Wall[], scale: number): HitTarget {
  const endpointThreshold = 12 / scale
  const wallThreshold = 10 / scale

  for (let index = walls.length - 1; index >= 0; index -= 1) {
    const wall = walls[index]

    if (getDistance(point, wall.start) <= endpointThreshold) {
      return { kind: 'endpoint', wallId: wall.id, endpoint: 'start' }
    }

    if (getDistance(point, wall.end) <= endpointThreshold) {
      return { kind: 'endpoint', wallId: wall.id, endpoint: 'end' }
    }
  }

  for (let index = walls.length - 1; index >= 0; index -= 1) {
    const wall = walls[index]

    if (getDistanceToSegment(point, wall.start, wall.end) <= wallThreshold) {
      return { kind: 'wall', wallId: wall.id }
    }
  }

  return null
}

function snapWallPoint(start: Point, end: Point, snap: boolean): Point {
  if (!snap) {
    return end
  }

  const deltaX = end.x - start.x
  const deltaY = end.y - start.y

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return { x: end.x, y: start.y }
  }

  return { x: start.x, y: end.y }
}

function findNearestPole(
  point: Point,
  walls: Wall[],
  excludeWallId: number | undefined,
  threshold: number,
): Point | null {
  let best: Point | null = null
  let bestDistance = threshold

  for (const wall of walls) {
    if (excludeWallId !== undefined && wall.id === excludeWallId) {
      continue
    }

    for (const candidate of [wall.start, wall.end]) {
      const distance = getDistance(point, candidate)

      if (distance <= bestDistance) {
        best = candidate
        bestDistance = distance
      }
    }
  }

  return best
}

function getDistanceToSegment(point: Point, start: Point, end: Point) {
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2

  if (lengthSquared === 0) {
    return getDistance(point, start)
  }

  const t = clamp(
    ((point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y)) /
      lengthSquared,
    0,
    1,
  )

  return getDistance(point, {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  })
}

function getDistance(start: Point, end: Point) {
  return Math.hypot(end.x - start.x, end.y - start.y)
}

function getNormal(start: Point, end: Point): Point {
  const distance = getDistance(start, end)

  if (distance === 0) {
    return { x: 0, y: -1 }
  }

  return {
    x: -(end.y - start.y) / distance,
    y: (end.x - start.x) / distance,
  }
}

function addPoints(point: Point, delta: Point): Point {
  return {
    x: point.x + delta.x,
    y: point.y + delta.y,
  }
}

function formatDistance(distance: number) {
  return `${(distance / PIXELS_PER_METER).toFixed(2)} m`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function WallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="presentation" aria-hidden="true">
      <path d="M4 8h16" />
      <path d="M4 16h16" />
      <path d="M7 8v8" />
      <path d="M12 8v8" />
      <path d="M17 8v8" />
    </svg>
  )
}

export default App
