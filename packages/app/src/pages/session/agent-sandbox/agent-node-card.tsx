import type { AgentNode } from "@opencode-ai/opendesign"
import { stateColor } from "@opencode-ai/opendesign"

export function AgentNodeCard(props: { node: AgentNode }) {
  const color = () => stateColor(props.node.data.state)

  return (
    <div class="p-3 h-full flex flex-col gap-2">
      <div class="flex items-center gap-2">
        <div class="size-2 rounded-full shrink-0" style={{ "background-color": color() }} />
        <div class="text-11-medium text-text-dimmer uppercase tracking-wider">
          {props.node.data.state}
        </div>
      </div>
      <div class="text-13-medium text-text-base line-clamp-2">{props.node.data.scenario}</div>
      <div class="mt-auto text-11-regular text-text-weak font-mono truncate">{props.node.data.branch}</div>
    </div>
  )
}
