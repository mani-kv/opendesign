import type { AgentNode } from "@opencode-ai/opendesign/types"
import { stateColor } from "@opencode-ai/opendesign/agent"
import { SANDPACK_SRCDOC } from "./sandpack-srcdoc"

export function AgentNodeCard(props: { node: AgentNode; onDragStart: (e: PointerEvent) => void }) {
  const color = () => stateColor(props.node.data.state)

  return (
    <div class="h-full flex flex-col overflow-hidden">
      <div
        class="p-3 flex flex-col gap-1 shrink-0 cursor-grab active:cursor-grabbing"
        onPointerDown={(e) => props.onDragStart(e)}
      >
        <div class="flex items-center gap-2">
          <div class="size-2 rounded-full shrink-0" style={{ "background-color": color() }} />
          <div class="text-11-medium text-text-dimmer uppercase tracking-wider">{props.node.data.state}</div>
          <div class="ml-auto text-11-regular text-text-weak font-mono truncate">{props.node.data.branch}</div>
        </div>
        <div class="text-13-medium text-text-base line-clamp-1">{props.node.data.scenario}</div>
      </div>
      <div class="flex-1 min-h-0 border-t border-[var(--border-weaker-base)]">
        <iframe
          srcdoc={SANDPACK_SRCDOC}
          class="size-full border-0"
          sandbox="allow-scripts"
          title="Sandpack preview"
        />
      </div>
    </div>
  )
}
