import { Component, For, Match, Show, Switch } from "solid-js"
import { FileIcon } from "@opencode-ai/ui/file-icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { Tooltip } from "@opencode-ai/ui/tooltip"
import { getDirectory, getFilename, getFilenameTruncated } from "@opencode-ai/util/path"
import type { ContextItem } from "@/context/prompt"

type PromptContextItem = ContextItem & { key: string }

type ContextItemsProps = {
  items: PromptContextItem[]
  active: (item: PromptContextItem) => boolean
  openComment: (item: PromptContextItem) => void
  remove: (item: PromptContextItem) => void
  t: (key: string) => string
}

export const PromptContextItems: Component<ContextItemsProps> = (props) => {
  return (
    <Show when={props.items.length > 0}>
      <div class="flex flex-nowrap items-start gap-2 p-2 overflow-x-auto no-scrollbar">
        <For each={props.items}>
          {(item) => (
            <Switch>
              <Match when={item.type === "file" && item} keyed>
                {(fileItem) => {
                  const directory = getDirectory(fileItem.path)
                  const filename = getFilename(fileItem.path)
                  const label = getFilenameTruncated(fileItem.path, 14)
                  const selected = props.active(fileItem)

                  return (
                    <Tooltip
                      value={
                        <span class="flex max-w-[300px]">
                          <span class="text-text-invert-base truncate-start [unicode-bidi:plaintext] min-w-0">
                            {directory}
                          </span>
                          <span class="shrink-0">{filename}</span>
                        </span>
                      }
                      placement="top"
                      openDelay={2000}
                    >
                      <div
                        classList={{
                          "group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover": true,
                          "hover:bg-surface-interactive-weak": !!fileItem.commentID && !selected,
                          "bg-surface-interactive-hover hover:bg-surface-interactive-hover shadow-xs-border-hover":
                            selected,
                          "bg-background-stronger": !selected,
                        }}
                        onClick={() => props.openComment(fileItem)}
                      >
                        <div class="flex items-center gap-1.5">
                          <FileIcon node={{ path: fileItem.path, type: "file" }} class="shrink-0 size-3.5" />
                          <div class="flex items-center text-11-regular min-w-0 font-medium">
                            <span class="text-text-strong whitespace-nowrap">{label}</span>
                            <Show when={fileItem.selection}>
                              {(sel) => (
                                <span class="text-text-weak whitespace-nowrap shrink-0">
                                  {sel().startLine === sel().endLine
                                    ? `:${sel().startLine}`
                                    : `:${sel().startLine}-${sel().endLine}`}
                                </span>
                              )}
                            </Show>
                          </div>
                          <IconButton
                            type="button"
                            icon="close-small"
                            variant="ghost"
                            class="ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.remove(fileItem)
                            }}
                            aria-label={props.t("prompt.context.removeFile")}
                          />
                        </div>
                        <Show when={fileItem.comment}>
                          {(comment) => (
                            <div class="text-12-regular text-text-strong ml-5 pr-1 truncate">{comment()}</div>
                          )}
                        </Show>
                      </div>
                    </Tooltip>
                  )
                }}
              </Match>
              <Match when={item.type === "figma" && item} keyed>
                {(figmaItem) => {
                  const label = () =>
                    figmaItem.nodeName
                      ? figmaItem.nodeName.length > 14
                        ? figmaItem.nodeName.slice(0, 14) + "…"
                        : figmaItem.nodeName
                      : (figmaItem.nodeId ?? "Figma")
                  const subtitle = () => figmaItem.nodeType?.toLowerCase() ?? ""

                  return (
                    <Tooltip
                      value={
                        <span class="flex flex-col max-w-[300px]">
                          <span class="text-text-invert-base">{figmaItem.nodeName ?? figmaItem.nodeId}</span>
                          <Show when={figmaItem.nodeType}>
                            <span class="text-text-invert-weak text-11-regular">{figmaItem.nodeType}</span>
                          </Show>
                        </span>
                      }
                      placement="top"
                      openDelay={2000}
                    >
                      <div class="group shrink-0 flex flex-col rounded-[6px] pl-2 pr-1 py-1 max-w-[200px] h-12 cursor-default transition-all transition-transform shadow-xs-border hover:shadow-xs-border-hover bg-background-stronger">
                        <div class="flex items-center gap-1.5">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="shrink-0">
                            <path d="M8 24c2.2 0 4-1.8 4-4v-4H8c-2.2 0-4 1.8-4 4s1.8 4 4 4z" fill="#0ACF83" />
                            <path d="M4 12c0-2.2 1.8-4 4-4h4v8H8c-2.2 0-4-1.8-4-4z" fill="#A259FF" />
                            <path d="M4 4c0-2.2 1.8-4 4-4h4v8H8C5.8 8 4 6.2 4 4z" fill="#F24E1E" />
                            <path d="M12 0h4c2.2 0 4 1.8 4 4s-1.8 4-4 4h-4V0z" fill="#FF7262" />
                            <path d="M20 12c0 2.2-1.8 4-4 4s-4-1.8-4-4 1.8-4 4-4 4 1.8 4 4z" fill="#1ABCFE" />
                          </svg>
                          <div class="flex items-center text-11-regular min-w-0 font-medium">
                            <span class="text-text-strong whitespace-nowrap">{label()}</span>
                            <Show when={subtitle()}>
                              <span class="text-text-weak whitespace-nowrap shrink-0 ml-1">{subtitle()}</span>
                            </Show>
                          </div>
                          <IconButton
                            type="button"
                            icon="close-small"
                            variant="ghost"
                            class="ml-auto size-3.5 text-text-weak hover:text-text-strong transition-all"
                            onClick={(e) => {
                              e.stopPropagation()
                              props.remove(figmaItem)
                            }}
                            aria-label="Remove Figma selection"
                          />
                        </div>
                      </div>
                    </Tooltip>
                  )
                }}
              </Match>
            </Switch>
          )}
        </For>
      </div>
    </Show>
  )
}
