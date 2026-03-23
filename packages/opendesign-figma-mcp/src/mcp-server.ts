import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { FigmaConnector } from "./websocket-connector.js"
import type { FigmaRestClient } from "./rest-client.js"
import { registerSelectionTools } from "./tools/selection.js"
import { registerComponentTools } from "./tools/components.js"
import { registerVariableTools } from "./tools/variables.js"
import { registerCreationTools } from "./tools/creation.js"
import { registerCommentTools } from "./tools/comments.js"
import { registerParityTools } from "./tools/parity.js"
import { registerExecuteTool } from "./tools/execute.js"

export function createMcpServer(connector: FigmaConnector, restClient: FigmaRestClient): McpServer {
  const server = new McpServer({ name: "opendesign-figma", version: "0.1.0" })

  registerSelectionTools(server, connector)
  registerComponentTools(server, connector, restClient)
  registerVariableTools(server, connector)
  registerCreationTools(server, connector)
  registerCommentTools(server, restClient)
  registerParityTools(server, connector)
  registerExecuteTool(server, connector)

  return server
}
