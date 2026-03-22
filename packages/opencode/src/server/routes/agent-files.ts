import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { Instance } from "../../project/instance"
import { lazy } from "../../util/lazy"
import fs from "fs"
import path from "path"

const SKIP_DIRS = new Set(["node_modules", ".git"])
const MAX_FILE_SIZE = 100 * 1024 // 100KB

async function readDirFiles(dir: string): Promise<Record<string, { content: string }>> {
  const files: Record<string, { content: string }> = {}

  async function walk(current: string, rel: string) {
    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue
      const fullPath = path.join(current, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : `/${entry.name}`
      if (entry.isDirectory()) {
        await walk(fullPath, relPath)
      } else if (entry.isFile()) {
        try {
          const stat = await fs.promises.stat(fullPath)
          if (stat.size > MAX_FILE_SIZE) continue
          const content = await fs.promises.readFile(fullPath, "utf8")
          files[relPath] = { content }
        } catch {
          // skip binary or unreadable files
        }
      }
    }
  }

  await walk(dir, "")
  return files
}

export const AgentFilesRoutes = lazy(() =>
  new Hono()
    .get("/:agentId/files", async (c) => {
      const agentId = c.req.param("agentId")
      const dir = path.join(Instance.directory, "agents", agentId)

      try {
        await fs.promises.access(dir)
      } catch {
        return c.json({ error: "agent_not_found" }, 404)
      }

      const files = await readDirFiles(dir)
      return c.json({ files })
    })
    .get("/:agentId/files/*", async (c) => {
      const agentId = c.req.param("agentId")
      const filePath = c.req.param("*") ?? ""
      const dir = path.join(Instance.directory, "agents", agentId)
      const full = path.join(dir, filePath)

      // Prevent path traversal outside agent dir
      if (!full.startsWith(dir)) {
        return c.json({ error: "not_found" }, 404)
      }

      try {
        const content = await fs.promises.readFile(full, "utf8")
        return c.json({ path: `/${filePath}`, content })
      } catch {
        return c.json({ error: "not_found" }, 404)
      }
    })
    .get("/:agentId/watch", async (c) => {
      const agentId = c.req.param("agentId")
      const dir = path.join(Instance.directory, "agents", agentId)

      // Ensure directory exists before watching
      try {
        await fs.promises.access(dir)
      } catch {
        return c.json({ error: "agent_not_found" }, 404)
      }

      c.header("X-Accel-Buffering", "no")
      c.header("X-Content-Type-Options", "nosniff")

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({ data: JSON.stringify({ type: "connected" }) })

        const watcher = fs.watch(dir, { recursive: true }, (event, filename) => {
          if (!filename) return
          // Filter out node_modules and .git changes
          const parts = filename.split(path.sep)
          if (parts.some((p) => SKIP_DIRS.has(p))) return

          const relPath = `/${filename.split(path.sep).join("/")}`
          stream.writeSSE({
            data: JSON.stringify({ type: "file.changed", event, path: relPath }),
          })
        })

        const heartbeat = setInterval(() => {
          stream.writeSSE({ data: JSON.stringify({ type: "heartbeat" }) })
        }, 10_000)

        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            clearInterval(heartbeat)
            watcher.close()
            resolve()
          })
        })
      })
    }),
)
