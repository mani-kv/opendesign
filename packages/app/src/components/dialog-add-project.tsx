import { Button } from "@opencode-ai/ui/button"
import { Dialog } from "@opencode-ai/ui/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { createStore } from "solid-js/store"
import { useLanguage } from "@/context/language"
import { useWorkspace } from "@/context/workspace"
import { DialogSelectDirectory } from "./dialog-select-directory"
import { useDialog } from "@opencode-ai/ui/context/dialog"

export function DialogAddProject(props: { workspaceId: string; onAdded?: (id: string) => void }) {
  const language = useLanguage()
  const workspace = useWorkspace()
  const dialog = useDialog()
  const [store, setStore] = createStore({ name: "", linkedDir: undefined as string | undefined })

  const submit = (e: Event) => {
    e.preventDefault()
    const name = store.name.trim() || "New Project"
    const id = workspace.projects.add(props.workspaceId, name, store.linkedDir)
    dialog.close()
    props.onAdded?.(id)
  }

  const pickDirectory = () => {
    dialog.show(() => (
      <DialogSelectDirectory
        onSelect={(result) => {
          const dir = Array.isArray(result) ? result[0] : result
          if (dir) setStore("linkedDir", dir)
        }}
      />
    ))
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
        <div class="flex flex-col gap-2">
          <Button type="button" variant="secondary" onClick={pickDirectory}>
            {store.linkedDir
              ? language.t("dialog.project.add.changeDirectory")
              : language.t("dialog.project.add.linkDirectory")}
          </Button>
          {store.linkedDir && (
            <div class="text-12-regular text-text-weak truncate">{store.linkedDir}</div>
          )}
        </div>
        <Button type="submit" class="w-auto self-start">
          {language.t("common.save")}
        </Button>
      </form>
    </Dialog>
  )
}
