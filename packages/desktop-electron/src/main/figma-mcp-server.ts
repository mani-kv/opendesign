/**
 * Figma MCP Server
 *
 * Exposes Figma tools to agents via the Model Context Protocol.
 * Can run standalone (--stdio flag) or be created as a factory for the
 * Electron main process to spawn as a child process.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { FigmaRestClient, FigmaApiError } from "./figma-rest-client.js"
import { getAccessToken, isAuthenticated } from "./figma-oauth.js"
import { getSelection } from "./figma-selection.js"

// ── Shared error response helper ─────────────────────────────────────────────

function errorContent(err: unknown) {
  if (err instanceof FigmaApiError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: true, code: err.code, status: err.status, message: err.message }),
        },
      ],
    }
  }
  const msg = err instanceof Error ? err.message : String(err)
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: true, code: "unknown_error", message: msg }),
      },
    ],
  }
}

function okContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data),
      },
    ],
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createFigmaMcpServer(): McpServer {
  const client = new FigmaRestClient({
    getToken: () => getAccessToken().catch(() => null),
  })

  const server = new McpServer({
    name: "figma-bridge",
    version: "1.0.0",
  })

  // ── Read tools ──────────────────────────────────────────────────────────────

  server.tool("figma_auth_status", "Returns whether the user is authenticated with Figma.", async () =>
    okContent({ authenticated: isAuthenticated() }),
  )

  server.tool("figma_get_selection", "Returns the current Figma selection (file key, node ID, URL, file name).", async () =>
    okContent(getSelection()),
  )

  server.tool(
    "figma_get_frame",
    "Fetches a specific frame or node from a Figma file.",
    {
      fileKey: z.string().describe("The Figma file key (from the file URL)"),
      nodeId: z.string().describe("The node ID to fetch (e.g. '1:2' or '1-2')"),
    },
    async ({ fileKey, nodeId }) => {
      try {
        const result = await client.getFileNodes(fileKey, [nodeId])
        return okContent(result)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.tool(
    "figma_get_variables",
    "Fetches all local variables and variable collections from a Figma file.",
    {
      fileKey: z.string().describe("The Figma file key (from the file URL)"),
    },
    async ({ fileKey }) => {
      try {
        const result = await client.getVariables(fileKey)
        return okContent(result)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.tool(
    "figma_get_styles",
    "Fetches all published styles from a Figma file.",
    {
      fileKey: z.string().describe("The Figma file key (from the file URL)"),
    },
    async ({ fileKey }) => {
      try {
        const result = await client.getStyles(fileKey)
        return okContent(result)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  server.tool(
    "figma_get_image",
    "Exports a node as an image (PNG, JPG, SVG, or PDF) from a Figma file.",
    {
      fileKey: z.string().describe("The Figma file key (from the file URL)"),
      nodeId: z.string().describe("The node ID to export"),
      scale: z.number().min(0.01).max(4).optional().describe("Export scale factor (0.01–4, default 1)"),
      format: z.enum(["jpg", "png", "svg", "pdf"]).optional().describe("Export format (default: png)"),
    },
    async ({ fileKey, nodeId, scale, format }) => {
      try {
        const result = await client.getImage(fileKey, nodeId, { scale, format })
        return okContent(result)
      } catch (err) {
        return errorContent(err)
      }
    },
  )

  // ── Write tools (placeholder — requires figma-console MCP) ─────────────────

  const unavailable = {
    status: "unavailable",
    message: "Requires figma-console MCP",
  }

  server.tool(
    "figma_create_component",
    "Creates a new component in Figma based on a description. (Requires figma-console MCP — currently unavailable.)",
    {
      description: z.string().describe("Natural language description of the component to create"),
    },
    async () => okContent(unavailable),
  )

  server.tool(
    "figma_update_node",
    "Updates properties of an existing Figma node. (Requires figma-console MCP — currently unavailable.)",
    {
      nodeId: z.string().describe("The node ID to update"),
      properties: z.record(z.string(), z.unknown()).describe("Key/value pairs of properties to update on the node"),
    },
    async () => okContent(unavailable),
  )

  return server
}

// ── Standalone stdio entrypoint ───────────────────────────────────────────────

if (process.argv.includes("--stdio")) {
  const server = createFigmaMcpServer()
  const transport = new StdioServerTransport()
  server.connect(transport).catch((err: unknown) => {
    console.error("figma-mcp-server: failed to connect stdio transport", err)
    process.exit(1)
  })
}
