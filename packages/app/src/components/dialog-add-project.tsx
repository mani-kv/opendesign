import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useWorkspace } from "@/context/workspace"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { useGlobalSDK } from "@/context/global-sdk"
import { useGlobalSync } from "@/context/global-sync"
import { showToast } from "@opencode-ai/ui/toast"

function projectDir(home: string, projectId: string) {
  const base = home.replace(/[/\\]+$/, "")
  return `${base}/.opendesign/projects/${projectId}`
}

function uuid() {
  return crypto.randomUUID?.() ?? "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16))
}

export function DialogAddProject(props: { workspaceId: string; onAdded?: (id: string) => void }) {
  const language = useLanguage()
  const workspace = useWorkspace()
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [store, setStore] = createStore({ name: "", busy: false })

  const submit = async (e: Event) => {
    e.preventDefault()
    const name = store.name.trim() || "New Project"
    const home = globalSync.data.path.home ?? ""
    if (!home) {
      showToast({ variant: "error", title: language.t("error.title"), description: "Server not ready" })
      return
    }
    setStore("busy", true)
    try {
      const projectId = uuid()
      const dir = projectDir(home, projectId)
      const client = globalSDK.createClient({ directory: dir })
      const res = await client.session.create({ title: name })
      const session = res.data
      if (!session?.id) throw new Error("No session created")
      workspace.projects.add(props.workspaceId, name, session.id, projectId)
      dialog.close()
      props.onAdded?.(projectId)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("error.title"),
        description: err instanceof Error ? err.message : "Failed to create project",
      })
    } finally {
      setStore("busy", false)
    }
  }

  return (
    <Dialog title={language.t("dialog.project.add.title")} class="w-full max-w-md mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-6 p-6 pt-0">
        <TextField
          autofocus
          value={store.name}
          onInput={(e) => setStore("name", (e.target as HTMLInputElement).value)}
          placeholder={language.t("dialog.project.add.placeholder")}
          label={language.t("dialog.project.add.name")}
        />
        <Button type="submit" class="w-auto self-start" disabled={store.busy}>
          {store.busy ? language.t("common.saving") : language.t("common.save")}
        </Button>
      </form>
    </Dialog>
  )
}
