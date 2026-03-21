import { createContext, createSignal, useContext } from "solid-js"
import { createProjectPool, type ProjectPool } from "./project-pool"

type PoolContextValue = {
  pool: ProjectPool
  keys: () => string[]
  setKeys: (keys: string[]) => void
}

const PoolContext = createContext<PoolContextValue | null>(null)

export function ProjectPoolProvider(props: { children: import("solid-js").JSX.Element }) {
  const pool = createProjectPool()
  const [keys, setKeys] = createSignal<string[]>([], {
    equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i]),
  })

  return <PoolContext.Provider value={{ pool, keys, setKeys }}>{props.children}</PoolContext.Provider>
}

export function useProjectPool() {
  const ctx = useContext(PoolContext)
  if (!ctx) throw new Error("useProjectPool must be used within ProjectPoolProvider")
  return ctx
}
