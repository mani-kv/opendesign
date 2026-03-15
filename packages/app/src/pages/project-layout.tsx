import { createEffect, createMemo, Show, type ParentProps } from "solid-js"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { Splash } from "@opencode-ai/ui/logo"
import { showToast } from "@opencode-ai/ui/toast"
import { useLanguage } from "@/context/language"
import { useWorkspace } from "@/context/workspace"
import { useGlobalSync } from "@/context/global-sync"
import { ProjectPoolProvider } from "@/pool/project-pool-context"
import { ProjectPool } from "@/components/project-pool"
import { CommentsProvider } from "@/context/comments"
import { FileProvider } from "@/context/file"
import { PromptProvider } from "@/context/prompt"
import { TerminalProvider } from "@/context/terminal"
import { Suspense } from "solid-js"
import Session from "@/pages/session"

function projectDir(home: string, projectId: string) {
  const base = home.replace(/[/\\]+$/, "")
  return `${base}/.opendesign/projects/${projectId}`
}

function PoolSessionContent() {
  return (
    <TerminalProvider>
      <FileProvider>
        <PromptProvider>
          <CommentsProvider>
            <Suspense fallback={<div class="size-full" />}>
              <Session />
            </Suspense>
          </CommentsProvider>
        </PromptProvider>
      </FileProvider>
    </TerminalProvider>
  )
}

export default function Layout(props: ParentProps) {
  const params = useParams()
  const location = useLocation()
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

  const isSessionRoute = createMemo(() => location.pathname.includes("/session"))

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

  if (!isSessionRoute()) {
    return <>{props.children}</>
  }

  return (
    <ProjectPoolProvider>
      <ProjectPool content={PoolSessionContent} />
    </ProjectPoolProvider>
  )
}
