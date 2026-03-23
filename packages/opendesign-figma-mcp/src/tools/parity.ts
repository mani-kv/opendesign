// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerParityTools(server: McpServer, connector: FigmaConnector) {
  const srv = server as unknown as AnyServer

  srv.tool("figma_check_design_parity", "Check design-to-code parity for a node or current selection", {
    nodeId: z.string().optional().describe("Node ID to check (uses selection if omitted)"),
  }, async (params: any) => {
    const result = await connector.checkDesignParity({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_lint_design", "Lint a design for consistency and best practice violations", {
    nodeId: z.string().optional().describe("Node ID to lint (uses selection if omitted)"),
    rules: z.array(z.string()).optional().describe("Specific lint rules to check"),
    maxDepth: z.number().optional().describe("Maximum tree depth to traverse"),
    maxFindings: z.number().optional().describe("Maximum number of findings to return"),
  }, async (params: any) => {
    const result = await connector.lintDesign({ nodeId: params.nodeId, rules: params.rules, maxDepth: params.maxDepth, maxFindings: params.maxFindings })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
