import { Handle, IFC4, IfcLineObject } from 'web-ifc'
import type { IfcAPI } from 'web-ifc'

export const IFC_SCHEMA = 'IFC4' as const

export interface SharedRefs {
  ownerHistory: Handle<IFC4.IfcOwnerHistory>
  storeyPlacement: Handle<IFC4.IfcLocalPlacement>
  context: Handle<IFC4.IfcGeometricRepresentationContext>
}

export interface ScaffoldResult {
  refs: SharedRefs
  storey: Handle<IFC4.IfcBuildingStorey>
}

export function newGuid(api: IfcAPI, modelID: number): IFC4.IfcGloballyUniqueId {
  return api.CreateIFCGloballyUniqueId(modelID) as IFC4.IfcGloballyUniqueId
}

function write<T extends IfcLineObject>(api: IfcAPI, modelID: number, entity: T): Handle<T> {
  api.WriteLine(modelID, entity)
  return new Handle<T>(entity.expressID)
}

function point3d(x: number, y: number, z: number): IFC4.IfcCartesianPoint {
  return new IFC4.IfcCartesianPoint([
    new IFC4.IfcLengthMeasure(x),
    new IFC4.IfcLengthMeasure(y),
    new IFC4.IfcLengthMeasure(z),
  ])
}

function point2d(x: number, y: number): IFC4.IfcCartesianPoint {
  return new IFC4.IfcCartesianPoint([
    new IFC4.IfcLengthMeasure(x),
    new IFC4.IfcLengthMeasure(y),
  ])
}

function direction3d(x: number, y: number, z: number): IFC4.IfcDirection {
  return new IFC4.IfcDirection([new IFC4.IfcReal(x), new IFC4.IfcReal(y), new IFC4.IfcReal(z)])
}

function direction2d(x: number, y: number): IFC4.IfcDirection {
  return new IFC4.IfcDirection([new IFC4.IfcReal(x), new IFC4.IfcReal(y)])
}

function axis3d(origin: IFC4.IfcCartesianPoint, axis: IFC4.IfcDirection, refDir: IFC4.IfcDirection) {
  return new IFC4.IfcAxis2Placement3D(origin, axis, refDir)
}

export function makeLocalPlacement(
  api: IfcAPI,
  modelID: number,
  parent: Handle<IFC4.IfcObjectPlacement> | null,
  x: number,
  y: number,
  z: number,
  dirX: number,
  dirY: number,
): Handle<IFC4.IfcLocalPlacement> {
  const placement = new IFC4.IfcLocalPlacement(
    parent,
    axis3d(point3d(x, y, z), direction3d(0, 0, 1), direction3d(dirX, dirY, 0)),
  )
  return write(api, modelID, placement)
}

/** RGB in the 0..1 range, used to colour a shape's surfaces in the 3D render. */
export type Rgb = readonly [red: number, green: number, blue: number]

export function makeBoxShape(
  api: IfcAPI,
  modelID: number,
  context: Handle<IFC4.IfcGeometricRepresentationContext>,
  xDim: number,
  yDim: number,
  height: number,
  color?: Rgb,
): Handle<IFC4.IfcProductDefinitionShape> {
  const profile = new IFC4.IfcRectangleProfileDef(
    IFC4.IfcProfileTypeEnum.AREA,
    null,
    new IFC4.IfcAxis2Placement2D(point2d(0, 0), direction2d(1, 0)),
    new IFC4.IfcPositiveLengthMeasure(xDim),
    new IFC4.IfcPositiveLengthMeasure(yDim),
  )

  const solid = new IFC4.IfcExtrudedAreaSolid(
    profile,
    axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
    direction3d(0, 0, 1),
    new IFC4.IfcPositiveLengthMeasure(height),
  )
  // Write the solid first so the (optional) style can reference it by handle.
  const solidHandle = write(api, modelID, solid)

  if (color) {
    writeSurfaceStyle(api, modelID, solidHandle, color)
  }

  const shape = new IFC4.IfcProductDefinitionShape(null, null, [
    new IFC4.IfcShapeRepresentation(
      context,
      new IFC4.IfcLabel('Body'),
      new IFC4.IfcLabel('SweptSolid'),
      [solidHandle],
    ),
  ])

  return write(api, modelID, shape)
}

/** Attaches a flat-colour surface style to a geometric representation item. */
function writeSurfaceStyle(
  api: IfcAPI,
  modelID: number,
  item: Handle<IFC4.IfcRepresentationItem>,
  [red, green, blue]: Rgb,
): void {
  const colour = new IFC4.IfcColourRgb(
    null,
    new IFC4.IfcNormalisedRatioMeasure(red),
    new IFC4.IfcNormalisedRatioMeasure(green),
    new IFC4.IfcNormalisedRatioMeasure(blue),
  )
  const rendering = new IFC4.IfcSurfaceStyleRendering(
    colour,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    IFC4.IfcReflectanceMethodEnum.NOTDEFINED,
  )
  const surfaceStyle = new IFC4.IfcSurfaceStyle(null, IFC4.IfcSurfaceSide.BOTH, [rendering])
  write(api, modelID, new IFC4.IfcStyledItem(item, [surfaceStyle], null))
}

/**
 * Associates a single named material with a set of products via one shared
 * `IfcMaterial` + `IfcRelAssociatesMaterial`. No-op for an empty product list.
 */
export function writeMaterialAssociation(
  api: IfcAPI,
  modelID: number,
  ownerHistory: Handle<IFC4.IfcOwnerHistory>,
  name: string,
  products: Handle<IFC4.IfcProduct>[],
): void {
  if (products.length === 0) {
    return
  }

  const material = write(api, modelID, new IFC4.IfcMaterial(new IFC4.IfcLabel(name), null, null))
  write(
    api,
    modelID,
    new IFC4.IfcRelAssociatesMaterial(
      newGuid(api, modelID),
      ownerHistory,
      null,
      null,
      products,
      material,
    ),
  )
}

export function writeProjectScaffold(api: IfcAPI, modelID: number): ScaffoldResult {
  const person = write(api, modelID, new IFC4.IfcPerson(null, null, null, null, null, null, null, null))
  const org = write(api, modelID, new IFC4.IfcOrganization(null, new IFC4.IfcLabel('Boomkamer'), null, null, null))
  const personOrg = write(api, modelID, new IFC4.IfcPersonAndOrganization(person, org, null))
  const app = write(
    api,
    modelID,
    new IFC4.IfcApplication(
      org,
      new IFC4.IfcLabel('1.0'),
      new IFC4.IfcLabel('Boomkamer Construction Viewer'),
      new IFC4.IfcIdentifier('Boomkamer'),
    ),
  )
  const ownerHistory = write(
    api,
    modelID,
    new IFC4.IfcOwnerHistory(
      personOrg,
      app,
      null,
      IFC4.IfcChangeActionEnum.ADDED,
      null,
      null,
      null,
      new IFC4.IfcTimeStamp(Math.floor(Date.now() / 1000)),
    ),
  )

  const m = write(api, modelID, new IFC4.IfcSIUnit(IFC4.IfcUnitEnum.LENGTHUNIT, null, IFC4.IfcSIUnitName.METRE))
  const m2 = write(api, modelID, new IFC4.IfcSIUnit(IFC4.IfcUnitEnum.AREAUNIT, null, IFC4.IfcSIUnitName.SQUARE_METRE))
  const m3 = write(api, modelID, new IFC4.IfcSIUnit(IFC4.IfcUnitEnum.VOLUMEUNIT, null, IFC4.IfcSIUnitName.CUBIC_METRE))
  const rad = write(api, modelID, new IFC4.IfcSIUnit(IFC4.IfcUnitEnum.PLANEANGLEUNIT, null, IFC4.IfcSIUnitName.RADIAN))
  const units = write(api, modelID, new IFC4.IfcUnitAssignment([m, m2, m3, rad]))

  const worldAxis = write(
    api,
    modelID,
    axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
  )

  const context = write(
    api,
    modelID,
    new IFC4.IfcGeometricRepresentationContext(
      null,
      new IFC4.IfcLabel('Model'),
      new IFC4.IfcDimensionCount(3),
      new IFC4.IfcReal(1e-5),
      worldAxis,
      null,
    ),
  )

  const projectPlacement = write(
    api,
    modelID,
    new IFC4.IfcLocalPlacement(
      null,
      axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
    ),
  )

  const project = write(
    api,
    modelID,
    new IFC4.IfcProject(
      newGuid(api, modelID),
      ownerHistory,
      new IFC4.IfcLabel('Example House'),
      null,
      null,
      null,
      null,
      [context],
      units,
    ),
  )

  const sitePlacement = write(
    api,
    modelID,
    new IFC4.IfcLocalPlacement(
      projectPlacement,
      axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
    ),
  )
  const site = write(
    api,
    modelID,
    new IFC4.IfcSite(
      newGuid(api, modelID),
      ownerHistory,
      new IFC4.IfcLabel('Default Site'),
      null,
      null,
      sitePlacement,
      null,
      null,
      IFC4.IfcElementCompositionEnum.ELEMENT,
      null,
      null,
      null,
      null,
      null,
    ),
  )

  const buildingPlacement = write(
    api,
    modelID,
    new IFC4.IfcLocalPlacement(
      sitePlacement,
      axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
    ),
  )
  const building = write(
    api,
    modelID,
    new IFC4.IfcBuilding(
      newGuid(api, modelID),
      ownerHistory,
      new IFC4.IfcLabel('Default Building'),
      null,
      null,
      buildingPlacement,
      null,
      null,
      IFC4.IfcElementCompositionEnum.ELEMENT,
      null,
      null,
      null,
    ),
  )

  const storeyPlacement = write(
    api,
    modelID,
    new IFC4.IfcLocalPlacement(
      buildingPlacement,
      axis3d(point3d(0, 0, 0), direction3d(0, 0, 1), direction3d(1, 0, 0)),
    ),
  )
  const storey = write(
    api,
    modelID,
    new IFC4.IfcBuildingStorey(
      newGuid(api, modelID),
      ownerHistory,
      new IFC4.IfcLabel('Ground Floor'),
      null,
      null,
      storeyPlacement,
      null,
      null,
      IFC4.IfcElementCompositionEnum.ELEMENT,
      new IFC4.IfcLengthMeasure(0),
    ),
  )

  write(api, modelID, new IFC4.IfcRelAggregates(newGuid(api, modelID), ownerHistory, null, null, project, [site]))
  write(api, modelID, new IFC4.IfcRelAggregates(newGuid(api, modelID), ownerHistory, null, null, site, [building]))
  write(api, modelID, new IFC4.IfcRelAggregates(newGuid(api, modelID), ownerHistory, null, null, building, [storey]))

  return {
    refs: { ownerHistory, storeyPlacement, context },
    storey,
  }
}

export function writeSpatialContainment(
  api: IfcAPI,
  modelID: number,
  refs: SharedRefs,
  storey: Handle<IFC4.IfcBuildingStorey>,
  elementHandles: Handle<IFC4.IfcProduct>[],
): void {
  if (elementHandles.length === 0) {
    return
  }

  write(
    api,
    modelID,
    new IFC4.IfcRelContainedInSpatialStructure(
      newGuid(api, modelID),
      refs.ownerHistory,
      null,
      null,
      elementHandles,
      storey,
    ),
  )
}
