import { For, Match, Show, Switch, createEffect, createMemo, onCleanup, createSignal, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { createStore } from "solid-js/store"
import { createMediaQuery } from "@solid-primitives/media"
import { useProjectParams } from "@/context/project-scope"
import { Tabs } from "@opencode-ai/ui/tabs"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { Icon } from "@opencode-ai/ui/icon"
import { ResizeHandle } from "@opencode-ai/ui/resize-handle"
import { Mark } from "@opencode-ai/ui/logo"
import { DragDropProvider, DragDropSensors, DragOverlay, SortableProvider, closestCenter } from "@thisbeyond/solid-dnd"
import type { DragEvent } from "@thisbeyond/solid-dnd"
import { ConstrainDragYAxis, getDraggableId } from "@/utils/solid-dnd"
import FileTree from "@/components/file-tree"
import { SessionContextUsage } from "@/components/session-context-usage"
import { SessionContextTab, SortableTab, SortablePaneTab, FileVisual } from "@/components/session"
import { useCommand } from "@/context/command"
import { useFile, type SelectedLineRange } from "@/context/file"
import { useLanguage } from "@/context/language"
import { usePlatform } from "@/context/platform"
import { useLayout } from "@/context/layout"
import { useSync } from "@/context/sync"
import { createFileTabListSync } from "@/pages/session/file-tab-scroll"
import { FileTabContent } from "@/pages/session/file-tabs"
import { FigmaTabContent } from "@/pages/session/figma-tab-content"
import { CanvasTabContent } from "@/pages/session/canvas-tab-content"
import { triggerCanvasResize } from "@/utils/canvas-bridge"
import { createBodyResizing, createOpenSessionFileTab, getTabReorderIndex, type Sizing } from "@/pages/session/helpers"
import { setSessionHandoff } from "@/pages/session/handoff"

function CanvasFigmaEmpty() {
  const language = useLanguage()
  return (
    <div class="h-full px-6 pb-24 flex flex-col items-center justify-center gap-6">
      <Mark class="w-14 opacity-10" />
      <div class="text-14-regular text-text-weak max-w-56 text-center">
        {language.t("session.files.selectToOpen")}
      </div>
    </div>
  )
}

function SplitPaneContent(props: {
  pane: string
}) {
  const language = useLanguage()
  const platform = usePlatform()
  return (
    <Switch>
      <Match when={props.pane === "canvas"}>
        <Tabs value="canvas">
          <div class="sticky top-0 z-10 shrink-0 flex items-center border-b border-border-weaker-base">
            <Tabs.List class="min-w-0 w-fit">
              <SortablePaneTab pane="canvas">
                {language.t("session.tab.canvas")}
              </SortablePaneTab>
            </Tabs.List>
          </div>
          <Tabs.Content value="canvas" class="relative flex flex-col flex-1 min-h-0 overflow-hidden contain-strict pointer-events-none">
            <div class="absolute inset-0" aria-hidden />
          </Tabs.Content>
        </Tabs>
      </Match>
      <Match when={props.pane === "figma"}>
        <Tabs value="figma">
          <div class="sticky top-0 z-10 shrink-0 flex items-center border-b border-border-weaker-base">
            <Tabs.List class="min-w-0 w-fit">
              <SortablePaneTab pane="figma">
                {language.t("session.tab.figma")}
              </SortablePaneTab>
            </Tabs.List>
          </div>
          <Tabs.Content value="figma" class="relative flex flex-col flex-1 min-h-0 overflow-hidden contain-strict">
            <div class="relative flex-1 min-h-0 overflow-hidden">
              {platform.platform === "web" ? (
                <div class="absolute inset-0">
                  <FigmaTabContent />
                </div>
              ) : (
                <div class="absolute inset-0 pointer-events-none" aria-hidden />
              )}
            </div>
          </Tabs.Content>
        </Tabs>
      </Match>
    </Switch>
  )
}

function CanvasFigmaSplit(props: {
  size: { start: () => void; touch: () => void }
}) {
  const layout = useLayout()
  const paneOrder = () => layout.canvasPanel.paneOrder()
  const splitRatio = () => layout.canvasPanel.splitRatio()
  const setSplitRatio = (r: number) => layout.canvasPanel.setSplitRatio(r)
  const [containerRef, setContainerRef] = createSignal<HTMLDivElement | undefined>(undefined)
  const [width, setWidth] = createSignal(400)

  createEffect(() => {
    const el = containerRef()
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width))
    observer.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => observer.disconnect()
  })

  const leftSize = () => Math.round(width() * splitRatio())
  const minPane = 120
  const maxLeft = () => Math.max(minPane, width() - minPane)

  return (
    <SortableProvider ids={paneOrder()}>
      <div ref={setContainerRef} class="relative flex-1 flex min-h-0 min-w-0">
        <div
          class="relative flex flex-col min-h-0 shrink-0 overflow-hidden"
          style={{ width: `${leftSize()}px` }}
        >
          <SplitPaneContent
            pane={paneOrder()[0]}
          />
        </div>
        <div class="relative w-px shrink-0 flex items-stretch" onPointerDown={() => props.size.start()}>
          <div class="pointer-events-none absolute inset-y-0 left-0 w-px bg-border-weaker-base" aria-hidden />
          <ResizeHandle
            direction="horizontal"
            edge="end"
            size={leftSize()}
            min={minPane}
            max={maxLeft()}
            onResize={(px) => {
              props.size.touch()
              setSplitRatio(px / width())
            }}
          />
        </div>
        <div class="relative flex-1 flex flex-col min-h-0 min-w-0">
          <SplitPaneContent
            pane={paneOrder()[1]}
          />
        </div>
      </div>
    </SortableProvider>
  )
}

function CanvasHost(props: { active: boolean; splitOffset?: number; canvasFirst?: boolean }) {
  let hostRef: HTMLDivElement | undefined
  createEffect(() => {
    if (!hostRef) return
    const ro = new ResizeObserver(() => triggerCanvasResize())
    ro.observe(hostRef)
    onCleanup(() => ro.disconnect())
  })

  const offset = () => props.splitOffset ?? 0

  // Use left+width only (never right) to avoid CSS over-constraint:
  // when left+right+width are all set, `right` is silently ignored in LTR.
  const left = () => {
    if (offset() > 0 && !props.canvasFirst) return `calc(${offset() * 100}% + 1px)`
    return "0"
  }
  const width = () => {
    if (offset() > 0) {
      if (props.canvasFirst) return `${offset() * 100}%`
      return `calc(${(1 - offset()) * 100}% - 1px)`
    }
    return "100%"
  }

  return (
    <div
      ref={hostRef}
      class="absolute overflow-hidden"
      style={{
        top: "var(--tabs-bar-height, 48px)",
        left: left(),
        width: width(),
        bottom: "0",
        // z-index:2 when active → above Tabs (which has opaque background-stronger)
        // z-index:-1 when inactive → behind everything so figma/other tabs show through
        "z-index": props.active ? 2 : -1,
        "pointer-events": props.active ? "auto" : "none",
      }}
    >
      <div class="absolute inset-0 w-full h-full">
        <CanvasTabContent />
      </div>
    </div>
  )
}

function FigmaWebviewHost(props: { active: boolean; splitOffset?: number; figmaFirst?: boolean }) {
  const offset = () => props.splitOffset ?? 0
  const resizing = createBodyResizing()
  return (
    <div
      class="absolute overflow-hidden"
      style={{
        top: "var(--tabs-bar-height, 48px)",
        left: props.figmaFirst ? "0" : offset() > 0 ? `calc(${offset() * 100}% + 1px)` : "0",
        right: props.figmaFirst && offset() > 0 ? `calc(${(1 - offset()) * 100}%)` : "0",
        bottom: "0",
        "z-index": props.active ? 1 : -1,
        "pointer-events": props.active ? "auto" : "none",
      }}
    >
      <div class="absolute inset-0">
        <FigmaTabContent />
      </div>
      <Show when={resizing()}>
        <div class="absolute inset-0 z-10 bg-background-base/10" />
      </Show>
    </div>
  )
}

function FloatingPromptDock(props: {
  boundaryRef?: () => HTMLElement | undefined
  children: JSX.Element
}) {
  const language = useLanguage()
  const [pos, setPos] = createSignal<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = createSignal(false)
  const [hovered, setHovered] = createSignal(false)
  const [focused, setFocused] = createSignal(false)
  const [container, setContainer] = createSignal<HTMLDivElement | undefined>(undefined)
  const [prompt, setPrompt] = createSignal<HTMLDivElement | undefined>(undefined)
  const [start, setStart] = createSignal<{ clientX: number; clientY: number; elLeft: number; elTop: number } | undefined>(
    undefined
  )

  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val))

  const getBoundary = () => props.boundaryRef?.() ?? container()

  const onHandleDown = (e: MouseEvent) => {
    e.preventDefault()
    const el = prompt()
    const cont = getBoundary()
    if (!el || !cont) return
    const rect = el.getBoundingClientRect()
    const contRect = cont.getBoundingClientRect()
    setStart({
      clientX: e.clientX,
      clientY: e.clientY,
      elLeft: rect.left - contRect.left,
      elTop: rect.top - contRect.top,
    })
    document.body.dataset.resizing = ""
    setDragging(true)
  }

  createEffect(() => {
    if (!dragging()) return
    const move = (e: MouseEvent) => {
      e.preventDefault()
      const s = start()
      const cont = getBoundary()
      const el = prompt()
      if (!s || !cont || !el) return
      const contRect = cont.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const dx = e.clientX - s.clientX
      const dy = e.clientY - s.clientY
      let x = s.elLeft + dx
      let y = s.elTop + dy
      x = clamp(x, 16, contRect.width - elRect.width - 16)
      y = clamp(y, 16, contRect.height - elRect.height - 16)
      setPos({ x, y })
    }
    const up = () => {
      delete document.body.dataset.resizing
      setDragging(false)
      setStart(undefined)
    }
    document.addEventListener("mousemove", move)
    document.addEventListener("mouseup", up, { once: true })
    onCleanup(() => {
      document.removeEventListener("mousemove", move)
    })
  })

  const content = (
    <div
      ref={setContainer}
      class="pointer-events-none absolute inset-0 z-20"
      classList={{ "cursor-grabbing": dragging() }}
    >
      <div
        ref={setPrompt}
        class="pointer-events-auto w-full max-w-[600px] h-fit px-2 pb-5 rounded-lg overflow-hidden flex flex-col group"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusIn={() => setFocused(true)}
        onFocusOut={() => setFocused(false)}
        style={
          pos()
            ? { position: "absolute" as const, left: `${pos()!.x}px`, top: `${pos()!.y}px` }
            : {
                position: "absolute" as const,
                left: "50%",
                bottom: "1rem",
                transform: "translateX(-50%)",
              }
        }
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={language.t("prompt.dock.dragLabel")}
          class="flex items-center justify-center w-full px-0 pt-3 pb-[18px] rounded-t-[20px] mb-[-10px] cursor-grab active:cursor-grabbing touch-none select-none transition-opacity bg-[linear-gradient(25deg,rgba(123,234,203,0.1)_0%,rgba(66,185,209,0.2)_25%,rgba(213,209,93,0.1)_100%)] backdrop-blur-[12px]"
          classList={{
            "opacity-0": !dragging() && !hovered() && !focused(),
            "opacity-100 cursor-grabbing": dragging(),
          }}
          onMouseDown={onHandleDown}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.preventDefault()
          }}
        >
          <div class="flex items-center justify-center gap-1 text-[#6b6b6b]">
            <Icon name="grip-vertical" size="small" class="size-4" />
            <span class="text-12-regular">{language.t("prompt.dock.dragMe")}</span>
            <Icon name="grip-vertical" size="small" class="size-4" />
          </div>
        </div>
        <div class="flex-1">{props.children}</div>
      </div>
    </div>
  )

  const boundary = props.boundaryRef?.()
  if (boundary) {
    return <Portal mount={boundary}>{content}</Portal>
  }
  return content
}

export function SessionSidePanel(props: {
  floatingDockBoundary?: () => HTMLElement | undefined
  floatingPrompt?: () => JSX.Element
  activeDiff?: string
  focusReviewDiff: (path: string) => void
  reviewSnap: boolean
  size: Sizing
}) {
  const params = useProjectParams()
  const layout = useLayout()
  const sync = useSync()
  const file = useFile()
  const language = useLanguage()
  const command = useCommand()
  const platform = usePlatform()

  const isDesktop = createMediaQuery("(min-width: 768px)")
  const sessionKey = createMemo(() => `${params.projectId}${params.id ? "/" + params.id : ""}`)
  const tabs = createMemo(() => layout.tabs(sessionKey))
  const view = createMemo(() => layout.view(sessionKey))
  const panes = () => layout.canvasPanel.panes()
  const splitMode = () => layout.canvasPanel.layout() === "split"

  const reviewOpen = createMemo(() => isDesktop() && view().reviewPanel.opened())
  const fileOpen = createMemo(() => isDesktop() && layout.fileTree.opened())
  const open = createMemo(() => reviewOpen() || fileOpen())
  const shouldFill = createMemo(() => open() && reviewOpen() && !layout.agents.opened())
  const canvasTab = createMemo(() => isDesktop() && panes().canvas)
  const figmaTab = createMemo(() => isDesktop() && panes().figma)
  const bothClosed = createMemo(() => isDesktop() && !panes().canvas && !panes().figma)
  const visiblePaneTabs = createMemo(() =>
    layout.canvasPanel.paneOrder().filter((p) => panes()[p] && isDesktop()),
  )
  const panelWidth = createMemo(() => {
    if (!open()) return "0px"
    if (shouldFill()) return undefined
    if (reviewOpen()) return `calc(100% - ${layout.agents.width()}px)`
    return `${layout.fileTree.width()}px`
  })
  const treeWidth = createMemo(() => (fileOpen() ? `${layout.fileTree.width()}px` : "0px"))

  const info = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const diffs = createMemo(() => (params.id ? (sync.data.session_diff[params.id] ?? []) : []))
  const reviewCount = createMemo(() => Math.max(info()?.summary?.files ?? 0, diffs().length))
  const hasReview = createMemo(() => reviewCount() > 0)
  const diffsReady = createMemo(() => {
    const id = params.id
    if (!id) return true
    if (!hasReview()) return true
    return sync.data.session_diff[id] !== undefined
  })

  const reviewEmptyKey = createMemo(() => {
    if (sync.project && !sync.project.vcs) return "session.review.noVcs"
    if (sync.data.config.snapshot === false) return "session.review.noSnapshot"
    return "session.review.noChanges"
  })

  const diffFiles = createMemo(() => diffs().map((d) => d.file))
  const kinds = createMemo(() => {
    const merge = (a: "add" | "del" | "mix" | undefined, b: "add" | "del" | "mix") => {
      if (!a) return b
      if (a === b) return a
      return "mix" as const
    }

    const normalize = (p: string) => p.replaceAll("\\\\", "/").replace(/\/+$/, "")

    const out = new Map<string, "add" | "del" | "mix">()
    for (const diff of diffs()) {
      const file = normalize(diff.file)
      const kind = diff.status === "added" ? "add" : diff.status === "deleted" ? "del" : "mix"

      out.set(file, kind)

      const parts = file.split("/")
      for (const [idx] of parts.slice(0, -1).entries()) {
        const dir = parts.slice(0, idx + 1).join("/")
        if (!dir) continue
        out.set(dir, merge(out.get(dir), kind))
      }
    }
    return out
  })

  const empty = (msg: string) => (
    <div class="h-full flex flex-col">
      <div class="h-6 shrink-0" aria-hidden />
      <div class="flex-1 pb-64 flex items-center justify-center text-center">
        <div class="text-12-regular text-text-weak">{msg}</div>
      </div>
    </div>
  )

  const nofiles = createMemo(() => {
    const state = file.tree.state("")
    if (!state?.loaded) return false
    return file.tree.children("").length === 0
  })

  const normalizeTab = (tab: string) => {
    if (!tab.startsWith("file://")) return tab
    return file.tab(tab)
  }

  const openReviewPanel = () => {
    if (!view().reviewPanel.opened()) view().reviewPanel.open()
  }

  const openTab = createOpenSessionFileTab({
    normalizeTab,
    openTab: tabs().open,
    pathFromTab: file.pathFromTab,
    loadFile: file.load,
    openReviewPanel,
    setActive: tabs().setActive,
  })

  const contextOpen = createMemo(() => tabs().active() === "context" || tabs().all().includes("context"))
  const openedTabs = createMemo(() =>
    tabs()
      .all()
      .filter((tab) => tab !== "context" && tab !== "canvas" && tab !== "figma"),
  )

  const activeTab = createMemo(() => {
    const active = tabs().active()
    if (active === "context") return "context"
    if (active === "canvas" && canvasTab()) return "canvas"
    if (active === "figma" && figmaTab()) return "figma"
    if (active && file.pathFromTab(active)) return normalizeTab(active)

    const first = openedTabs()[0]
    if (first) return first
    if (contextOpen()) return "context"
    if (canvasTab()) return "canvas"
    if (figmaTab()) return "figma"
    return "empty"
  })

  const activeFileTab = createMemo(() => {
    const active = activeTab()
    if (!openedTabs().includes(active)) return
    return active
  })

  const fileTreeTab = () => layout.fileTree.tab()

  const setFileTreeTabValue = (value: string) => {
    if (value !== "changes" && value !== "all") return
    layout.fileTree.setTab(value)
  }

  const [store, setStore] = createStore({
    activeDraggable: undefined as string | undefined,
  })

  const handleDragStart = (event: unknown) => {
    const id = getDraggableId(event)
    if (!id) return
    setStore("activeDraggable", id)
  }

  const isPaneTab = (id: string) => id === "canvas" || id === "figma"

  const handleDragOver = (event: DragEvent) => {
    const { draggable, droppable } = event
    if (!draggable || !droppable) return

    const dragId = draggable.id.toString()
    const dropId = droppable.id.toString()

    if (isPaneTab(dragId) && isPaneTab(dropId) && dragId !== dropId) {
      layout.canvasPanel.swapPaneOrder()
      return
    }

    if (isPaneTab(dragId) || isPaneTab(dropId)) return

    const currentTabs = tabs().all()
    const toIndex = getTabReorderIndex(currentTabs, dragId, dropId)
    if (toIndex === undefined) return
    tabs().move(dragId, toIndex)
  }

  const handleDragEnd = () => {
    setStore("activeDraggable", undefined)
  }

  createEffect(() => {
    if (!file.ready()) return

    setSessionHandoff(sessionKey(), {
      files: tabs()
        .all()
        .reduce<Record<string, SelectedLineRange | null>>((acc, tab) => {
          const path = file.pathFromTab(tab)
          if (!path) return acc

          const selected = file.selectedLines(path)
          acc[path] =
            selected && typeof selected === "object" && "start" in selected && "end" in selected
              ? (selected as SelectedLineRange)
              : null

          return acc
        }, {}),
    })
  })

  return (
    <Show when={isDesktop()}>
      <aside
        id="canvas-panel"
        aria-label={language.t("session.panel.reviewAndFiles")}
        aria-hidden={!open()}
        inert={!open()}
        class="relative min-w-0 h-full flex overflow-hidden bg-background-base"
        classList={{
          "flex-1": shouldFill(),
          "shrink-0": !shouldFill(),
          "pointer-events-none": !open(),
          "transition-[width] duration-[240ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
            !props.size.active() && !props.reviewSnap && !shouldFill(),
        }}
        style={{ width: panelWidth() }}
      >
        <div class="size-full flex border-l border-border-weaker-base">
          <div
            aria-hidden={!reviewOpen()}
            inert={!reviewOpen()}
            class="relative min-w-0 h-full flex-1 overflow-hidden bg-background-base"
            classList={{
              "pointer-events-none": !reviewOpen(),
            }}
          >
            <div class="relative size-full min-w-0 min-h-0 flex flex-col overflow-hidden bg-background-base">
              <div class="relative min-h-0 flex-1 overflow-hidden flex flex-col">
              <DragDropProvider
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                collisionDetector={closestCenter}
              >
                <DragDropSensors />
                <ConstrainDragYAxis />
                <div class="relative flex-1 flex min-h-0 min-w-0 flex-col">
                <Switch>
                  <Match when={splitMode() && panes().canvas && panes().figma}>
                    <CanvasFigmaSplit
                      size={props.size}
                    />
                  </Match>
                  <Match when={true}>
                <Tabs value={activeTab()} onChange={openTab}>
                  <div class="sticky top-0 z-10 shrink-0 flex items-center border-b border-border-weaker-base">
                    <Tabs.List
                      ref={(el: HTMLDivElement) => {
                        const stop = createFileTabListSync({ el, contextOpen })
                        onCleanup(stop)
                      }}
                      class="min-w-0 w-fit"
                    >
                      <SortableProvider ids={visiblePaneTabs()}>
                        <For each={visiblePaneTabs()}>
                          {(pane) => (
                            <SortablePaneTab pane={pane}>
                              <Switch>
                                <Match when={pane === "canvas"}>
                                  {language.t("session.tab.canvas")}
                                </Match>
                                <Match when={pane === "figma"}>
                                  {language.t("session.tab.figma")}
                                </Match>
                              </Switch>
                            </SortablePaneTab>
                          )}
                        </For>
                      </SortableProvider>
                      <Show when={contextOpen()}>
                        <Tabs.Trigger
                          value="context"
                          closeButton={
                            <TooltipKeybind
                              title={language.t("common.closeTab")}
                              keybind={command.keybind("tab.close")}
                              placement="bottom"
                              gutter={10}
                            >
                              <IconButton
                                icon="close-small"
                                variant="ghost"
                                class="h-5 w-5"
                                onClick={() => tabs().close("context")}
                                aria-label={language.t("common.closeTab")}
                              />
                            </TooltipKeybind>
                          }
                          hideCloseButton
                          onMiddleClick={() => tabs().close("context")}
                        >
                          <div class="flex items-center gap-2">
                            <SessionContextUsage variant="indicator" />
                            <div>{language.t("session.tab.context")}</div>
                          </div>
                        </Tabs.Trigger>
                      </Show>
                      <SortableProvider ids={openedTabs()}>
                        <For each={openedTabs()}>{(tab) => <SortableTab tab={tab} onTabClose={tabs().close} />}</For>
                      </SortableProvider>
                    </Tabs.List>
                  </div>

                      <Show when={canvasTab()}>
                        <Tabs.Content value="canvas" class="relative flex flex-col h-full overflow-hidden contain-strict pointer-events-none">
                          <div class="absolute inset-0" aria-hidden />
                        </Tabs.Content>
                      </Show>

                      <Show when={figmaTab()}>
                        <Tabs.Content value="figma" class="relative flex flex-col h-full overflow-hidden contain-strict">
                          {platform.platform === "web" ? (
                            <FigmaTabContent />
                          ) : (
                            /* Desktop: persistent FigmaWebviewHost shows through this transparent placeholder */
                            <div class="size-full pointer-events-none" aria-hidden />
                          )}
                        </Tabs.Content>
                      </Show>

                      <Tabs.Content value="empty" class="flex flex-col h-full overflow-hidden contain-strict">
                        <Show when={activeTab() === "empty"}>
                          <Switch>
                            <Match when={bothClosed()}>
                              <CanvasFigmaEmpty />
                            </Match>
                            <Match when={true}>
                              <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                                <div class="h-full px-6 pb-42 -mt-4 flex flex-col items-center justify-center text-center gap-6">
                                  <Mark class="w-14 opacity-10" />
                                  <div class="text-14-regular text-text-weak max-w-56">
                                    {language.t("session.files.selectToOpen")}
                                  </div>
                                </div>
                              </div>
                            </Match>
                          </Switch>
                        </Show>
                      </Tabs.Content>

                      <Show when={contextOpen()}>
                        <Tabs.Content value="context" class="flex flex-col h-full overflow-hidden contain-strict">
                          <Show when={activeTab() === "context"}>
                            <div class="relative pt-2 flex-1 min-h-0 overflow-hidden">
                              <SessionContextTab />
                            </div>
                          </Show>
                        </Tabs.Content>
                      </Show>

                      <Show when={activeFileTab()} keyed>
                        {(tab) => <FileTabContent tab={tab} />}
                      </Show>
                </Tabs>
                  </Match>
                </Switch>
                </div>
                <DragOverlay>
                  <Show when={store.activeDraggable} keyed>
                    {(tab) => {
                      if (tab === "canvas" || tab === "figma") {
                        return (
                          <div data-component="tabs-drag-preview">
                            <span class="text-14-medium">
                              {tab === "canvas" ? language.t("session.tab.canvas") : language.t("session.tab.figma")}
                            </span>
                          </div>
                        )
                      }
                      const path = createMemo(() => file.pathFromTab(tab))
                      return (
                        <div data-component="tabs-drag-preview">
                          <Show when={path()}>{(p) => <FileVisual active path={p()} />}</Show>
                        </div>
                      )
                    }}
                  </Show>
                </DragOverlay>
              </DragDropProvider>
              </div>
              {/* Persistent canvas host — survives split↔tabbed switches. */}
              <Show when={canvasTab()}>
                <CanvasHost
                  active={
                    splitMode() && panes().canvas
                      ? true
                      : activeTab() === "canvas"
                  }
                  splitOffset={
                    splitMode() && panes().canvas && panes().figma
                      ? layout.canvasPanel.splitRatio()
                      : 0
                  }
                  canvasFirst={
                    splitMode() && panes().canvas && panes().figma
                      && layout.canvasPanel.paneOrder()[0] === "canvas"
                  }
                />
              </Show>
              {/* Persistent figma webview host — same pattern as CanvasHost. */}
              <Show when={figmaTab() && platform.platform !== "web"}>
                <FigmaWebviewHost
                  active={
                    splitMode() && panes().figma
                      ? true
                      : activeTab() === "figma"
                  }
                  splitOffset={
                    splitMode() && panes().canvas && panes().figma
                      ? layout.canvasPanel.splitRatio()
                      : 0
                  }
                  figmaFirst={
                    splitMode() && panes().canvas && panes().figma
                      && layout.canvasPanel.paneOrder()[0] === "figma"
                  }
                />
              </Show>
              <Show when={props.floatingPrompt && reviewOpen()}>
                <FloatingPromptDock boundaryRef={props.floatingDockBoundary}>
                  {props.floatingPrompt?.()}
                </FloatingPromptDock>
              </Show>
            </div>
          </div>

          <div
            id="file-tree-panel"
            aria-hidden={!fileOpen()}
            inert={!fileOpen()}
            class="relative min-w-0 h-full shrink-0 overflow-hidden"
            classList={{
              "pointer-events-none": !fileOpen(),
              "transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width] motion-reduce:transition-none":
                !props.size.active(),
            }}
            style={{ width: treeWidth() }}
          >
            <div
              class="h-full flex flex-col overflow-hidden group/filetree"
              classList={{ "border-l border-border-weaker-base": reviewOpen() }}
            >
              <Tabs
                variant="pill"
                value={fileTreeTab()}
                onChange={setFileTreeTabValue}
                class="h-full"
                data-scope="filetree"
              >
                <Tabs.List>
                  <Tabs.Trigger value="changes" class="flex-1" classes={{ button: "w-full" }}>
                    {reviewCount()}{" "}
                    {language.t(reviewCount() === 1 ? "session.review.change.one" : "session.review.change.other")}
                  </Tabs.Trigger>
                  <Tabs.Trigger value="all" class="flex-1" classes={{ button: "w-full" }}>
                    {language.t("session.files.all")}
                  </Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="changes" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={hasReview()}>
                      <Show
                        when={diffsReady()}
                        fallback={
                          <div class="px-2 py-2 text-12-regular text-text-weak">
                            {language.t("common.loading")}
                            {language.t("common.loading.ellipsis")}
                          </div>
                        }
                      >
                        <FileTree
                          path=""
                          class="pt-3"
                          allowed={diffFiles()}
                          kinds={kinds()}
                          draggable={false}
                          active={props.activeDiff}
                          onFileClick={(node) => props.focusReviewDiff(node.path)}
                        />
                      </Show>
                    </Match>
                    <Match when={true}>
                      {empty(
                        language.t(sync.project && !sync.project.vcs ? "session.review.noChanges" : reviewEmptyKey()),
                      )}
                    </Match>
                  </Switch>
                </Tabs.Content>
                <Tabs.Content value="all" class="bg-background-stronger px-3 py-0">
                  <Switch>
                    <Match when={nofiles()}>{empty(language.t("session.files.empty"))}</Match>
                    <Match when={true}>
                      <FileTree
                        path=""
                        class="pt-3"
                        modified={diffFiles()}
                        kinds={kinds()}
                        onFileClick={(node) => openTab(file.tab(node.path))}
                      />
                    </Match>
                  </Switch>
                </Tabs.Content>
              </Tabs>
            </div>
            <Show when={fileOpen()}>
              <div onPointerDown={() => props.size.start()}>
                <ResizeHandle
                  direction="horizontal"
                  edge="start"
                  size={layout.fileTree.width()}
                  min={200}
                  max={480}
                  collapseThreshold={160}
                  onResize={(width) => {
                    props.size.touch()
                    layout.fileTree.resize(width)
                  }}
                  onCollapse={layout.fileTree.close}
                />
              </div>
            </Show>
          </div>
        </div>
      </aside>
    </Show>
  )
}
