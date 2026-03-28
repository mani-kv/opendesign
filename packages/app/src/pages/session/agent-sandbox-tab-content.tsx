import { Show, createSignal } from "solid-js"
import { Mark } from "@opencode-ai/ui/logo"
import { useLanguage } from "@/context/language"
import { useAgents } from "@/context/agents"
import { stateColor } from "@opencode-ai/opendesign/agent"
import { useAgentFiles } from "./agent-sandbox/use-agent-files"
import { SandpackPreview } from "./agent-sandbox/sandpack-preview"

export function AgentSandboxTabContent() {
  const language = useLanguage()
  const agents = useAgents()
  const agent = () => agents.selected()

  const agentFiles = useAgentFiles(agents.selectedId)

  const [viewMode, setViewMode] = createSignal<"preview" | "code">("preview")
  const toggleView = () => setViewMode((m) => (m === "preview" ? "code" : "preview"))

  const CodeView = () => {
    const entries = () => Object.entries(agentFiles.files())
    return (
      <div class="size-full overflow-auto p-4 flex flex-col gap-4">
        <Show when={entries().length === 0}>
          <div class="text-sm text-text-dimmer">No files to display</div>
        </Show>
        {entries().map(([path, content]) => (
          <div>
            <div class="text-11-medium font-mono text-text-weak mb-1">{path}</div>
            <pre class="text-12-regular font-mono bg-background-stronger rounded p-3 overflow-auto whitespace-pre-wrap break-words">
              {content}
            </pre>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div class="relative size-full min-h-0 min-w-0 flex flex-col">
      <Show when={agent()}>
        {(a) => (
          <>
            {/* Header bar */}
            <div class="h-10 px-3 flex items-center gap-2 border-b border-[var(--border-weaker-base)] shrink-0">
              <div class="size-2 rounded-full shrink-0" style={{ "background-color": stateColor(a().state) }} />
              <div class="text-12-medium text-text-base truncate">{a().scenario}</div>
              <div class="ml-auto flex items-center gap-2">
                <span class="text-11-regular text-text-weak font-mono truncate">{a().branch}</span>
                <button
                  class="text-11-medium text-text-weak hover:text-text-base transition-colors px-2 py-0.5 rounded border border-[var(--border-weaker-base)] hover:bg-background-stronger"
                  onClick={toggleView}
                >
                  {viewMode() === "preview" ? "Code" : "Preview"}
                </button>
              </div>
            </div>

            {/* Content area */}
            <div class="flex-1 min-h-0">
              <Show when={viewMode() === "preview"} fallback={<CodeView />}>
                <SandpackPreview files={agentFiles.files()} loading={agentFiles.loading()} error={agentFiles.error()} />
              </Show>
            </div>
          </>
        )}
      </Show>

      {/* Empty state */}
      <Show when={!agent()}>
        <div class="h-full px-6 pb-24 flex flex-col items-center justify-center gap-6">
          <Mark class="w-14 opacity-10" />
          <div class="text-14-regular text-text-weak max-w-56 text-center">{language.t("session.sandbox.empty")}</div>
        </div>
      </Show>
    </div>
  )
}
