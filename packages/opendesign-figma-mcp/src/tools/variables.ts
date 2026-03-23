import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerVariableTools(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_get_variables", "Get all variables in the file", {
    fileKey: z.string().optional().describe("File key (uses current file if omitted)"),
  }, async ({ fileKey }) => {
    const result = await connector.getVariables({ fileKey })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_get_token_values", "Get resolved token values for a collection and mode", {
    collectionId: z.string().describe("Variable collection ID"),
    modeId: z.string().optional().describe("Mode ID (uses default mode if omitted)"),
  }, async ({ collectionId, modeId }) => {
    const result = await connector.getTokenValues({ collectionId, modeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_get_styles", "Get all styles (fill, text, effect, grid) in the file", {}, async () => {
    const result = await connector.getStyles()
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_browse_tokens", "Browse design tokens with optional collection filter", {
    collectionId: z.string().optional().describe("Filter by collection ID"),
  }, async ({ collectionId }) => {
    const result = await connector.browseTokens({ collectionId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_create_variable", "Create a new variable in a collection", {
    collectionId: z.string().describe("Target collection ID"),
    name: z.string().describe("Variable name"),
    type: z.string().describe("Variable type: BOOLEAN, FLOAT, STRING, or COLOR"),
    value: z.any().describe("Initial value"),
  }, async ({ collectionId, name, type, value }) => {
    const result = await connector.createVariable({ collectionId, name, type, value })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_batch_create_variables", "Create multiple variables in one call (up to 100)", {
    variables: z.array(z.object({
      collectionId: z.string().describe("Target collection ID"),
      name: z.string().describe("Variable name"),
      type: z.string().describe("Variable type"),
      value: z.any().describe("Initial value"),
    })).describe("Array of variables to create"),
  }, async ({ variables }) => {
    const result = await connector.batchCreateVariables({ variables })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_update_variable", "Update an existing variable value", {
    variableId: z.string().describe("Variable ID to update"),
    value: z.any().describe("New value"),
    modeId: z.string().optional().describe("Mode ID (uses default mode if omitted)"),
  }, async ({ variableId, value, modeId }) => {
    const result = await connector.updateVariable({ variableId, value, modeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_batch_update_variables", "Update multiple variable values in one call (up to 100)", {
    updates: z.array(z.object({
      variableId: z.string().describe("Variable ID"),
      value: z.any().describe("New value"),
      modeId: z.string().optional().describe("Mode ID"),
    })).describe("Array of updates"),
  }, async ({ updates }) => {
    const result = await connector.batchUpdateVariables({ updates })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_create_variable_collection", "Create a new variable collection", {
    name: z.string().describe("Collection name"),
  }, async ({ name }) => {
    const result = await connector.createVariableCollection({ name })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
