// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerSelectionTools(server: McpServer, connector: FigmaConnector) {
  const srv = server as unknown as AnyServer

  srv.tool("figma_get_selection", "Get currently selected nodes with name, type, and properties", {}, async () => {
    const result = await connector.getSelection()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_file_data", "Get file/page structure with node tree", {
    depth: z.number().optional().describe("How deep to traverse the node tree"),
  }, async (params: any) => {
    const result = await connector.getFileData({ depth: params.depth })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_status", "Get connection status and active file info", {}, async () => {
    const result = await connector.getStatus()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_list_open_files", "List all open Figma files", {}, async () => {
    const result = await connector.listOpenFiles()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_navigate", "Navigate to a specific node in Figma", {
    nodeId: z.string().describe("The node ID to navigate to"),
  }, async (params: any) => {
    const result = await connector.navigate({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_take_screenshot", "Take a screenshot of the current view or specific node", {
    nodeId: z.string().optional().describe("Node ID to screenshot (current view if omitted)"),
    scale: z.number().optional().describe("Scale factor (default 1)"),
    format: z.string().optional().describe("Image format: png or jpg"),
  }, async (params: any) => {
    const result = await connector.takeScreenshot({ nodeId: params.nodeId, scale: params.scale, format: params.format })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
