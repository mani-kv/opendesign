import { createContext, useContext, type ParentProps } from "solid-js"
import { ProjectScopeProvider } from "@/context/project-scope"

const ActiveContext = createContext<() => boolean>(() => true)

type Props = ParentProps<{
  sessionKey: string
  directory: string
  projectId: string
  sessionId?: string
  active: boolean
  children: import("solid-js").JSX.Element
}>

export function useProjectActive() {
  return useContext(ActiveContext) ?? (() => true)
}

export function ProjectShell(props: Props) {
  const active = () => props.active
  return (
    <ActiveContext.Provider value={active}>
    <div
      aria-hidden={!props.active}
      inert={props.active ? undefined : true}
      style={{
        position: "absolute",
        inset: 0,
        "pointer-events": props.active ? "auto" : "none",
        "z-index": props.active ? 1 : 0,
        // contain:strict tells the browser this subtree is isolated for
        // layout/paint/style — safe because all shells are fixed-size (inset:0).
        // DO NOT use visibility:hidden, display:none, opacity:0, or
        // content-visibility:hidden — all cause Electron webview GC/detach.
        contain: "strict",
      }}
    >
      <ProjectScopeProvider
        projectId={props.projectId}
        sessionId={props.sessionId}
        sessionKey={props.sessionKey}
      >
        {props.children}
      </ProjectScopeProvider>
    </div>
    </ActiveContext.Provider>
  )
}
