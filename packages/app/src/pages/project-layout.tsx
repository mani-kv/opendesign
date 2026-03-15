import { createEffect, createMemo, Show, type ParentProps } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { SDKProvider } from "@/context/sdk"
import { SyncProvider, useSync } from "@/context/sync"
import { LocalProvider } from "@/context/local"
import { DataProvider } from "@opencode-ai/ui/context"
import { Splash } from "@opencode-ai/ui/logo"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useWorkspace } from "@/context/workspace"
import { useGlobalSync } from "@/context/global-sync"

function projectDir(home: string, projectId: string) {
  const base = home.replace(/[/\\]+$/, "")
  return `${base}/.opendesign/projects/${projectId}`
}

function ProjectDataProvider(props: ParentProps<{ projectId: string; directory: string }>) {
  const navigate = useNavigate()
  const sync = useSync()

  return (
    <DataProvider
      data={sync.data}
      directory={props.directory}
      onNavigateToSession={(sessionID: string) => navigate(`/project/${props.projectId}/session/${sessionID}`)}
      onSessionHref={(sessionID: string) => `/project/${props.projectId}/session/${sessionID}`}
    >
      <LocalProvider>{props.children}</LocalProvider>
    </DataProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const navigate = useNavigate()
  const language = useLanguage()
  const workspace = useWorkspace()
  const globalSync = useGlobalSync()

  const projectId = createMemo(() => params.projectId ?? "")
  const proj = createMemo(() => workspace.projects.get(projectId()))
  const directory = createMemo(() => {
    const home = globalSync.data.path.home ?? "/"
    return projectDir(home, projectId())
  })

  createEffect(() => {
    const pid = projectId()
    if (!pid) return
    if (!workspace.ready()) return
    const p = proj()
    if (!p) {
      showToast({
        variant: "error",
        title: language.t("common.requestFailed"),
        description: language.t("directory.error.invalidUrl"),
      })
      navigate("/", { replace: true })
    }
  })

  if (!workspace.ready()) {
    return (
      <div class="size-full flex flex-col items-center justify-center bg-background-base">
        <Splash class="size-16 opacity-50 animate-pulse" />
      </div>
    )
  }

  const p = proj()
  if (!p) {
    return (
      <div class="size-full flex flex-col items-center justify-center bg-background-base">
        <Splash class="size-16 opacity-50 animate-pulse" />
      </div>
    )
  }

  const dir = directory()
  return (
    <SDKProvider directory={() => dir}>
      <SyncProvider>
        <ProjectDataProvider projectId={p.id} directory={dir}>
          {props.children}
        </ProjectDataProvider>
      </SyncProvider>
    </SDKProvider>
  )
}
