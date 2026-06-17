import { Button } from '@/components/ui/button'
import { listTools } from '@/elements/registry'

interface ToolbarProps {
  activeToolId: string | null
  onSelectTool: (toolId: string | null) => void
}

export function Toolbar({ activeToolId, onSelectTool }: ToolbarProps) {
  const tools = listTools()

  return (
    <nav className="floating-panel left-menu flex flex-col gap-2" aria-label="Tools">
      {tools.map(({ tool }) => {
        const Icon = tool.icon
        const isActive = activeToolId === tool.id

        return (
          <Button
            key={tool.id}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            className="w-full h-auto py-2 flex-col gap-1"
            onClick={() => onSelectTool(isActive ? null : tool.id)}
          >
            <Icon />
            <span>{tool.label}</span>
          </Button>
        )
      })}
    </nav>
  )
}
