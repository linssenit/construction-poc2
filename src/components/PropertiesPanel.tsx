import { getModule } from '@/elements/registry'
import type { BaseElement, ElementCollection, SelectionRef } from '@/elements/types'

interface PropertiesPanelProps {
  selection: SelectionRef | null
  elements: ElementCollection
  onChange: (next: BaseElement) => void
}

export function PropertiesPanel({ selection, elements, onChange }: PropertiesPanelProps) {
  if (!selection) {
    return null
  }

  const mod = getModule(selection.type)
  if (!mod || !mod.renderProperties) {
    return null
  }

  const element = (elements[selection.type] ?? []).find((el) => el.id === selection.id)
  if (!element) {
    return null
  }

  return (
    <div className="floating-panel element-properties" aria-label={`${selection.type} properties`}>
      {mod.renderProperties({ element, onChange })}
    </div>
  )
}
