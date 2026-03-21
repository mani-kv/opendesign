import { createStore, produce } from "solid-js/store"
import type { DesignSystemEntry, ComponentRef } from "../types/design-system"

export interface DesignSystemRegistry {
  systems: DesignSystemEntry[]
  activeId: string | null
}

export function createDesignSystemRegistry(initial?: Partial<DesignSystemRegistry>) {
  const [state, setState] = createStore<DesignSystemRegistry>({
    systems: initial?.systems ?? [],
    activeId: initial?.activeId ?? null,
  })

  return {
    state,
    add(entry: DesignSystemEntry) {
      setState("systems", (prev) => [...prev, entry])
      if (!state.activeId) setState("activeId", entry.id)
    },
    remove(id: string) {
      setState(
        produce((s) => {
          s.systems = s.systems.filter((ds) => ds.id !== id)
          if (s.activeId === id) s.activeId = s.systems[0]?.id ?? null
        }),
      )
    },
    setActive(id: string) {
      if (state.systems.some((s) => s.id === id)) {
        setState("activeId", id)
      }
    },
    active() {
      return state.systems.find((s) => s.id === state.activeId) ?? null
    },
    getById(id: string) {
      return state.systems.find((s) => s.id === id) ?? null
    },
    updateComponents(id: string, components: ComponentRef[]) {
      setState(
        produce((s) => {
          const ds = s.systems.find((d) => d.id === id)
          if (ds) ds.components = components
        }),
      )
    },
    updateTokens(id: string, tokens: Record<string, string>, syncTime = Date.now()) {
      setState(
        produce((s) => {
          const ds = s.systems.find((d) => d.id === id)
          if (ds) {
            ds.tokens.tokens = tokens
            ds.tokens.lastSynced = syncTime
          }
        }),
      )
    },
  }
}

export type DesignSystemStore = ReturnType<typeof createDesignSystemRegistry>
