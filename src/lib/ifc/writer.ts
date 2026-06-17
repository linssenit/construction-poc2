export type IfcWriter = {
  add: (entity: string) => number
  lines: string[]
}

export type SharedRefs = {
  ownerHistory: number
  storeyPlacement: number
  context: number
}

export function createWriter(): IfcWriter {
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

export function num(n: number): string {
  const safe = Object.is(n, -0) ? 0 : n
  const fixed = parseFloat(safe.toFixed(6)).toString()
  return fixed.includes('.') ? fixed : `${fixed}.`
}

const GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function ifcGuid(): string {
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

export function writeProjectScaffold(writer: IfcWriter): { refs: SharedRefs; storey: number } {
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

  writer.add(`IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${project},(#${site}))`)
  writer.add(`IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${site},(#${building}))`)
  writer.add(`IFCRELAGGREGATES('${ifcGuid()}',#${ownerHistory},$,$,#${building},(#${storey}))`)

  return {
    refs: { ownerHistory, storeyPlacement, context },
    storey,
  }
}

export function writeSpatialContainment(
  writer: IfcWriter,
  refs: SharedRefs,
  storey: number,
  elementIds: number[],
) {
  if (elementIds.length === 0) {
    return
  }

  const list = elementIds.map((id) => `#${id}`).join(',')
  writer.add(
    `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',#${refs.ownerHistory},$,$,(${list}),#${storey})`,
  )
}

export function writeLocalPlacement(
  writer: IfcWriter,
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

export function writeBoxShape(
  writer: IfcWriter,
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

  const rep = writer.add(`IFCSHAPEREPRESENTATION(#${context},'Body','SweptSolid',(#${solid}))`)

  return writer.add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${rep}))`)
}

export function wrapIfc(lines: string[]): string {
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
