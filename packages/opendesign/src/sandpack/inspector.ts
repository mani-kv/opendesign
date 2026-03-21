/**
 * Message types for the Sandpack inspector protocol.
 * The inspector shim is injected into Sandpack iframes to enable
 * DOM element selection for follow-up prompts.
 */
export interface InspectorSelectMessage {
  type: "opendesign:inspector:select"
  element: {
    tagName: string
    className: string
    id: string
    textContent: string
    rect: { x: number; y: number; width: number; height: number }
    path: string // CSS selector path
  }
}

export interface InspectorHoverMessage {
  type: "opendesign:inspector:hover"
  rect: { x: number; y: number; width: number; height: number } | null
}

export type InspectorMessage = InspectorSelectMessage | InspectorHoverMessage

/**
 * Build the CSS selector path for a DOM element description.
 */
export function buildSelectorPath(element: { tagName: string; className: string; id: string }): string {
  const tag = element.tagName.toLowerCase()
  if (element.id) return `${tag}#${element.id}`
  if (element.className) {
    const cls = element.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".")
    return `${tag}.${cls}`
  }
  return tag
}

/**
 * Generate the inspector shim script to inject into Sandpack iframes.
 * When select mode is active, clicking an element sends a message to the parent.
 */
export function inspectorShimScript(): string {
  return `
(function() {
  let active = false;
  let overlay = null;

  window.addEventListener("message", (e) => {
    if (e.data?.type === "opendesign:inspector:activate") {
      active = true;
      document.body.style.cursor = "crosshair";
    }
    if (e.data?.type === "opendesign:inspector:deactivate") {
      active = false;
      document.body.style.cursor = "";
      if (overlay) { overlay.remove(); overlay = null; }
    }
  });

  document.addEventListener("mouseover", (e) => {
    if (!active) return;
    const rect = e.target.getBoundingClientRect();
    window.parent.postMessage({
      type: "opendesign:inspector:hover",
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }, "*");
  }, true);

  document.addEventListener("click", (e) => {
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.target;
    const rect = el.getBoundingClientRect();
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.id) selector += "#" + current.id;
      else if (current.className) selector += "." + current.className.split(" ")[0];
      path.unshift(selector);
      current = current.parentElement;
    }
    window.parent.postMessage({
      type: "opendesign:inspector:select",
      element: {
        tagName: el.tagName,
        className: el.className || "",
        id: el.id || "",
        textContent: (el.textContent || "").slice(0, 100),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        path: path.join(" > ")
      }
    }, "*");
  }, true);
})();`
}
