// @ts-nocheck — MCP SDK generics cause TS2589 with tsgo; runtime types verified by bun build
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaRestClient } from "../rest-client.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerCommentTools(server: McpServer, restClient: FigmaRestClient) {
  const srv = server as unknown as AnyServer

  srv.tool(
    "figma_get_comments",
    "Get comments on a Figma file",
    {
      fileKey: z.string().describe("The file key"),
    },
    async (params: any) => {
      const result = await restClient.getComments(params.fileKey)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_post_comment",
    "Post a comment on a Figma file",
    {
      fileKey: z.string().describe("The file key"),
      message: z.string().describe("Comment text"),
      x: z.number().optional().describe("X coordinate"),
      y: z.number().optional().describe("Y coordinate"),
      node_id: z.string().optional().describe("Node to attach comment to"),
    },
    async (params: any) => {
      const coords =
        params.x !== undefined && params.y !== undefined
          ? { x: params.x, y: params.y, node_id: params.node_id }
          : undefined
      const result = await restClient.postComment(params.fileKey, params.message, coords)
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
    },
  )

  srv.tool(
    "figma_delete_comment",
    "Delete a comment",
    {
      fileKey: z.string().describe("The file key"),
      commentId: z.string().describe("The comment ID to delete"),
    },
    async (params: any) => {
      await restClient.deleteComment(params.fileKey, params.commentId)
      return { content: [{ type: "text" as const, text: "Comment deleted" }] }
    },
  )
}
