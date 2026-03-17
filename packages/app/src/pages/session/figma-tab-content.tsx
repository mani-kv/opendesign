import { createMemo, createSignal, onCleanup, onMount, Show, untrack } from "solid-js"
import { useProjectParams } from "@/context/project-scope"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { usePlatform } from "@/context/platform"
import { buildFigmaEmbedUrl, parseFigmaUrl } from "@/utils/figma"
import { createBodyResizing } from "@/pages/session/helpers"

const FIGMA_ORIGIN = "https://www.figma.com"

function isFigmaUrl(url: string) {
  try {
    const u = new URL(url)
    return u.origin === FIGMA_ORIGIN || u.hostname.endsWith(".figma.com")
  } catch {
    return false
  }
}

export function FigmaTabContent() {
  const params = useProjectParams()
  const platform = usePlatform()
  const lang = useLanguage()
  const layout = useLayout()
  const sessionKey = createMemo(() => `${params.projectId}${params.id ? "/" + params.id : ""}`)
  const figma = createMemo(() => layout.view(sessionKey()).figma)
  const embedSrc = createMemo(() => {
    const url = figma().url()
    const parsed = parseFigmaUrl(url)
    return parsed ? buildFigmaEmbedUrl(parsed.key, parsed.type) : null
  })
  const resizing = createBodyResizing()

  onMount(() => {
    if (platform.openFigmaWindow) {
      void platform.openFigmaWindow()
    }
  })

  // Tauri: openFigmaWindow opens a separate window; show placeholder
  if (platform.openFigmaWindow) {
    return (
      <div class="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p class="text-14-regular text-text-weak">
          Figma opened in a separate window. Use it to browse and edit your designs.
        </p>
      </div>
    )
  }

  // Web: embed placeholder + input, iframe when URL valid (persisted per session)
  if (platform.platform === "web") {
    return (
      <div class="absolute inset-0 flex flex-col overflow-hidden">
        <div class="shrink-0 flex flex-col gap-2 px-3 pt-2 pb-3 border-b border-border-default">
          <label for="figma-url" class="text-12-regular text-text-weak">
            {lang.t("session.figma.pasteUrl")}
          </label>
          <input
            id="figma-url"
            type="url"
            value={figma().url()}
            onInput={(e) => {
              const v = e.currentTarget.value
              figma().setUrl(v)
            }}
            placeholder="https://www.figma.com/design/..."
            class="text-14-regular rounded-md border border-border-default bg-bg-default px-3 py-2 text-text focus:border-focus-ring focus:outline-none focus:ring-1 focus:ring-focus-ring"
          />
        </div>
        <div class="relative flex-1 min-h-0 overflow-hidden">
          {embedSrc() ? (
            <iframe
              src={embedSrc()!}
              class="size-full border-0"
              title="Figma embed"
              allowfullscreen
            />
          ) : (
            <div class="flex h-full items-center justify-center p-6 text-center">
              <p class="text-14-regular text-text-weak">Enter a Figma design, file, prototype, or board URL above.</p>
            </div>
          )}
          <Show when={resizing()}>
            <div class="absolute inset-0 z-10 bg-background-base/10" />
          </Show>
        </div>
      </div>
    )
  }

  // Electron: inline webview. Per-project URL, shared auth (partition).
  // src only updates when sessionKey changes (project switch), not when we save from did-navigate.
  const src = createMemo(() => {
    sessionKey()
    return untrack(() => {
      const u = figma().url()
      return (u && isFigmaUrl(u)) ? u : FIGMA_ORIGIN
    })
  })

  // Show skeleton only for the initial load. Once the webview has loaded once,
  // never show the skeleton again — in-page navigation and visibility toggles
  // should not flash a loading state.
  const [loaded, setLoaded] = createSignal(false)

  const saveUrl = (u: string) => {
    if (u && isFigmaUrl(u)) figma().setUrl(u)
  }

  const saveFromEl = (el: HTMLWebViewElement) => {
    try {
      const w = el as unknown as { getURL?(): string }
      const u = w.getURL?.()
      if (u) saveUrl(u)
    } catch {
      /* ignore */
    }
  }

  return (
    <div class="absolute inset-0 overflow-hidden">
      <webview
        ref={(el) => {
          if (!el) return
          const handleNav = (e: Event & { url?: string }) => {
            if (e.url) saveUrl(e.url)
            else saveFromEl(el)
          }
          const save = () => saveFromEl(el)
          const onStop = () => setLoaded(true)
          el.addEventListener("did-stop-loading", onStop)
          el.addEventListener("did-navigate", handleNav)
          el.addEventListener("did-navigate-in-page", handleNav)
          onCleanup(() => {
            save()
            el.removeEventListener("did-stop-loading", onStop)
            el.removeEventListener("did-navigate", handleNav)
            el.removeEventListener("did-navigate-in-page", handleNav)
          })
        }}
        src={src()}
        partition="persist:figma"
        class="size-full border-0"
        allowpopups
        data-figma-webview
      />
      <Show when={!loaded()}>
        <div
          class="absolute inset-0 z-10 flex flex-col gap-4 bg-background-base p-6"
          aria-hidden
        >
          <div class="flex gap-2">
            <div class="h-8 w-24 rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
            <div class="h-8 w-32 rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
            <div class="h-8 w-16 rounded-md bg-surface-raised-base opacity-60 animate-pulse" />
          </div>
          <div class="flex-1 min-h-0 rounded-lg bg-surface-raised-base opacity-40 animate-pulse" />
        </div>
      </Show>
    </div>
  )
}
