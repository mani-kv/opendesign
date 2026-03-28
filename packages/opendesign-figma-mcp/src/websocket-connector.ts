import type { CommandSender } from "./types.js"

export class FigmaConnector {
  constructor(private sender: CommandSender) {}

  // ── Selection & navigation ───────────────────────────────────────────────

  getSelection(): Promise<unknown> {
    return this.sender.sendCommand("GET_SELECTION")
  }

  getFileData(params: { depth?: number } = {}): Promise<unknown> {
    return this.sender.sendCommand("GET_FILE_DATA", params)
  }

  getStatus(): Promise<unknown> {
    return this.sender.sendCommand("GET_STATUS")
  }

  listOpenFiles(): Promise<unknown> {
    return this.sender.sendCommand("LIST_OPEN_FILES")
  }

  navigate(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("NAVIGATE", params)
  }

  takeScreenshot(params: { nodeId?: string; scale?: number; format?: string } = {}): Promise<unknown> {
    return this.sender.sendCommand("TAKE_SCREENSHOT", params)
  }

  captureScreenshot(params: { nodeId?: string; scale?: number; format?: string } = {}): Promise<unknown> {
    return this.sender.sendCommand("CAPTURE_SCREENSHOT", params)
  }

  // ── Components ───────────────────────────────────────────────────────────

  getComponent(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("GET_COMPONENT", params)
  }

  getComponentDetails(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("GET_COMPONENT_DETAILS", params)
  }

  getComponentForDevelopment(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("GET_COMPONENT_FOR_DEVELOPMENT", params)
  }

  getComponentImage(params: { nodeId: string; scale?: number; format?: string }): Promise<unknown> {
    return this.sender.sendCommand("GET_COMPONENT_IMAGE", params)
  }

  searchComponents(params: { query: string }): Promise<unknown> {
    return this.sender.sendCommand("SEARCH_COMPONENTS", params)
  }

  getLibraryComponents(): Promise<unknown> {
    return this.sender.sendCommand("GET_LIBRARY_COMPONENTS")
  }

  getDesignSystemSummary(): Promise<unknown> {
    return this.sender.sendCommand("GET_DESIGN_SYSTEM_SUMMARY")
  }

  getDesignSystemKit(): Promise<unknown> {
    return this.sender.sendCommand("GET_DESIGN_SYSTEM_KIT")
  }

  // ── Variables & tokens ───────────────────────────────────────────────────

  getVariables(params: { fileKey?: string } = {}): Promise<unknown> {
    return this.sender.sendCommand("GET_VARIABLES", params)
  }

  getTokenValues(params: { collectionId: string; modeId?: string }): Promise<unknown> {
    return this.sender.sendCommand("GET_TOKEN_VALUES", params)
  }

  getStyles(): Promise<unknown> {
    return this.sender.sendCommand("GET_STYLES")
  }

  browseTokens(params: { collectionId?: string } = {}): Promise<unknown> {
    return this.sender.sendCommand("BROWSE_TOKENS", params)
  }

  createVariable(params: { collectionId: string; name: string; type: string; value: unknown }): Promise<unknown> {
    return this.sender.sendCommand("CREATE_VARIABLE", params)
  }

  batchCreateVariables(params: {
    variables: Array<{ collectionId: string; name: string; type: string; value: unknown }>
  }): Promise<unknown> {
    return this.sender.sendCommand("BATCH_CREATE_VARIABLES", params)
  }

  updateVariable(params: { variableId: string; value: unknown; modeId?: string }): Promise<unknown> {
    return this.sender.sendCommand("UPDATE_VARIABLE", params)
  }

  batchUpdateVariables(params: {
    updates: Array<{ variableId: string; value: unknown; modeId?: string }>
  }): Promise<unknown> {
    return this.sender.sendCommand("BATCH_UPDATE_VARIABLES", params)
  }

  createVariableCollection(params: { name: string }): Promise<unknown> {
    return this.sender.sendCommand("CREATE_VARIABLE_COLLECTION", params)
  }

  // ── Creation & mutation ──────────────────────────────────────────────────

  createChild(params: { parentId: string; type: string; props?: Record<string, unknown> }): Promise<unknown> {
    return this.sender.sendCommand("CREATE_CHILD", params)
  }

  cloneNode(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("CLONE_NODE", params)
  }

  instantiateComponent(params: { componentKey: string; parentId?: string }): Promise<unknown> {
    return this.sender.sendCommand("INSTANTIATE_COMPONENT", params)
  }

  setInstanceProperties(params: { nodeId: string; properties: Record<string, unknown> }): Promise<unknown> {
    return this.sender.sendCommand("SET_INSTANCE_PROPERTIES", params)
  }

  setFills(params: { nodeId: string; fills: unknown[] }): Promise<unknown> {
    return this.sender.sendCommand("SET_FILLS", params)
  }

  setStrokes(params: { nodeId: string; strokes: unknown[] }): Promise<unknown> {
    return this.sender.sendCommand("SET_STROKES", params)
  }

  setText(params: { nodeId: string; text: string; style?: Record<string, unknown> }): Promise<unknown> {
    return this.sender.sendCommand("SET_TEXT", params)
  }

  setImageFill(params: { nodeIds: string[]; imageData: string; scaleMode?: string }): Promise<unknown> {
    return this.sender.sendCommand("SET_IMAGE_FILL", params)
  }

  moveNode(params: { nodeId: string; x: number; y: number }): Promise<unknown> {
    return this.sender.sendCommand("MOVE_NODE", params)
  }

  resizeNode(params: { nodeId: string; width: number; height: number }): Promise<unknown> {
    return this.sender.sendCommand("RESIZE_NODE", params)
  }

  renameNode(params: { nodeId: string; name: string }): Promise<unknown> {
    return this.sender.sendCommand("RENAME_NODE", params)
  }

  deleteNode(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("DELETE_NODE", params)
  }

  // ── Design parity ───────────────────────────────────────────────────────

  checkDesignParity(params: { nodeId?: string } = {}): Promise<unknown> {
    return this.sender.sendCommand("CHECK_DESIGN_PARITY", params)
  }

  lintDesign(
    params: { nodeId?: string; rules?: string[]; maxDepth?: number; maxFindings?: number } = {},
  ): Promise<unknown> {
    return this.sender.sendCommand("LINT_DESIGN", params)
  }

  // ── Escape hatch ─────────────────────────────────────────────────────────

  executeCode(code: string): Promise<unknown> {
    return this.sender.sendCommand("EXECUTE", { code })
  }

  // ── Description ──────────────────────────────────────────────────────────

  setDescription(params: { nodeId: string; description: string }): Promise<unknown> {
    return this.sender.sendCommand("SET_DESCRIPTION", params)
  }

  // ── Generate docs ────────────────────────────────────────────────────────

  generateComponentDoc(params: { nodeId: string }): Promise<unknown> {
    return this.sender.sendCommand("GENERATE_COMPONENT_DOC", params)
  }
}
