// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerExecuteTool(server: McpServer, connector: FigmaConnector) {
  const srv = server as unknown as AnyServer

  srv.tool("figma_execute", "Execute arbitrary Figma plugin code in the plugin context", {
    code: z.string().describe("JavaScript code to execute in the Figma plugin context"),
  }, async (params: any) => {
    const result = await connector.executeCode(params.code)
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
