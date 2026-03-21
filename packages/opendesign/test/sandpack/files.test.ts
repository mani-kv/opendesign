import { test, expect } from "bun:test"
import { toSandpackFileMap, detectEntryFile } from "../../src/sandpack/files"

test("toSandpackFileMap normalizes paths to start with /", () => {
  const result = toSandpackFileMap({
    "src/App.tsx": "code1",
    "/src/utils.ts": "code2",
  })

  expect(result["/src/App.tsx"]).toBeDefined()
  expect(result["/src/App.tsx"].code).toBe("code1")
  expect(result["/src/utils.ts"].code).toBe("code2")
})

test("toSandpackFileMap marks hidden files based on patterns", () => {
  const result = toSandpackFileMap({
    "src/App.tsx": "code",
    "node_modules/react/index.js": "react",
    ".git/config": "git",
  })

  expect(result["/src/App.tsx"].hidden).toBeUndefined()
  expect(result["/node_modules/react/index.js"].hidden).toBe(true)
  expect(result["/.git/config"].hidden).toBe(true)
})

test("toSandpackFileMap uses custom hidden patterns", () => {
  const result = toSandpackFileMap(
    { "src/secret.ts": "secret", "src/App.tsx": "app" },
    { hiddenPatterns: ["secret"] },
  )

  expect(result["/src/secret.ts"].hidden).toBe(true)
  expect(result["/src/App.tsx"].hidden).toBeUndefined()
})

test("detectEntryFile finds App.tsx", () => {
  const files = {
    "/src/App.tsx": { code: "app" },
    "/src/index.tsx": { code: "index" },
  }
  expect(detectEntryFile(files)).toBe("/src/App.tsx")
})

test("detectEntryFile falls back through candidates", () => {
  const files = {
    "/src/App.jsx": { code: "app" },
    "/src/index.tsx": { code: "index" },
  }
  expect(detectEntryFile(files)).toBe("/src/App.jsx")
})

test("detectEntryFile falls back to first tsx/jsx file", () => {
  const files = {
    "/src/Main.tsx": { code: "main" },
    "/src/helpers.ts": { code: "helpers" },
  }
  expect(detectEntryFile(files)).toBe("/src/Main.tsx")
})

test("detectEntryFile returns default when no match", () => {
  const files = {
    "/src/utils.ts": { code: "utils" },
  }
  expect(detectEntryFile(files)).toBe("/src/App.tsx")
})
