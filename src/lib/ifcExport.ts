import { getIfcAPI } from '@/lib/ifc/api'
import { IFC_SCHEMA, writeProjectScaffold, writeSpatialContainment } from '@/lib/ifc/writer'
import { ELEMENT_MODULES, MODULE_ORDER } from '@/elements/registry'
import type { ElementCollection, IfcProductHandle } from '@/elements/types'

export async function generateIfc(elements: ElementCollection): Promise<Uint8Array> {
  const api = await getIfcAPI()
  const modelID = api.CreateModel({
    schema: IFC_SCHEMA,
    name: 'boomkamer-export.ifc',
    description: ['ViewDefinition [CoordinationView]'],
    authors: ['Boomkamer Construction Viewer'],
    organizations: ['Boomkamer'],
  })

  try {
    const { refs, storey } = writeProjectScaffold(api, modelID)
    const handles: IfcProductHandle[] = []
    const ctx = { api, modelID, refs, allElements: elements }

    for (const type of MODULE_ORDER) {
      const mod = ELEMENT_MODULES[type]
      const slice = elements[type] ?? []

      for (const el of slice) {
        const handle = mod.writeIfc(el, ctx)
        if (handle) {
          handles.push(handle)
        }
      }

      if (mod.extras?.writeIfc) {
        handles.push(...mod.extras.writeIfc(slice, ctx))
      }
    }

    writeSpatialContainment(api, modelID, refs, storey, handles)
    return api.SaveModel(modelID)
  } finally {
    api.CloseModel(modelID)
  }
}

export async function downloadIfc(elements: ElementCollection, filename = 'boomkamer-export.ifc') {
  const bytes = await generateIfc(elements)
  const blob = new Blob([bytes as BlobPart], { type: 'application/x-step' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
