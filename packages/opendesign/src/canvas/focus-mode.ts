import { createSignal } from "solid-js"

export interface FocusTarget {
  nodeId: string
  type: "agent" | "merged"
}

export function createFocusMode() {
  const [target, setTarget] = createSignal<FocusTarget | null>(null)
  const [wasmActive, setWasmActive] = createSignal(false)

  return {
    target,
    isActive: () => target() !== null,
    wasmActive,
    enter(nodeId: string, type: FocusTarget["type"] = "agent") {
      setTarget({ nodeId, type })
      setWasmActive(true)
    },
    exit() {
      setTarget(null)
      setWasmActive(false)
    },
  }
}

export type FocusMode = ReturnType<typeof createFocusMode>
