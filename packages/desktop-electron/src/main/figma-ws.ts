import type { BrowserWindow } from "electron"
import { FigmaWSServer } from "@opencode-ai/opendesign-figma-mcp/websocket-server"

let server: FigmaWSServer | null = null

export async function startFigmaWS(win: BrowserWindow): Promise<number> {
  server = new FigmaWSServer()
  const port = await server.start(9333)

  server.on("selection", (data: Record<string, unknown>) => {
    if (!win.isDestroyed()) {
      win.webContents.send("figma:selection-updated", {
        fileKey: data.fileKey ?? null,
        nodeId: data.nodeId ?? null,
        nodeName: data.nodeName ?? null,
        nodeType: data.nodeType ?? null,
        fileName: data.fileName ?? null,
        url: null,
      })
    }
  })

  server.on("connected", () => {
    if (!win.isDestroyed()) win.webContents.send("figma:plugin-connected")
  })

  server.on("disconnected", () => {
    if (!win.isDestroyed()) win.webContents.send("figma:plugin-disconnected")
  })

  return port
}

export function stopFigmaWS() {
  server?.stop()
  server = null
}

export function isFigmaPluginConnected(): boolean {
  return server?.isConnected() ?? false
}
