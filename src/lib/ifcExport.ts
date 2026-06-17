import type { Wall } from '@/App'
import {
  PIXELS_PER_METER,
  POLE_HEIGHT_METERS,
  POLE_SIZE_METERS,
  SOKKEL_HEIGHT_METERS,
  SOKKEL_SIZE_METERS,
  WALL_HEIGHT_METERS,
} from '@/lib/dimensions'

const WALL_THICKNESS_PIXELS = 12

type Writer = {
  add: (entity: string) => number
  lines: string[]
}

type SharedRefs = {
  ownerHistory: number
  storeyPlacement: number
  context: number
}

export function generateIfc(walls: Wall[]): string {
  const writer = createWriter()

  const origin = writer.add('IFCCARTESIANPOINT((0.,0.,0.))')
  const zAxis = writer.add('IFCDIRECTION((0.,0.,1.))')
  const xAxis = writer.add('IFCDIRECTION((1.,0.,0.))')
  const worldAxis = writer.add(`IFCAXIS2PLACEMENT3D(#${origin},#${zAxis},#${xAxis})`)

  const person = writer.add(`IFCPERSON($,$,'',$,$,$,$,$)`)
  const org = writer.add(`IFCORGANIZATION($,'Kommerce',$,$,$)`)
  const personOrg = writer.add(`IFCPERSONANDORGANIZATION(#${person},#${org},$)`)
  const app = writer.add(`IFCAPPLICATION(#${org},'1.0','Kommerce Construction Viewer','kommerce')`)
  const ownerHistory = writer.add(
    `IFCOWNERHISTORY(#${personOrg},#${app},$,.ADDED.,$,$,$,${Math.floor(Date.now() / 1000)})`,
  )

  const m = writer.add(`IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`)
  const m2 = writer.add(`IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)`)
  const m3 = writer.add(`IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)`)
  const rad = writer.add(`IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)`)
  const units = writer.add(`IFCUNITASSIGNMENT((#${m},#${m2},#${m3},#${rad}))`)

  const context = writer.add(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#${worldAxis},$)`,
  )

  const projectPlacement = writer.add(`IFCLOCALPLACEMENT($,#${worldAxis})`)
  const project = writer.add(
    `IFCPROJECT('${ifcGuid()}',#${ownerHistory},'Example House',$,$,$,$,(#${context}),#${units})`,
  )

  const sitePlacement = writer.add(`IFCLOCALPLACEMENT(#${projectPlacement},#${worldAxis})`)
  const site = writer.add(
    `IFCSITE('${ifcGuid()}',#${ownerHistory},'Default Site',$,$,#${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$)`,
  )

  const buildingPlacement = writer.add(`IFCLOCALPLACEMENT(#${sitePlacement},#${worldAxis})`)
  const building = writer.add(
    `IFCBUILDING('${ifcGuid()}',#${ownerHistory},'Default Building',$,$,#${buildingPlacement},$,$,.ELEMENT.,$,$,$)`,
  )

  const storeyPlacement = writer.add(`IFCLOCALPLACEMENT(#${buildingPlacement},#${worldAxis})`)
  const storey = writer.add(
    `IFCBUILDINGSTOREY('${ifcGuid()}',#${ownerHistory},'Ground Floor',$,$,#${storeyPlacement},$,$,.ELEMENT.,0.)`,
  )

  writer.add(
    `IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${project},(#${site}))`,
  )
  writer.add(
    `IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${site},(#${building}))`,
  )
  writer.add(
    `IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${building},(#${storey}))`,
  )

  const refs: SharedRefs = { ownerHistory, storeyPlacement, context }
  const elements: number[] = []

  for (const wall of walls) {
    if (!wall.hasInfill) {
      continue
    }

    const id = writeWall(writer, refs, wall)
    if (id !== null) {
      elements.push(id)
    }
  }

  for (const [x, y] of getUniqueEndpoints(walls)) {
    elements.push(writeSokkel(writer, refs, x, y))
    elements.push(writePole(writer, refs, x, y))
  }

  if (elements.length > 0) {
    const list = elements.map((id) => `#${id}`).join(',')
    writer.add(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${ownerHistory},$,$,(${list}),#${storey})`,
    )
  }

  return wrapIfc(writer.lines)
}

function writeWall(writer: Writer, refs: SharedRefs, wall: Wall): number | null {
  const startX = wall.start.x / PIXELS_PER_METER
  const startY = wall.start.y / PIXELS_PER_METER
  const endX = wall.end.x / PIXELS_PER_METER
  const endY = wall.end.y / PIXELS_PER_METER
  const dx = endX - startX
  const dy = endY - startY
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  const cx = (startX + endX) / 2
  const cy = (startY + endY) / 2
  const dirX = dx / length
  const dirY = dy / length
  const thickness = WALL_THICKNESS_PIXELS / PIXELS_PER_METER

  const placement = writeLocalPlacement(writer, refs.storeyPlacement, cx, cy, 0, dirX, dirY)
  const shape = writeBoxShape(writer, refs.context, length, thickness, WALL_HEIGHT_METERS)

  return writer.add(
    `IFCWALLSTANDARDCASE('${ifcGuid()}',#${refs.ownerHistory},'Wall',$,$,#${placement},#${shape},$,.NOTDEFINED.)`,
  )
}

function writeSokkel(writer: Writer, refs: SharedRefs, x: number, y: number): number {
  const placement = writeLocalPlacement(writer, refs.storeyPlacement, x, y, 0, 1, 0)
  const shape = writeBoxShape(
    writer,
    refs.context,
    SOKKEL_SIZE_METERS,
    SOKKEL_SIZE_METERS,
    SOKKEL_HEIGHT_METERS,
  )

  return writer.add(
    `IFCFOOTING('${ifcGuid()}',#${refs.ownerHistory},'Sokkel',$,$,#${placement},#${shape},$,.PAD_FOOTING.)`,
  )
}

function writePole(writer: Writer, refs: SharedRefs, x: number, y: number): number {
  const placement = writeLocalPlacement(writer, refs.storeyPlacement, x, y, SOKKEL_HEIGHT_METERS, 1, 0)
  const shape = writeBoxShape(
    writer,
    refs.context,
    POLE_SIZE_METERS,
    POLE_SIZE_METERS,
    POLE_HEIGHT_METERS,
  )

  return writer.add(
    `IFCCOLUMN('${ifcGuid()}',#${refs.ownerHistory},'Pole',$,$,#${placement},#${shape},$,.COLUMN.)`,
  )
}

function writeLocalPlacement(
  writer: Writer,
  parent: number,
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
): number {
  const point = writer.add(`IFCCARTESIANPOINT((${num(x)},${num(y)},${num(z)}))`)
  const zAxis = writer.add(`IFCDIRECTION((0.,0.,1.))`)
  const xAxis = writer.add(`IFCDIRECTION((${num(dirX)},${num(dirY)},0.))`)
  const axis = writer.add(`IFCAXIS2PLACEMENT3D(#${point},#${zAxis},#${xAxis})`)

  return writer.add(`IFCLOCALPLACEMENT(#${parent},#${axis})`)
}

function writeBoxShape(
  writer: Writer,
  context: number,
  xDim: number,
  yDim: number,
  height: number,
): number {
  const profileCenter = writer.add(`IFCCARTESIANPOINT((0.,0.))`)
  const profileX = writer.add(`IFCDIRECTION((1.,0.))`)
  const profilePlacement = writer.add(`IFCAXIS2PLACEMENT2D(#${profileCenter},#${profileX})`)
  const profile = writer.add(
    `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profilePlacement},${num(xDim)},${num(yDim)})`,
  )

  const extOrigin = writer.add(`IFCCARTESIANPOINT((0.,0.,0.))`)
  const extZ = writer.add(`IFCDIRECTION((0.,0.,1.))`)
  const extX = writer.add(`IFCDIRECTION((1.,0.,0.))`)
  const extPlacement = writer.add(`IFCAXIS2PLACEMENT3D(#${extOrigin},#${extZ},#${extX})`)
  const extDir = writer.add(`IFCDIRECTION((0.,0.,1.))`)
  const solid = writer.add(
    `IFCEXTRUDEDAREASOLID(#${profile},#${extPlacement},#${extDir},${num(height)})`,
  )

  const rep = writer.add(
    `IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',(#${solid}))`,
  )

  return writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}))`)
}

const POLE_MERGE_TOLERANCE_METERS = POLE_SIZE_METERS

function getUniqueEndpoints(walls: Wall[]): Array<[number, number]> {
  const points: Array<[number, number]> = []

  for (const wall of walls) {
    for (const point of [wall.start, wall.end]) {
      const x = point.x / PIXELS_PER_METER
      const y = point.y / PIXELS_PER_METER

      const exists = points.some(
        ([px, py]) => Math.hypot(px - x, py - y) <= POLE_MERGE_TOLERANCE_METERS,
      )

      if (!exists) {
        points.push([x, y])
      }
    }
  }

  return points
}

function createWriter(): Writer {
  const lines: string[] = []
  let id = 0

  return {
    lines,
    add: (entity: string) => {
      id += 1
      lines.push(`#${id}=${entity};`)
      return id
    },
  }
}

function num(n: number): string {
  const safe = Object.is(n, -0) ? 0 : n
  const fixed = parseFloat(safe.toFixed(6)).toString()
  return fixed.includes('.') ? fixed : `${fixed}.`
}

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

function ifcGuid(): string {
  let result = ''
  for (let i = 0; i < 22; i += 1) {
    result += GUID_CHARS[Math.floor(Math.random() * 64)]
  }
  return result
}

function ifcTimestamp(): string {
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
}

function wrapIfc(lines: string[]): string {
  return [
    `ISO-10303-21;`,
    `HEADER;`,
    `FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');`,
    `FILE_NAME('export.ifc','${ifcTimestamp()}',(''),(''),'Kommerce Construction Viewer','Kommerce','');`,
    `FILE_SCHEMA(('IFC2X3'));`,
    `ENDSEC;`,
    `DATA;`,
    ...lines,
    `ENDSEC;`,
    `END-ISO-10303-21;`,
    '',
  ].join('\n')
}

export function downloadIfc(walls: Wall[], filename = 'kommerce-export.ifc') {
  const content = generateIfc(walls)
  const blob = new Blob([content], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
