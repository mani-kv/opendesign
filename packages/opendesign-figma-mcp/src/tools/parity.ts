import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerParityTools(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_check_design_parity", "Check design-to-code parity for a node or current selection", {
    nodeId: z.string().optional().describe("Node ID to check (uses selection if omitted)"),
  }, async ({ nodeId }) => {
    const result = await connector.checkDesignParity({ nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_lint_design", "Lint a design for consistency and best practice violations", {
    nodeId: z.string().optional().describe("Node ID to lint (uses selection if omitted)"),
    rules: z.array(z.string()).optional().describe("Specific lint rules to check"),
    maxDepth: z.number().optional().describe("Maximum tree depth to traverse"),
    maxFindings: z.number().optional().describe("Maximum number of findings to return"),
  }, async ({ nodeId, rules, maxDepth, maxFindings }) => {
    const result = await connector.lintDesign({ nodeId, rules, maxDepth, maxFindings })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
