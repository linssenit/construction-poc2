import {
  createWriter,
  wrapIfc,
  writeProjectScaffold,
  writeSpatialContainment,
} from '@/lib/ifc/writer'
import { ELEMENT_MODULES, MODULE_ORDER } from '@/elements/registry'
import type { ElementCollection } from '@/elements/types'

export function generateIfc(elements: ElementCollection): string {
  const writer = createWriter()
  const { refs, storey } = writeProjectScaffold(writer)
  const ids: number[] = []

  for (const type of MODULE_ORDER) {
    const mod = ELEMENT_MODULES[type]
    const slice = elements[type] ?? []

    for (const el of slice) {
      const id = mod.writeIfc(el, { writer, refs, allElements: elements })
      if (id !== null) {
        ids.push(id)
      }
    }

    if (mod.extras?.writeIfc) {
      ids.push(...mod.extras.writeIfc(slice, { writer, refs, allElements: elements }))
    }
  }

  writeSpatialContainment(writer, refs, storey, ids)
  return wrapIfc(writer.lines)
}

export function downloadIfc(elements: ElementCollection, filename = 'kommerce-export.ifc') {
  const content = generateIfc(elements)
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
