import { Button } from '@/components/ui/button'
import type { Wall } from './types'

interface WallPropertiesProps {
  element: Wall
  onChange: (next: Wall) => void
}

export function WallProperties({ element, onChange }: WallPropertiesProps) {
  return (
    <>
      <span className="element-properties-label">Infill between poles</span>
      <Button
        variant={element.hasInfill ? 'default' : 'outline'}
        size="sm"
        className="h-8 px-3"
        onClick={() => onChange({ ...element, hasInfill: !element.hasInfill })}
      >
        {element.hasInfill ? 'On' : 'Off'}
      </Button>
    </>
  )
}
