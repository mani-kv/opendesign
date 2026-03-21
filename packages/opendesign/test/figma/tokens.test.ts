import { test, expect } from "bun:test"
import { tokensToMap, tokensToCssVars, generateTokensCss, groupTokensByType } from "../../src/figma/tokens"
import type { FigmaTokenRef } from "../../src/types/figma"

const SAMPLE_REFS: FigmaTokenRef[] = [
  { collection: "primitives", name: "blue-500", type: "color", value: "#3b82f6" },
  { collection: "primitives", name: "red-500", type: "color", value: "#ef4444" },
  { collection: "spacing", name: "sm", type: "spacing", value: "8px" },
  { collection: "spacing", name: "md", type: "spacing", value: "16px" },
]

test("tokensToMap creates flat map from refs", () => {
  const map = tokensToMap(SAMPLE_REFS)
  expect(map["primitives/blue-500"]).toBe("#3b82f6")
  expect(map["spacing/sm"]).toBe("8px")
  expect(Object.keys(map)).toHaveLength(4)
})

test("tokensToCssVars generates CSS vars with prefix", () => {
  const css = tokensToCssVars(SAMPLE_REFS)
  expect(css).toContain("--figma-primitives-blue-500: #3b82f6;")
  expect(css).toContain("--figma-spacing-sm: 8px;")
})

test("tokensToCssVars uses custom prefix", () => {
  const css = tokensToCssVars(SAMPLE_REFS, "--ds")
  expect(css).toContain("--ds-primitives-blue-500: #3b82f6;")
})

test("generateTokensCss wraps in :root", () => {
  const css = generateTokensCss(SAMPLE_REFS)
  expect(css).toMatch(/^:root \{/)
  expect(css).toMatch(/\}$/)
  expect(css).toContain("--figma-primitives-blue-500: #3b82f6;")
})

test("groupTokensByType groups correctly", () => {
  const grouped = groupTokensByType(SAMPLE_REFS)
  expect(grouped.color).toHaveLength(2)
  expect(grouped.spacing).toHaveLength(2)
  expect(Object.keys(grouped)).toHaveLength(2)
})
