import { onMount, Show, createSignal, onCleanup } from "solid-js"
import { Portal } from "solid-js/web"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { Tooltip, TooltipKeybind } from "@opencode-ai/ui/tooltip"
import { useLayout } from "@/context/layout"
import { useCommand } from "@/context/command"
import { useLanguage } from "@/context/language"

function serverUrl(): string {
  if (import.meta.env.VITE_OPENCODE_SERVER_HOST)
    return `http://${import.meta.env.VITE_OPENCODE_SERVER_HOST}:${import.meta.env.VITE_OPENCODE_SERVER_PORT || 4096}`
  if (import.meta.env.DEV) return `http://localhost:4096`
  return window.location.origin
}

/**
 * Feature page header — mounts toolbar buttons into the titlebar's
 * #opencode-titlebar-right container via Portal.
 */
export default function FeatureHeader() {
  const layout = useLayout()
  const command = useCommand()
  const language = useLanguage()

  const [mount, setMount] = createSignal<HTMLElement | null>(null)
  const [figmaAuth, setFigmaAuth] = createSignal(false)
  const [figmaLoading, setFigmaLoading] = createSignal(false)

  const checkFigmaAuth = async () => {
    try {
      const res = await fetch(`${serverUrl()}/figma/auth/status`)
      if (res.ok) {
        const ct = res.headers.get("content-type") ?? ""
        if (ct.includes("application/json")) {
          const data = await res.json()
          setFigmaAuth(data.authenticated === true)
        }
      }
    } catch {
      // backend unavailable
    }
  }

  const connectFigma = async () => {
    setFigmaLoading(true)
    try {
      const redirectUri = `${window.location.origin}/figma/callback/index.html`
      const res = await fetch(`${serverUrl()}/figma/auth/url?redirect_uri=${encodeURIComponent(redirectUri)}`)
      if (res.ok) {
        const data = await res.json()
        if (data.url) {
          const popup = window.open(data.url, "_blank", "width=600,height=700")
          // Listen for callback
          const handler = (e: MessageEvent) => {
            if (e.origin !== window.location.origin) return
            if (e.data?.type === "figma-oauth-callback" && e.data.code && e.data.state) {
              window.removeEventListener("message", handler)
              completeFigmaAuth(e.data.code, e.data.state)
            }
          }
          window.addEventListener("message", handler)
        }
      }
    } catch {
      // failed
    } finally {
      setFigmaLoading(false)
    }
  }

  const completeFigmaAuth = async (code: string, state: string) => {
    try {
      const redirectUri = `${window.location.origin}/figma/callback/index.html`
      const res = await fetch(`${serverUrl()}/figma/auth/callback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirect_uri: redirectUri, state }),
      })
      if (res.ok) setFigmaAuth(true)
    } catch {
      // auth failed
    }
  }

  const disconnectFigma = async () => {
    try {
      await fetch(`${serverUrl()}/figma/auth/disconnect`, { method: "POST" })
      setFigmaAuth(false)
    } catch {}
  }

  onMount(() => {
    const el = document.getElementById("opencode-titlebar-right")
    if (el) setMount(el)
    else requestAnimationFrame(() => setMount(document.getElementById("opencode-titlebar-right")))
    checkFigmaAuth()
  })

  onCleanup(() => {
    const el = mount()
    if (el) el.innerHTML = ""
  })

  return (
    <Show when={mount()}>
      {(m) => (
        <Portal mount={m()}>
          <div class="flex items-center gap-2">
            {/* Figma connection */}
            <Tooltip
              value={figmaAuth() ? "Connected to Figma (click to disconnect)" : "Connect Figma"}
              placement="bottom"
              gutter={8}
            >
              <Button
                variant="ghost"
                class="titlebar-icon h-6 px-2 gap-1.5 box-border shrink-0"
                classList={{
                  "text-icon-strong": figmaAuth(),
                  "text-icon-weak": !figmaAuth(),
                }}
                onClick={() => figmaAuth() ? disconnectFigma() : connectFigma()}
                disabled={figmaLoading()}
              >
                <svg width="14" height="14" viewBox="0 0 38 57" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill={figmaAuth() ? "#1ABCFE" : "currentColor"} />
                  <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill={figmaAuth() ? "#0ACF83" : "currentColor"} />
                  <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill={figmaAuth() ? "#FF7262" : "currentColor"} />
                  <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill={figmaAuth() ? "#F24E1E" : "currentColor"} />
                  <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill={figmaAuth() ? "#A259FF" : "currentColor"} />
                </svg>
                <span class="text-12-regular hidden xl:inline">
                  {figmaAuth() ? "Figma" : "Connect Figma"}
                </span>
              </Button>
            </Tooltip>

            {/* Copy path */}
            <div class="hidden xl:flex items-center">
              <div class="flex h-[24px] box-border items-center rounded-md border border-border-weak-base bg-surface-panel overflow-hidden">
                <Button
                  variant="ghost"
                  class="rounded-none h-full py-0 pr-3 pl-0.5 gap-1.5 border-none shadow-none"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href)
                  }}
                  aria-label={language.t("session.header.open.copyPath")}
                >
                  <Icon name="copy" size="small" class="text-icon-base" />
                  <span class="text-12-regular text-text-strong">
                    {language.t("session.header.open.copyPath")}
                  </span>
                </Button>
              </div>
            </div>

            {/* Panel toggle buttons */}
            <div class="flex items-center gap-1">
              {/* Agents panel toggle */}
              <TooltipKeybind title={language.t("command.agents.toggle")} keybind={command.keybind("agents.toggle")}>
                <Button
                  variant="ghost"
                  class="group/agents-toggle titlebar-icon w-8 h-6 p-0 box-border shrink-0"
                  onClick={() => layout.agents.toggle()}
                  aria-label={language.t("command.agents.toggle")}
                  aria-expanded={layout.agents.opened()}
                  aria-controls="agents-panel"
                >
                  <Icon size="small" name="bot" />
                </Button>
              </TooltipKeybind>

              <div class="hidden md:flex items-center gap-1 shrink-0">
                {/* Split/review toggle */}
                <TooltipKeybind
                  title={language.t("command.review.toggle")}
                  keybind={command.keybind("review.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="group/review-toggle titlebar-icon w-8 h-6 p-0 box-border"
                    onClick={() => layout.canvasPanel.toggleLayout()}
                    aria-label={language.t("command.review.toggle")}
                  >
                    <div class="relative flex items-center justify-center size-4">
                      <Icon size="small" name="task" />
                    </div>
                  </Button>
                </TooltipKeybind>

                {/* File tree toggle */}
                <TooltipKeybind
                  title={language.t("command.fileTree.toggle")}
                  keybind={command.keybind("fileTree.toggle")}
                >
                  <Button
                    variant="ghost"
                    class="titlebar-icon w-8 h-6 p-0 box-border"
                    onClick={() => layout.fileTree.toggle()}
                    aria-label={language.t("command.fileTree.toggle")}
                    aria-expanded={layout.fileTree.opened()}
                    aria-controls="file-tree-panel"
                  >
                    <div class="relative flex items-center justify-center size-4">
                      <Icon
                        size="small"
                        name={layout.fileTree.opened() ? "file-tree-active" : "file-tree"}
                        classList={{
                          "text-icon-strong": layout.fileTree.opened(),
                          "text-icon-weak": !layout.fileTree.opened(),
                        }}
                      />
                    </div>
                  </Button>
                </TooltipKeybind>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </Show>
  )
}
