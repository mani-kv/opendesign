import { test, expect } from "bun:test"
import { viewportPresets, viewportByName, a11yFilterCss } from "../../src/simulation/presets"

test("viewportPresets has standard devices", () => {
  const names = viewportPresets.map((p) => p.name)
  expect(names).toContain("iPhone SE")
  expect(names).toContain("Desktop")
  expect(names).toContain("iPad Mini")
})

test("viewportByName returns matching preset", () => {
  const preset = viewportByName("Desktop")
  expect(preset).toBeDefined()
  expect(preset!.width).toBe(1440)
})

test("viewportByName returns undefined for unknown", () => {
  expect(viewportByName("Galaxy Z Fold 12")).toBeUndefined()
})

test("a11yFilterCss returns empty for none", () => {
  expect(a11yFilterCss("none")).toBe("")
})

test("a11yFilterCss returns filter for protanopia", () => {
  expect(a11yFilterCss("protanopia")).toContain("protanopia")
})

test("a11yFilterCss returns contrast for high-contrast", () => {
  expect(a11yFilterCss("high-contrast")).toContain("contrast")
})
