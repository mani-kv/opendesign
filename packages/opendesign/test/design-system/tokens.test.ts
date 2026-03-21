import { test, expect } from "bun:test"
import { tokensToCss, tokensToStylesheet, diffTokens } from "../../src/design-system/tokens"

test("tokensToCss: converts tokens to CSS vars with prefix", () => {
  const tokens = { "color.primary": "#000", "spacing.md": "16px" }
  const css = tokensToCss(tokens)
  expect(css).toContain("--od-color-primary: #000;")
  expect(css).toContain("--od-spacing-md: 16px;")
})

test("tokensToCss: custom prefix", () => {
  const tokens = { bg: "#fff" }
  const css = tokensToCss(tokens, "--my")
  expect(css).toContain("--my-bg: #fff;")
})

test("tokensToStylesheet: wraps in :root", () => {
  const tokens = { "color.primary": "#000" }
  const sheet = tokensToStylesheet(tokens)
  expect(sheet).toMatch(/^:root \{/)
  expect(sheet).toMatch(/\}$/)
  expect(sheet).toContain("--od-color-primary: #000;")
})

test("diffTokens: detects added tokens", () => {
  const prev = { a: "1" }
  const next = { a: "1", b: "2" }
  const diff = diffTokens(prev, next)
  expect(diff.added).toEqual(["b"])
  expect(diff.removed).toEqual([])
  expect(diff.changed).toEqual([])
})

test("diffTokens: detects removed tokens", () => {
  const prev = { a: "1", b: "2" }
  const next = { a: "1" }
  const diff = diffTokens(prev, next)
  expect(diff.added).toEqual([])
  expect(diff.removed).toEqual(["b"])
  expect(diff.changed).toEqual([])
})

test("diffTokens: detects changed tokens", () => {
  const prev = { a: "1", b: "2" }
  const next = { a: "1", b: "3" }
  const diff = diffTokens(prev, next)
  expect(diff.added).toEqual([])
  expect(diff.removed).toEqual([])
  expect(diff.changed).toEqual(["b"])
})

test("diffTokens: detects all change types simultaneously", () => {
  const prev = { a: "1", b: "2", c: "3" }
  const next = { a: "1", b: "999", d: "4" }
  const diff = diffTokens(prev, next)
  expect(diff.added).toEqual(["d"])
  expect(diff.removed).toEqual(["c"])
  expect(diff.changed).toEqual(["b"])
})
