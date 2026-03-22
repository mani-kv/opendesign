/**
 * Figma Webview Preload Bridge
 *
 * Injected into the Figma <webview> tag. Tracks URL/hash changes and forwards
 * the current URL to the main process via IPC so the selection state manager
 * can parse the active file/node.
 *
 * Webview preloads have direct access to ipcRenderer — no contextBridge needed.
 */

import { ipcRenderer } from "electron"

function notify() {
  ipcRenderer.send("figma:selection-changed", window.location.href)
}

// Initial URL on page load
window.addEventListener("DOMContentLoaded", notify)

// Hash-based navigation (Figma uses #node-id=... fragments)
window.addEventListener("hashchange", notify)

// SPA navigation via History API
const _pushState = history.pushState.bind(history)
const _replaceState = history.replaceState.bind(history)

history.pushState = (...args) => {
  _pushState(...args)
  notify()
}

history.replaceState = (...args) => {
  _replaceState(...args)
  notify()
}
