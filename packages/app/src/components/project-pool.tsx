import { createEffect, createMemo, onCleanup } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useNavigate, useParams } from "@solidjs/router"
import { Key } from "@solid-primitives/keyed"
import { useProjectPool } from "@/pool/project-pool-context"
import { ProjectShell } from "./project-shell"
import { useGlobalSync } from "@/context/global-sync"
import { useLayout } from "@/context/layout"
import { decode64 } from "@/utils/base64"
import { dropSessionCaches } from "@/context/global-sync/session-cache"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { DataProvider } from "@opencode-ai/ui/context"
import type { Component, ParentProps } from "solid-js"

function projectDir(home: string, projectId: string) {
  const base = home.replace(/[/\\]+$/, "")
  return `${base}/.opendesign/projects/${projectId}`
}

function resolveDirectory(projectId: string, home: string) {
  return decode64(projectId) ?? projectDir(home, projectId)
}

function parseKey(key: string): { projectId: string; sessionId?: string } {
  const [projectId, sessionId] = key.split("/")
  return { projectId: projectId ?? "", sessionId }
}

function PoolProjectData(props: ParentProps<{ projectId: string; directory: string }>) {
  const navigate = useNavigate()
  const sync = useSync()

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) =>
        navigate(`/project/${props.projectId}/session/${sessionID}`)
      }
      onSessionHref={(sessionID: string) =>
        `/project/${props.projectId}/session/${sessionID}`
      }
    >
      <LocalProvider>{props.children}</LocalProvider>
    </DataProvider>
  )
}

export function ProjectPool(props: { content: Component }) {
  const params = useParams()
  const { pool, keys, setKeys } = useProjectPool()
  const globalSync = useGlobalSync()
  const layout = useLayout()
  const home = () => globalSync.data.path.home ?? "/"

  const sessionKey = createMemo(() => `${params.projectId ?? ""}${params.id ? "/" + params.id : ""}`)
  const activeKey = createMemo(() => sessionKey())

  createEffect(() => {
    const key = sessionKey()
    const { keys: nextKeys, evicted } = key ? pool.activate(key) : pool.activate(undefined)
    setKeys(nextKeys as string[])

    if (key) layout.projectCache.touch(key)

    for (const k of evicted) {
      layout.projectCache.drop([k])
      const { projectId, sessionId } = parseKey(k)
      const dir = resolveDirectory(projectId, home())
      const [store] = globalSync.child(dir, { bootstrap: false })
      if (sessionId) dropSessionCaches(store as Parameters<typeof dropSessionCaches>[0], [sessionId])
    }
  })

  onCleanup(() => {
    setKeys([])
  })

  return (
    <div class="size-full relative">
      <Key each={keys()} by={(k) => k}>
        {(key) => {
          const k = key()
          const { projectId, sessionId } = parseKey(k)
          const dir = resolveDirectory(projectId, home())
          return (
            <ProjectShell
              sessionKey={k}
              directory={dir}
              projectId={projectId}
              sessionId={sessionId}
              active={k === activeKey()}
            >
              <SDKProvider
                directory={() => dir}
                active={() => k === activeKey()}
              >
                <SyncProvider>
                  <PoolProjectData projectId={projectId} directory={dir}>
                    <Dynamic component={props.content} />
                  </PoolProjectData>
                </SyncProvider>
              </SDKProvider>
            </ProjectShell>
          )
        }}
      </Key>
    </div>
  )
}
