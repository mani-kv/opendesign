import { Show } from "solid-js"
import { createSandpackSrcdoc } from "./sandpack-srcdoc"

export function SandpackPreview(props: { files: Record<string, string>; loading: boolean; error: string | null }) {
  const srcdoc = () => createSandpackSrcdoc(props.files)
  const hasFiles = () => Object.keys(props.files).length > 0

  return (
    <div class="size-full bg-surface-primary flex flex-col">
      <Show when={props.loading}>
        <div class="flex-1 flex flex-col gap-3 p-4 animate-pulse">
          <div class="h-4 rounded bg-[var(--bg-surface-stronger)] w-3/4" />
          <div class="h-4 rounded bg-[var(--bg-surface-stronger)] w-1/2" />
          <div class="h-4 rounded bg-[var(--bg-surface-stronger)] w-5/6" />
          <div class="h-4 rounded bg-[var(--bg-surface-stronger)] w-2/3" />
        </div>
      </Show>
      <Show when={!props.loading && props.error}>
        <div class="flex-1 flex items-start p-4">
          <pre class="text-sm font-mono text-danger whitespace-pre-wrap break-words">{props.error}</pre>
        </div>
      </Show>
      <Show when={!props.loading && !props.error && hasFiles()}>
        <iframe srcdoc={srcdoc()} class="flex-1 w-full border-0" sandbox="allow-scripts" title="Sandpack preview" />
      </Show>
      <Show when={!props.loading && !props.error && !hasFiles()}>
        <div class="flex-1 flex items-center justify-center">
          <span class="text-sm text-text-dimmed-extra">No files to preview</span>
        </div>
      </Show>
    </div>
  )
}
