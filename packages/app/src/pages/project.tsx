import { createEffect } from "solid-js"
import { useNavigate, useParams } from "@solidjs/router"
import { base64Encode } from "@opencode-ai/util/encode"
import { useGlobalSync } from "@/context/global-sync"
import { useWorkspace } from "@/context/workspace"

export default function ProjectPage() {
  const params = useParams()
  const navigate = useNavigate()
  const workspace = useWorkspace()
  const globalSync = useGlobalSync()

  createEffect(() => {
    const pid = params.projectId
    if (!pid) return
    const proj = workspace.projects.get(pid)
    if (!proj) return
    const home = globalSync.data.path.home ?? "/"
    const base = home.replace(/[/\\]+$/, "")
    const dir = `${base}/.opendesign/projects/${proj.id}`
    const sessionPath = proj.sessionId
      ? `/${base64Encode(dir)}/session/${proj.sessionId}`
      : `/${base64Encode(dir)}/session`
    navigate(sessionPath, { replace: true })
  })

  return null
}
