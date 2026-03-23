import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaRestClient } from "../rest-client.js"

export function registerCommentTools(server: McpServer, restClient: FigmaRestClient) {
  server.tool("figma_get_comments", "Get comments on a Figma file", {
    fileKey: z.string().describe("The file key"),
  }, async ({ fileKey }) => {
    const result = await restClient.getComments(fileKey)
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_post_comment", "Post a comment on a Figma file", {
    fileKey: z.string().describe("The file key"),
    message: z.string().describe("Comment text"),
    x: z.number().optional().describe("X coordinate"),
    y: z.number().optional().describe("Y coordinate"),
    node_id: z.string().optional().describe("Node to attach comment to"),
  }, async ({ fileKey, message, x, y, node_id }) => {
    const coords = x !== undefined && y !== undefined ? { x, y, node_id } : undefined
    const result = await restClient.postComment(fileKey, message, coords)
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_delete_comment", "Delete a comment", {
    fileKey: z.string().describe("The file key"),
    commentId: z.string().describe("The comment ID to delete"),
  }, async ({ fileKey, commentId }) => {
    await restClient.deleteComment(fileKey, commentId)
    return { content: [{ type: "text" as const, text: "Comment deleted" }] }
  })
}
