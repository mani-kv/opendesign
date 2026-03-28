// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerVariableTools(server: McpServer, connector: FigmaConnector) {
  const srv = server as unknown as AnyServer

  srv.tool(
    "figma_get_variables",
    "Get all variables in the file",
    {
      fileKey: z.string().optional().describe("File key (uses current file if omitted)"),
    },
    async (params: any) => {
      const result = await connector.getVariables({ fileKey: params.fileKey })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_get_token_values",
    "Get resolved token values for a collection and mode",
    {
      collectionId: z.string().describe("Variable collection ID"),
      modeId: z.string().optional().describe("Mode ID (uses default mode if omitted)"),
    },
    async (params: any) => {
      const result = await connector.getTokenValues({ collectionId: params.collectionId, modeId: params.modeId })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool("figma_get_styles", "Get all styles (fill, text, effect, grid) in the file", {}, async () => {
    const result = await connector.getStyles()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool(
    "figma_browse_tokens",
    "Browse design tokens with optional collection filter",
    {
      collectionId: z.string().optional().describe("Filter by collection ID"),
    },
    async (params: any) => {
      const result = await connector.browseTokens({ collectionId: params.collectionId })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_create_variable",
    "Create a new variable in a collection",
    {
      collectionId: z.string().describe("Target collection ID"),
      name: z.string().describe("Variable name"),
      type: z.string().describe("Variable type: BOOLEAN, FLOAT, STRING, or COLOR"),
      value: z.any().describe("Initial value"),
    },
    async (params: any) => {
      const result = await connector.createVariable({
        collectionId: params.collectionId,
        name: params.name,
        type: params.type,
        value: params.value,
      })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_batch_create_variables",
    "Create multiple variables in one call (up to 100)",
    {
      variables: z
        .array(
          z.object({
            collectionId: z.string().describe("Target collection ID"),
            name: z.string().describe("Variable name"),
            type: z.string().describe("Variable type"),
            value: z.any().describe("Initial value"),
          }),
        )
        .describe("Array of variables to create"),
    },
    async (params: any) => {
      const result = await connector.batchCreateVariables({ variables: params.variables })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_update_variable",
    "Update an existing variable value",
    {
      variableId: z.string().describe("Variable ID to update"),
      value: z.any().describe("New value"),
      modeId: z.string().optional().describe("Mode ID (uses default mode if omitted)"),
    },
    async (params: any) => {
      const result = await connector.updateVariable({
        variableId: params.variableId,
        value: params.value,
        modeId: params.modeId,
      })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_batch_update_variables",
    "Update multiple variable values in one call (up to 100)",
    {
      updates: z
        .array(
          z.object({
            variableId: z.string().describe("Variable ID"),
            value: z.any().describe("New value"),
            modeId: z.string().optional().describe("Mode ID"),
          }),
        )
        .describe("Array of updates"),
    },
    async (params: any) => {
      const result = await connector.batchUpdateVariables({ updates: params.updates })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_create_variable_collection",
    "Create a new variable collection",
    {
      name: z.string().describe("Collection name"),
    },
    async (params: any) => {
      const result = await connector.createVariableCollection({ name: params.name })
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )
}
