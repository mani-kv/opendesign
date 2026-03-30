import { onMount } from "solid-js"

export default function FigmaCallback() {
  onMount(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const error = params.get("error")

    // Verify opener exists and is same-origin before posting
    let openerSameOrigin = false
    try {
      openerSameOrigin = !!(window.opener && window.opener.location.origin === window.location.origin)
    } catch {
      // Cross-origin opener — accessing .location throws; treat as untrusted
      openerSameOrigin = false
    }

    if (code && state && openerSameOrigin) {
      window.opener.postMessage({ type: "figma-oauth-callback", code, state }, window.location.origin)
      setTimeout(() => window.close(), 1000)
    } else if (error) {
      document.body.textContent = `Figma authentication failed: ${error}`
    } else {
      document.body.textContent = "No authorization code received."
    }
  })

  return (
    <div
      style={{
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        height: "100vh",
        "font-family": "system-ui",
        color: "#666",
      }}
    >
      Connected to Figma. This window will close automatically.
    </div>
  )
}
