// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"
import type { FigmaRestClient } from "../rest-client.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerComponentTools(server: McpServer, connector: FigmaConnector, _restClient: FigmaRestClient) {
  const srv = server as unknown as AnyServer

  srv.tool("figma_get_component", "Get component data by node ID", {
    nodeId: z.string().describe("The component node ID"),
  }, async (params: any) => {
    const result = await connector.getComponent({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_component_details", "Get detailed component info including properties and variants", {
    nodeId: z.string().describe("The component node ID"),
  }, async (params: any) => {
    const result = await connector.getComponentDetails({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_component_for_development", "Get component data optimized for development handoff", {
    nodeId: z.string().describe("The component node ID"),
  }, async (params: any) => {
    const result = await connector.getComponentForDevelopment({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_component_image", "Get a rendered image of a component", {
    nodeId: z.string().describe("The component node ID"),
    scale: z.number().optional().describe("Scale factor"),
    format: z.string().optional().describe("Image format: png or jpg"),
  }, async (params: any) => {
    const result = await connector.getComponentImage({ nodeId: params.nodeId, scale: params.scale, format: params.format })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_search_components", "Search for components by name or keyword", {
    query: z.string().describe("Search query"),
  }, async (params: any) => {
    const result = await connector.searchComponents({ query: params.query })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_library_components", "Get all library components available in the file", {}, async () => {
    const result = await connector.getLibraryComponents()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_design_system_summary", "Get a summary of the design system (colors, typography, spacing)", {}, async () => {
    const result = await connector.getDesignSystemSummary()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_get_design_system_kit", "Get the full design system kit with all tokens and components", {}, async () => {
    const result = await connector.getDesignSystemKit()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
