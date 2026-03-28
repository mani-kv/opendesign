import { createSimpleContext } from "@opencode-ai/ui/context"
import { createStore, produce } from "solid-js/store"
import { createMemo } from "solid-js"
import { Persist, persisted } from "@/utils/persist"

export type Workspace = { id: string; name: string; order: number }
export type Project = { id: string; workspaceId: string; name: string; order: number; sessionId: string; productId?: string }

function uuid() {
  return (
    crypto.randomUUID?.() ??
    `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))
  )
}

const target = Persist.global("opendesign.workspace", ["opendesign.workspace.v2", "opendesign.workspace.v1"])

function migrate(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value
  const v = value as Record<string, unknown>
  const workspaces = Array.isArray(v.workspaces) ? v.workspaces : []
  const projects = Array.isArray(v.projects) ? v.projects : []
  return {
    workspaces: workspaces.map((w: unknown) => {
      if (typeof w !== "object" || w === null) return { id: uuid(), name: "Workspace", order: 0 }
      const x = w as Record<string, unknown>
      return {
        id: typeof x.id === "string" ? x.id : uuid(),
        name: typeof x.name === "string" ? x.name : "Workspace",
        order: typeof x.order === "number" ? x.order : 0,
      }
    }),
    projects: projects.map((p: unknown) => {
      if (typeof p !== "object" || p === null)
        return { id: uuid(), workspaceId: "", name: "Project", order: 0, sessionId: uuid() }
      const x = p as Record<string, unknown>
      const id = typeof x.id === "string" ? x.id : uuid()
      const sessionId = typeof x.sessionId === "string" ? x.sessionId : uuid()
      return {
        id,
        workspaceId: typeof x.workspaceId === "string" ? x.workspaceId : "",
        name: typeof x.name === "string" ? x.name : "Project",
        order: typeof x.order === "number" ? x.order : 0,
        sessionId,
      }
    }),
  }
}

export const { use: useWorkspace, provider: WorkspaceProvider } = createSimpleContext({
  name: "Workspace",
  init: () => {
    const [store, setStore, _, ready] = persisted(
      { ...target, migrate },
      createStore({
        workspaces: [] as Workspace[],
        projects: [] as Project[],
      }),
    )

    const ensureDefault = () => {
      if (store.workspaces.length > 0) return
      const id = uuid()
      setStore("workspaces", [{ id, name: "Default", order: 0 }])
      return id
    }

    const list = createMemo(() => [...store.workspaces].sort((a, b) => a.order - b.order))
    const projects = (workspaceId: string) =>
      createMemo(() => store.projects.filter((p) => p.workspaceId === workspaceId).sort((a, b) => a.order - b.order))

    const add = (name: string) => {
      const max = store.workspaces.reduce((m, w) => Math.max(m, w.order), -1)
      const id = uuid()
      setStore("workspaces", (prev) => [...prev, { id, name, order: max + 1 }])
      return id
    }

    const remove = (id: string) => {
      setStore("workspaces", (prev) => prev.filter((w) => w.id !== id))
      setStore("projects", (prev) => prev.filter((p) => p.workspaceId !== id))
    }

    const update = (id: string, patch: Partial<Pick<Workspace, "name">>) => {
      const idx = store.workspaces.findIndex((w) => w.id === id)
      if (idx === -1) return
      setStore("workspaces", idx, (prev) => ({ ...prev, ...patch }))
    }

    const reorder = (ids: string[]) => {
      setStore(
        produce((draft) => {
          for (let i = 0; i < ids.length; i++) {
            const w = draft.workspaces.find((x) => x.id === ids[i])
            if (w) w.order = i
          }
        }),
      )
    }

    const addProject = (workspaceId: string, name: string, sessionId: string, projectId?: string, productId?: string) => {
      const list = store.projects.filter((p) => p.workspaceId === workspaceId)
      const max = list.reduce((m, p) => Math.max(m, p.order), -1)
      const id = projectId ?? uuid()
      setStore("projects", (prev) => [...prev, { id, workspaceId, name, order: max + 1, sessionId, productId }])
      return id
    }

    const removeProject = (id: string) => {
      setStore("projects", (prev) => prev.filter((p) => p.id !== id))
    }

    const updateProject = (id: string, patch: Partial<Pick<Project, "name" | "sessionId">>) => {
      const idx = store.projects.findIndex((p) => p.id === id)
      if (idx === -1) return
      setStore("projects", idx, (prev) => ({ ...prev, ...patch }))
    }

    const reorderProjects = (workspaceId: string, ids: string[]) => {
      setStore(
        produce((draft) => {
          for (let i = 0; i < ids.length; i++) {
            const p = draft.projects.find((x) => x.id === ids[i] && x.workspaceId === workspaceId)
            if (p) p.order = i
          }
        }),
      )
    }

    const get = (id: string) => store.workspaces.find((w) => w.id === id)
    const getProject = (id: string) => store.projects.find((p) => p.id === id)

    return {
      ready,
      workspaces: {
        list,
        add,
        remove,
        update,
        reorder,
        get,
        ensureDefault,
      },
      projects: {
        list: projects,
        add: addProject,
        remove: removeProject,
        update: updateProject,
        reorder: reorderProjects,
        get: getProject,
      },
      store: () => store,
    }
  },
})
