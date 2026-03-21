import type { FigmaFrame, FigmaSelection } from "../types/figma"

/**
 * Message types for the Figma webview bridge.
 * These messages are sent between the Electron main process
 * and the Figma webview via postMessage.
 */
export interface FigmaSelectionMessage {
  type: "opendesign:figma:selection"
  selection: FigmaSelection
}

export interface FigmaTokensMessage {
  type: "opendesign:figma:tokens"
  tokens: { collection: string; name: string; type: string; value: string }[]
}

export interface FigmaReadyMessage {
  type: "opendesign:figma:ready"
  fileKey: string
  fileName: string
}

export type FigmaBridgeMessage = FigmaSelectionMessage | FigmaTokensMessage | FigmaReadyMessage

/**
 * Check if a message is a valid Figma bridge message.
 */
export function isFigmaBridgeMessage(data: unknown): data is FigmaBridgeMessage {
  if (typeof data !== "object" || data === null) return false
  const msg = data as Record<string, unknown>
  return typeof msg.type === "string" && msg.type.startsWith("opendesign:figma:")
}

/**
 * Extract frames from a Figma selection message.
 */
export function extractFrames(msg: FigmaSelectionMessage): FigmaFrame[] {
  return msg.selection.frames
}

/**
 * Build the injection script for Figma webview.
 * This script listens for selection changes in Figma and posts messages to the parent.
 */
export function figmaInjectionScript(): string {
  return `
(function() {
  // Listen for Figma selection changes via the internal API
  const observer = new MutationObserver(() => {
    // Selection detection is handled by Figma's internal events
    // This is a placeholder for the actual injection logic
  });

  // Notify parent that bridge is ready
  window.parent.postMessage({
    type: "opendesign:figma:ready",
    fileKey: document.location.pathname.split("/")[2] || "",
    fileName: document.title.replace(" \\u2013 Figma", "")
  }, "*");
})();`
}
