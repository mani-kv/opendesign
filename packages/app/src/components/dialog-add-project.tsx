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

export function DialogAddProject(props: {
  workspaceId: string
  onAdded?: (id: string, productId: string) => void
}) {
  const language = useLanguage()
  const workspace = useWorkspace()
  const dialog = useDialog()
  const globalSDK = useGlobalSDK()
  const globalSync = useGlobalSync()
  const [store, setStore] = createStore({ name: "", busy: false })

  const submit = async (e: Event) => {
    e.preventDefault()
    const name = store.name.trim() || "New Feature"
    setStore("busy", true)
    try {
      const products = globalSync.data.project
      if (!products.length) throw new Error("No product available")
      const productID = products[0].id
      const branch = `feature/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`
      const client = globalSDK.createClient({})
      const res = await client.feature.create({ productID, name, branch })
      const feature = res.data
      if (!feature?.id) throw new Error("No feature created")
      workspace.projects.add(props.workspaceId, name, feature.id, feature.id, productID)
      dialog.close()
      props.onAdded?.(feature.id, productID)
    } catch (err) {
      showToast({
        variant: "error",
        title: language.t("error.title"),
        description: err instanceof Error ? err.message : "Failed to create feature",
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
