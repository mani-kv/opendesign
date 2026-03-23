import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

export function registerCreationTools(server: McpServer, connector: FigmaConnector) {
  server.tool("figma_create_child", "Create a new child node inside a parent", {
    parentId: z.string().describe("Parent node ID"),
    type: z.string().describe("Node type: FRAME, RECTANGLE, ELLIPSE, TEXT, etc"),
    props: z.record(z.any()).optional().describe("Optional properties for the new node"),
  }, async ({ parentId, type, props }) => {
    const result = await connector.createChild({ parentId, type, props })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_clone_node", "Clone/duplicate a node", {
    nodeId: z.string().describe("Node ID to clone"),
  }, async ({ nodeId }) => {
    const result = await connector.cloneNode({ nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_instantiate_component", "Create an instance of a component", {
    componentKey: z.string().describe("Component key to instantiate"),
    parentId: z.string().optional().describe("Parent node ID (uses current page if omitted)"),
  }, async ({ componentKey, parentId }) => {
    const result = await connector.instantiateComponent({ componentKey, parentId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_instance_properties", "Set properties on a component instance", {
    nodeId: z.string().describe("Instance node ID"),
    properties: z.record(z.any()).describe("Properties to set"),
  }, async ({ nodeId, properties }) => {
    const result = await connector.setInstanceProperties({ nodeId, properties })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_fills", "Set fill paints on a node", {
    nodeId: z.string().describe("Target node ID"),
    fills: z.array(z.any()).describe("Array of fill paint objects"),
  }, async ({ nodeId, fills }) => {
    const result = await connector.setFills({ nodeId, fills })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_strokes", "Set stroke paints on a node", {
    nodeId: z.string().describe("Target node ID"),
    strokes: z.array(z.any()).describe("Array of stroke paint objects"),
  }, async ({ nodeId, strokes }) => {
    const result = await connector.setStrokes({ nodeId, strokes })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_text", "Set text content and optional style on a text node", {
    nodeId: z.string().describe("Text node ID"),
    text: z.string().describe("Text content"),
    style: z.record(z.any()).optional().describe("Optional text style properties"),
  }, async ({ nodeId, text, style }) => {
    const result = await connector.setText({ nodeId, text, style })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_image_fill", "Set an image fill on one or more nodes", {
    nodeIds: z.array(z.string()).describe("Target node IDs"),
    imageData: z.string().describe("Base64-encoded image data"),
    scaleMode: z.string().optional().describe("Scale mode: FILL, FIT, CROP, or TILE"),
  }, async ({ nodeIds, imageData, scaleMode }) => {
    const result = await connector.setImageFill({ nodeIds, imageData, scaleMode })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_move_node", "Move a node to absolute coordinates", {
    nodeId: z.string().describe("Node ID to move"),
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  }, async ({ nodeId, x, y }) => {
    const result = await connector.moveNode({ nodeId, x, y })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_resize_node", "Resize a node", {
    nodeId: z.string().describe("Node ID to resize"),
    width: z.number().describe("New width"),
    height: z.number().describe("New height"),
  }, async ({ nodeId, width, height }) => {
    const result = await connector.resizeNode({ nodeId, width, height })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_rename_node", "Rename a node", {
    nodeId: z.string().describe("Node ID to rename"),
    name: z.string().describe("New name"),
  }, async ({ nodeId, name }) => {
    const result = await connector.renameNode({ nodeId, name })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_delete_node", "Delete a node from the document", {
    nodeId: z.string().describe("Node ID to delete"),
  }, async ({ nodeId }) => {
    const result = await connector.deleteNode({ nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_set_description", "Set the description on a node", {
    nodeId: z.string().describe("Target node ID"),
    description: z.string().describe("Description text"),
  }, async ({ nodeId, description }) => {
    const result = await connector.setDescription({ nodeId, description })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  server.tool("figma_generate_component_doc", "Auto-generate documentation for a component", {
    nodeId: z.string().describe("Component node ID"),
  }, async ({ nodeId }) => {
    const result = await connector.generateComponentDoc({ nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
