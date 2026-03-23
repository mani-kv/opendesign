import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerExecuteTool(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_execute", "Execute arbitrary Figma plugin code in the plugin context", {
    code: z.string().describe("JavaScript code to execute in the Figma plugin context"),
  }, async ({ code }) => {
    const result = await connector.executeCode(code)
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
