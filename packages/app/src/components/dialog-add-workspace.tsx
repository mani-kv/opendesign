import { Button } from "@opencode-ai/ui/button"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useWorkspace } from "@/context/workspace"

export function DialogAddWorkspace(props: { onAdded?: (id: string) => void }) {
  const dialog = useDialog()
  const language = useLanguage()
  const workspace = useWorkspace()
  const [store, setStore] = createStore({ name: "" })

  const submit = (e: Event) => {
    e.preventDefault()
    const name = store.name.trim() || "New Workspace"
    const id = workspace.workspaces.add(name)
    dialog.close()
    props.onAdded?.(id)
  }

  return (
    <Dialog title={language.t("dialog.workspace.add.title")} class="w-full max-w-md mx-auto">
      <form onSubmit={submit} class="flex flex-col gap-6 p-6 pt-0">
        <TextField
          autofocus
          value={store.name}
          onInput={(e) => setStore("name", (e.target as HTMLInputElement).value)}
          placeholder={language.t("dialog.workspace.add.placeholder")}
          label={language.t("dialog.workspace.add.name")}
        />
        <Button type="submit" class="w-auto self-start">
          {language.t("common.save")}
        </Button>
      </form>
    </Dialog>
  )
}
