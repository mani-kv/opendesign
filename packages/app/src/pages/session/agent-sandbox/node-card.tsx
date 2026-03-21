import { Switch, Match } from "solid-js"
import type { AgentNode, CanvasNode } from "@opencode-ai/opendesign"
import { AgentNodeCard } from "./agent-node-card"

export function NodeCard(props: {
  node: CanvasNode
  selected: boolean
  onSelect: () => void
  onDragStart: (e: PointerEvent) => void
}) {
  return (
    <div
      class="rounded-lg border bg-background-base shadow-sm overflow-hidden cursor-grab active:cursor-grabbing select-none"
      classList={{ "border-[var(--border-info-base)] ring-1 ring-[var(--border-info-base)]": props.selected }}
      style={{ width: `${props.node.width ?? 320}px`, height: `${props.node.height ?? 240}px` }}
      onPointerDown={(e) => {
        props.onSelect()
        props.onDragStart(e)
      }}
    >
      <Switch fallback={<DefaultCard node={props.node} />}>
        <Match when={props.node.type === "agent" && props.node}>
          {(n) => <AgentNodeCard node={n() as AgentNode} />}
        </Match>
        <Match when={props.node.type === "frame"}>
          <SimpleCard label="Frame" name={(props.node as Extract<CanvasNode, { type: "frame" }>).data.frame.name} icon="image" />
        </Match>
        <Match when={props.node.type === "persona"}>
          <SimpleCard label="Persona" name={(props.node as Extract<CanvasNode, { type: "persona" }>).data.persona.name} icon="user" />
        </Match>
        <Match when={props.node.type === "context"}>
          <SimpleCard label="Context" name={(props.node as Extract<CanvasNode, { type: "context" }>).data.document.name} icon="file-text" />
        </Match>
        <Match when={props.node.type === "checkpoint"}>
          <SimpleCard label="Checkpoint" name={(props.node as Extract<CanvasNode, { type: "checkpoint" }>).data.checkpoint.id} icon="git-commit" />
        </Match>
        <Match when={props.node.type === "merged"}>
          <SimpleCard
            label="Merged"
            name={`${(props.node as Extract<CanvasNode, { type: "merged" }>).data.sourceNodeIds.length} sources`}
            icon="git-merge"
          />
        </Match>
      </Switch>
    </div>
  )
}

function SimpleCard(props: { label: string; name: string; icon: string }) {
  return (
    <div class="p-3 h-full flex flex-col gap-2">
      <div class="text-11-medium text-text-dimmer uppercase tracking-wider">{props.label}</div>
      <div class="text-13-medium text-text-base truncate">{props.name}</div>
    </div>
  )
}

function DefaultCard(props: { node: CanvasNode }) {
  return (
    <div class="p-3 h-full flex items-center justify-center">
      <div class="text-13-regular text-text-weak">{props.node.type}</div>
    </div>
  )
}
