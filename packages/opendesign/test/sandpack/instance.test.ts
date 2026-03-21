import { test, expect } from "bun:test"
import { createSandpackConfig, updateSandpackFiles, scaffoldReactFiles } from "../../src/sandpack/instance"

test("createSandpackConfig creates config with correct defaults", () => {
  const config = createSandpackConfig({
    agentNodeId: "node-1",
    branch: "agent/dark-mode",
    files: { "/src/App.tsx": { code: "export default () => <div />" } },
  })

  expect(config.id).toBe("sandpack_node-1")
  expect(config.agentNodeId).toBe("node-1")
  expect(config.branch).toBe("agent/dark-mode")
  expect(config.entryFile).toBe("/src/App.tsx")
  expect(config.dependencies).toEqual({})
  expect(config.files["/src/App.tsx"].code).toBe("export default () => <div />")
})

test("createSandpackConfig uses provided entryFile and dependencies", () => {
  const config = createSandpackConfig({
    agentNodeId: "node-2",
    branch: "agent/light",
    files: {},
    entryFile: "/src/Main.tsx",
    dependencies: { react: "^18.0.0" },
  })

  expect(config.entryFile).toBe("/src/Main.tsx")
  expect(config.dependencies).toEqual({ react: "^18.0.0" })
})

test("updateSandpackFiles merges files correctly", () => {
  const config = createSandpackConfig({
    agentNodeId: "node-1",
    branch: "main",
    files: {
      "/src/App.tsx": { code: "old" },
      "/src/utils.ts": { code: "utils" },
    },
  })

  const updated = updateSandpackFiles(config, {
    "/src/App.tsx": { code: "new" },
    "/src/extra.ts": { code: "extra" },
  })

  expect(updated.files["/src/App.tsx"].code).toBe("new")
  expect(updated.files["/src/utils.ts"].code).toBe("utils")
  expect(updated.files["/src/extra.ts"].code).toBe("extra")
  // Original not mutated
  expect(config.files["/src/App.tsx"].code).toBe("old")
})

test("scaffoldReactFiles generates expected file structure", () => {
  const files = scaffoldReactFiles("function App() { return <h1>Hi</h1> }")

  expect(files["/src/App.tsx"].code).toBe("function App() { return <h1>Hi</h1> }")
  expect(files["/src/index.tsx"].code).toContain("createRoot")
  expect(files["/src/tokens.css"].code).toBe("")
  expect(files["/public/index.html"].hidden).toBe(true)
})

test("scaffoldReactFiles includes tokens CSS when provided", () => {
  const files = scaffoldReactFiles("export default () => <div />", ":root { --color: red; }")
  expect(files["/src/tokens.css"].code).toBe(":root { --color: red; }")
})
