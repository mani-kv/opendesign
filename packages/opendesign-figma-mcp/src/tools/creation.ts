import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import type { FigmaConnector } from "../websocket-connector.js"

// Cast server to any to avoid TS2589 deep type instantiation in @modelcontextprotocol/sdk generics
type AnyServer = { tool: (...args: any[]) => any }

export function registerCreationTools(server: McpServer, connector: FigmaConnector) {
  const srv = server as unknown as AnyServer

  srv.tool("figma_create_child", "Create a new child node inside a parent", {
    parentId: z.string().describe("Parent node ID"),
    type: z.string().describe("Node type: FRAME, RECTANGLE, ELLIPSE, TEXT, etc"),
    props: z.record(z.any()).optional().describe("Optional properties for the new node"),
  }, async (params: any) => {
    const result = await connector.createChild({ parentId: params.parentId, type: params.type, props: params.props })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_clone_node", "Clone/duplicate a node", {
    nodeId: z.string().describe("Node ID to clone"),
  }, async (params: any) => {
    const result = await connector.cloneNode({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_instantiate_component", "Create an instance of a component", {
    componentKey: z.string().describe("Component key to instantiate"),
    parentId: z.string().optional().describe("Parent node ID (uses current page if omitted)"),
  }, async (params: any) => {
    const result = await connector.instantiateComponent({ componentKey: params.componentKey, parentId: params.parentId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_instance_properties", "Set properties on a component instance", {
    nodeId: z.string().describe("Instance node ID"),
    properties: z.record(z.any()).describe("Properties to set"),
  }, async (params: any) => {
    const result = await connector.setInstanceProperties({ nodeId: params.nodeId, properties: params.properties })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_fills", "Set fill paints on a node", {
    nodeId: z.string().describe("Target node ID"),
    fills: z.array(z.any()).describe("Array of fill paint objects"),
  }, async (params: any) => {
    const result = await connector.setFills({ nodeId: params.nodeId, fills: params.fills })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_strokes", "Set stroke paints on a node", {
    nodeId: z.string().describe("Target node ID"),
    strokes: z.array(z.any()).describe("Array of stroke paint objects"),
  }, async (params: any) => {
    const result = await connector.setStrokes({ nodeId: params.nodeId, strokes: params.strokes })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_text", "Set text content and optional style on a text node", {
    nodeId: z.string().describe("Text node ID"),
    text: z.string().describe("Text content"),
    style: z.record(z.any()).optional().describe("Optional text style properties"),
  }, async (params: any) => {
    const result = await connector.setText({ nodeId: params.nodeId, text: params.text, style: params.style })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_image_fill", "Set an image fill on one or more nodes", {
    nodeIds: z.array(z.string()).describe("Target node IDs"),
    imageData: z.string().describe("Base64-encoded image data"),
    scaleMode: z.string().optional().describe("Scale mode: FILL, FIT, CROP, or TILE"),
  }, async (params: any) => {
    const result = await connector.setImageFill({ nodeIds: params.nodeIds, imageData: params.imageData, scaleMode: params.scaleMode })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_move_node", "Move a node to absolute coordinates", {
    nodeId: z.string().describe("Node ID to move"),
    x: z.number().describe("X coordinate"),
    y: z.number().describe("Y coordinate"),
  }, async (params: any) => {
    const result = await connector.moveNode({ nodeId: params.nodeId, x: params.x, y: params.y })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_resize_node", "Resize a node", {
    nodeId: z.string().describe("Node ID to resize"),
    width: z.number().describe("New width"),
    height: z.number().describe("New height"),
  }, async (params: any) => {
    const result = await connector.resizeNode({ nodeId: params.nodeId, width: params.width, height: params.height })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_rename_node", "Rename a node", {
    nodeId: z.string().describe("Node ID to rename"),
    name: z.string().describe("New name"),
  }, async (params: any) => {
    const result = await connector.renameNode({ nodeId: params.nodeId, name: params.name })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_delete_node", "Delete a node from the document", {
    nodeId: z.string().describe("Node ID to delete"),
  }, async (params: any) => {
    const result = await connector.deleteNode({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_set_description", "Set the description on a node", {
    nodeId: z.string().describe("Target node ID"),
    description: z.string().describe("Description text"),
  }, async (params: any) => {
    const result = await connector.setDescription({ nodeId: params.nodeId, description: params.description })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })

  srv.tool("figma_generate_component_doc", "Auto-generate documentation for a component", {
    nodeId: z.string().describe("Component node ID"),
  }, async (params: any) => {
    const result = await connector.generateComponentDoc({ nodeId: params.nodeId })
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] }
  })
}
