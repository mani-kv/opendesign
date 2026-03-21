import { createContext, useContext, type Accessor } from "solid-js"
import { useParams } from "@solidjs/router"

export type ProjectScope = {
  projectId: Accessor<string>
  sessionId: Accessor<string | undefined>
  sessionKey: Accessor<string>
}

const ProjectScopeContext = createContext<ProjectScope | null>(null)

export function ProjectScopeProvider(props: {
  projectId: string
  sessionId?: string
  sessionKey: string
  children: import("solid-js").JSX.Element
}) {
  const scope: ProjectScope = {
    projectId: () => props.projectId,
    sessionId: () => props.sessionId,
    sessionKey: () => props.sessionKey,
  }
  return <ProjectScopeContext.Provider value={scope}>{props.children}</ProjectScopeContext.Provider>
}

export function useProjectScope(): ProjectScope {
  const scope = useContext(ProjectScopeContext)
  if (scope) return scope

  const params = useParams()
  return {
    projectId: () => params.projectId ?? "",
    sessionId: () => params.id,
    sessionKey: () => `${params.projectId ?? ""}${params.id ? "/" + params.id : ""}`,
  }
}

export function useProjectParams() {
  const scope = useProjectScope()
  return {
    get projectId() {
      return scope.projectId()
    },
    get id() {
      return scope.sessionId()
    },
  }
}
