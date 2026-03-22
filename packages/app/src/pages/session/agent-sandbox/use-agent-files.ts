import { createSignal, createEffect, onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import { useSDK } from "@/context/sdk"

export function useAgentFiles(agentId: Accessor<string | undefined>): {
  files: Accessor<Record<string, string>>
  loading: Accessor<boolean>
  error: Accessor<string | null>
} {
  const sdk = useSDK()
  const [files, setFiles] = createSignal<Record<string, string>>({})
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)

  createEffect(() => {
    const id = agentId()
    if (!id) return

    setLoading(true)
    setError(null)

    fetch(`${sdk.url}/agent/${id}/files`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to fetch files: ${res.status} ${res.statusText}`)
        return res.json() as Promise<Record<string, string>>
      })
      .then((data) => {
        setFiles(data)
        setLoading(false)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })

    const es = new EventSource(`${sdk.url}/agent/${id}/watch`)

    es.addEventListener("file.changed", (ev: MessageEvent) => {
      let path: string | undefined
      try {
        const parsed = JSON.parse(ev.data as string) as { path?: string }
        path = parsed.path
      } catch {
        // non-JSON data — skip
        return
      }
      if (!path) return
      const filePath = path.startsWith("/") ? path : `/${path}`
      fetch(`${sdk.url}/agent/${id}/files${filePath}`)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`)
          return res.text()
        })
        .then((content) => {
          setFiles((prev) => ({ ...prev, [filePath]: content }))
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err))
        })
    })

    es.onerror = () => {
      setError("SSE connection error")
    }

    onCleanup(() => {
      es.close()
    })
  })

  return { files, loading, error }
}
