import { Avatar } from "@opencode-ai/ui/avatar"
import { ContextMenu } from "@opencode-ai/ui/context-menu"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { createSortable } from "@thisbeyond/solid-dnd"
import { Show, type Accessor, type JSX } from "solid-js"
import { createStore } from "solid-js/store"
import { type Workspace } from "@/context/workspace"
import { useLanguage } from "@/context/language"
import { getAvatarColors } from "@/context/layout"

export const WorkspaceDragOverlay = (props: {
  workspaces: Accessor<Workspace[]>
  activeWorkspace: Accessor<string | undefined>
}): JSX.Element => {
  const workspace = () => props.workspaces().find((w) => w.id === props.activeWorkspace())
  return (
    <Show when={workspace()}>
      {(w) => (
        <div class="bg-background-base rounded-xl p-1">
          <div class="relative size-8 rounded overflow-clip">
            <Avatar
              fallback={w().name.slice(0, 1).toUpperCase() || "W"}
              class="size-full rounded"
              {...getAvatarColors("cyan")}
            />
          </div>
        </div>
      )}
    </Show>
  )
}

const WorkspaceTile = (props: {
  workspace: Workspace
  mobile?: boolean
  selected: Accessor<boolean>
  overlay: Accessor<boolean>
  suppressHover: Accessor<boolean>
  onSelect: () => void
  onDelete?: () => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: () => void
  setMenu: (value: boolean) => void
  setSuppressHover: (value: boolean) => void
  language: ReturnType<typeof useLanguage>
}): JSX.Element => {
  const initial = () => props.workspace.name.slice(0, 1).toUpperCase() || "W"
  const placement = () => (props.mobile ? "bottom" : "right")
  const nameTitle = () => props.workspace.name.slice(0, 1).toUpperCase() + props.workspace.name.slice(1)

  return (
    <ContextMenu
      modal={!props.overlay()}
      onOpenChange={(value) => {
        props.setMenu(value)
        props.setSuppressHover(value)
      }}
    >
      <Tooltip
        placement={placement()}
        value={
          <div class="flex flex-col gap-0.5">
            <span class="text-[8px] font-medium uppercase tracking-wide text-text-weak">
              {props.language.t("sidebar.context.workspace")}
            </span>
            <span class="text-12-medium text-text-strong">{nameTitle()}</span>
          </div>
        }
      >
        <ContextMenu.Trigger
          as="button"
          type="button"
          aria-label={props.workspace.name}
          data-action="workspace-switch"
          data-workspace={props.workspace.id}
          classList={{
            "flex items-center justify-center size-10 p-1 rounded-lg overflow-hidden transition-colors cursor-default": true,
            "bg-transparent border-2 border-icon-strong-base hover:bg-surface-base-hover": props.selected(),
            "bg-transparent border border-transparent hover:bg-surface-base-hover hover:border-border-weak-base":
              !props.selected(),
          }}
          onMouseEnter={(e: MouseEvent) => props.onMouseEnter?.(e)}
          onMouseLeave={() => props.onMouseLeave?.()}
          onFocus={() => {
            if (props.suppressHover()) return
            props.onMouseEnter?.({} as MouseEvent)
          }}
          onClick={() => props.onSelect()}
          onBlur={() => {}}
        >
          <div class="relative size-8 shrink-0 rounded overflow-clip">
            <Avatar fallback={initial()} class="size-full rounded" {...getAvatarColors("cyan")} />
          </div>
        </ContextMenu.Trigger>
      </Tooltip>
      <ContextMenu.Portal>
        <ContextMenu.Content>
          <ContextMenu.Item onSelect={() => {}}>
            <ContextMenu.ItemLabel>{props.language.t("common.edit")}</ContextMenu.ItemLabel>
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => props.onDelete?.()}>
            <ContextMenu.ItemLabel>{props.language.t("common.delete")}</ContextMenu.ItemLabel>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu>
  )
}

export const SortableWorkspaceTile = (props: {
  workspace: Workspace
  mobile?: boolean
  selected: Accessor<boolean>
  overlay: Accessor<boolean>
  onSelect: () => void
  onDelete?: () => void
  onMouseEnter?: (event: MouseEvent) => void
  onMouseLeave?: () => void
}): JSX.Element => {
  const [state, setState] = createStore({ menu: false, suppressHover: false })
  const language = useLanguage()
  const sortable = createSortable(props.workspace.id)

  return (
    // @ts-ignore
    <div use:sortable classList={{ "opacity-30": sortable.isActiveDraggable }}>
      <WorkspaceTile
        workspace={props.workspace}
        mobile={props.mobile}
        selected={props.selected}
        overlay={props.overlay}
        suppressHover={() => state.suppressHover}
        onSelect={props.onSelect}
        onDelete={props.onDelete}
        onMouseEnter={props.onMouseEnter}
        onMouseLeave={props.onMouseLeave}
        setMenu={(v) => setState("menu", v)}
        setSuppressHover={(v) => setState("suppressHover", v)}
        language={language}
      />
    </div>
  )
}
