#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { WebSocket } from "ws"
import { FigmaConnector } from "./websocket-connector.js"
import { createMcpServer } from "./mcp-server.js"
import { createRestClient } from "./rest-client.js"
import type { CommandSender } from "./types.js"

const port = parseInt(process.env.OPENDESIGN_FIGMA_PORT ?? "9333")

// Lightweight WS client implementing CommandSender
class WSClient implements CommandSender {
  private ws: WebSocket | null = null
  private pending = new Map<string, { resolve: Function; reject: Function }>()
  private counter = 0

  async connect(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${port}`)
      this.ws.on("open", () => resolve())
      this.ws.on("error", reject)
      this.ws.on("message", (data) => {
        const msg = JSON.parse(data.toString())
        const req = this.pending.get(msg.id)
        if (req) {
          this.pending.delete(msg.id)
          req.resolve(msg.result ?? msg)
        }
      })
    })
  }

  async sendCommand(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<unknown> {
    if (!this.ws) throw new Error("Not connected")
    const id = `mcp_${++this.counter}_${Date.now()}`
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout: ${method}`))
      }, timeoutMs)
      this.pending.set(id, {
        resolve: (v: unknown) => { clearTimeout(timeout); resolve(v) },
        reject: (e: unknown) => { clearTimeout(timeout); reject(e) },
      })
      this.ws!.send(JSON.stringify({ id, method, params }))
    })
  }
}

async function main() {
  const client = new WSClient()

  // Retry connection — WebSocket server may not be ready yet
  for (let i = 0; i < 10; i++) {
    try {
      await client.connect(port)
      break
    } catch {
      if (i === 9) throw new Error(`Cannot connect to WebSocket on port ${port}`)
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  const connector = new FigmaConnector(client)
  const restClient = createRestClient()
  const server = createMcpServer(connector, restClient)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error("opendesign-figma-mcp failed:", err)
  process.exit(1)
})
