import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerSelectionTools(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_get_selection", "Get currently selected nodes with name, type, and properties", {}, async () => {
    const result = await connector.getSelection()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_get_file_data", "Get file/page structure with node tree", {
    depth: z.number().optional().describe("How deep to traverse the node tree"),
  }, async ({ depth }) => {
    const result = await connector.getFileData({ depth })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_get_status", "Get connection status and active file info", {}, async () => {
    const result = await connector.getStatus()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_list_open_files", "List all open Figma files", {}, async () => {
    const result = await connector.listOpenFiles()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_navigate", "Navigate to a specific node in Figma", {
    nodeId: z.string().describe("The node ID to navigate to"),
  }, async ({ nodeId }) => {
    const result = await connector.navigate({ nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_take_screenshot", "Take a screenshot of the current view or specific node", {
    nodeId: z.string().optional().describe("Node ID to screenshot (current view if omitted)"),
    scale: z.number().optional().describe("Scale factor (default 1)"),
    format: z.string().optional().describe("Image format: png or jpg"),
  }, async ({ nodeId, scale, format }) => {
    const result = await connector.takeScreenshot({ nodeId, scale, format })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
