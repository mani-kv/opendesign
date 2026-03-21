import type { SandpackFileMap } from "../types/sandpack"

export interface SandpackConfig {
  id: string
  agentNodeId: string
  branch: string
  entryFile: string
  files: SandpackFileMap
  dependencies: Record<string, string>
}

/**
 * Create a Sandpack configuration from branch files.
 */
export function createSandpackConfig(input: {
  agentNodeId: string
  branch: string
  files: SandpackFileMap
  entryFile?: string
  dependencies?: Record<string, string>
}): SandpackConfig {
  return {
    id: `sandpack_${input.agentNodeId}`,
    agentNodeId: input.agentNodeId,
    branch: input.branch,
    entryFile: input.entryFile ?? "/src/App.tsx",
    files: input.files,
    dependencies: input.dependencies ?? {},
  }
}

/**
 * Merge updated files into existing Sandpack config.
 * Only replaces files that changed.
 */
export function updateSandpackFiles(config: SandpackConfig, updates: SandpackFileMap): SandpackConfig {
  return {
    ...config,
    files: { ...config.files, ...updates },
  }
}

/**
 * Build a minimal Sandpack file map for a React project.
 */
export function scaffoldReactFiles(componentCode: string, tokensCSS = ""): SandpackFileMap {
  return {
    "/src/App.tsx": { code: componentCode },
    "/src/index.tsx": {
      code: `import { createRoot } from "react-dom/client"
import App from "./App"
import "./tokens.css"

createRoot(document.getElementById("root")!).render(<App />)`,
    },
    "/src/tokens.css": { code: tokensCSS },
    "/public/index.html": {
      code: `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /></head>
<body><div id="root"></div></body></html>`,
      hidden: true,
    },
  }
}
