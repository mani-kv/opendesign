import { WebSocketServer, WebSocket } from "ws"
import { EventEmitter } from "node:events"
import type { CommandSender } from "./types.js"

type ClientState = {
  ws: WebSocket
  fileKey: string
  fileName: string
  lastActivity: number
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeoutId: NodeJS.Timeout
}

export class FigmaWSServer extends EventEmitter implements CommandSender {
  private server: WebSocketServer | null = null
  private clients = new Map<string, ClientState>()
  private pendingRequests = new Map<string, PendingRequest>()
  private requestIdCounter = 0
  private activeFileKey: string | null = null
  private port = 9333
  private heartbeatInterval: NodeJS.Timeout | null = null

  async start(preferredPort = 9333): Promise<number> {
    for (let p = preferredPort; p < preferredPort + 10; p++) {
      try {
        await this.tryListen(p)
        this.port = p
        this.startHeartbeat()
        return p
      } catch {
        continue
      }
    }
    throw new Error(`No available port in range ${preferredPort}-${preferredPort + 9}`)
  }

  private tryListen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port }, () => {
        this.server = wss
        this.setupServer(wss)
        resolve()
      })
      wss.on("error", reject)
    })
  }

  private setupServer(wss: WebSocketServer): void {
    wss.on("connection", (ws) => {
      let clientFileKey: string | null = null

      ws.on("message", (raw) => {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }

        const method = msg.method as string | undefined
        const id = msg.id as string | undefined

        // Handle FILE_INFO event (no id, method = FILE_INFO)
        if (method === "FILE_INFO" && !id) {
          const params = msg.params as { fileName?: string; fileKey?: string; currentPage?: string } | undefined
          if (!params?.fileKey) return
          clientFileKey = params.fileKey
          this.clients.set(clientFileKey, {
            ws,
            fileKey: clientFileKey,
            fileName: params.fileName ?? "Unknown",
            lastActivity: Date.now(),
          })
          this.activeFileKey = clientFileKey
          this.emit("connected", { fileKey: clientFileKey, fileName: params.fileName })
          return
        }

        // Handle SELECTION_CHANGE event (no id)
        if (method === "SELECTION_CHANGE" && !id) {
          if (clientFileKey) {
            const client = this.clients.get(clientFileKey)
            if (client) client.lastActivity = Date.now()
          }
          this.emit("selection", { fileKey: clientFileKey, ...(msg.params as Record<string, unknown>) })
          return
        }

        // Handle response to a pending request (has id, has result or error)
        if (id && (msg.result !== undefined || msg.error !== undefined)) {
          const pending = this.pendingRequests.get(id)
          if (!pending) return
          this.pendingRequests.delete(id)
          clearTimeout(pending.timeoutId)
          if (clientFileKey) {
            const client = this.clients.get(clientFileKey)
            if (client) client.lastActivity = Date.now()
          }
          if (msg.error) {
            pending.reject(new Error(typeof msg.error === "string" ? msg.error : JSON.stringify(msg.error)))
          } else {
            pending.resolve(msg.result)
          }
          return
        }
      })

      ws.on("pong", () => {
        if (clientFileKey) {
          const client = this.clients.get(clientFileKey)
          if (client) client.lastActivity = Date.now()
        }
      })

      ws.on("close", () => {
        if (clientFileKey) {
          this.clients.delete(clientFileKey)
          this.emit("disconnected", { fileKey: clientFileKey })
          if (this.activeFileKey === clientFileKey) {
            const keys = [...this.clients.keys()]
            this.activeFileKey = keys.length > 0 ? (keys[0] ?? null) : null
          }
        }
      })

      ws.on("error", () => {
        ws.close()
      })
    })
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now()
      for (const [fileKey, client] of this.clients) {
        if (now - client.lastActivity > 60_000) {
          client.ws.terminate()
          this.clients.delete(fileKey)
          this.emit("disconnected", { fileKey })
          if (this.activeFileKey === fileKey) {
            const keys = [...this.clients.keys()]
            this.activeFileKey = keys.length > 0 ? (keys[0] ?? null) : null
          }
          continue
        }
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping()
        }
      }
    }, 30_000)
  }

  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error("Server stopping"))
    }
    this.pendingRequests.clear()
    for (const [, client] of this.clients) {
      client.ws.close()
    }
    this.clients.clear()
    this.activeFileKey = null
    this.server?.close()
    this.server = null
  }

  async sendCommand(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = 15000,
    targetFileKey?: string,
  ): Promise<unknown> {
    const fileKey = targetFileKey ?? this.activeFileKey
    if (!fileKey) throw new Error("No connected Figma client")
    const client = this.clients.get(fileKey)
    if (!client) throw new Error(`No client connected for file: ${fileKey}`)
    if (client.ws.readyState !== WebSocket.OPEN) throw new Error(`WebSocket not open for file: ${fileKey}`)

    const id = String(++this.requestIdCounter)
    const message = JSON.stringify({ id, method, params })

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Command ${method} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pendingRequests.set(id, { resolve, reject, timeoutId })
      client.ws.send(message)
    })
  }

  getActiveFileKey(): string | null {
    return this.activeFileKey
  }

  isConnected(): boolean {
    return this.clients.size > 0
  }

  getPort(): number {
    return this.port
  }
}
