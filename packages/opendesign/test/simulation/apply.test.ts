import { test, expect } from "bun:test"
import { simulationStyles, simulationAttrs, simulationStyleString } from "../../src/simulation/apply"

test("simulationStyles returns viewport dimensions", () => {
  const styles = simulationStyles({ viewport: { name: "iPhone SE", width: 375, height: 667 } })
  expect(styles.width).toBe("375px")
  expect(styles.height).toBe("667px")
})

test("simulationStyles returns filter for a11y", () => {
  const styles = simulationStyles({ a11yFilter: "protanopia" })
  expect(styles.filter).toContain("protanopia")
})

test("simulationStyles skips filter for none", () => {
  const styles = simulationStyles({ a11yFilter: "none" })
  expect(styles.filter).toBeUndefined()
})

test("simulationStyles returns empty for empty mode", () => {
  const styles = simulationStyles({})
  expect(Object.keys(styles)).toHaveLength(0)
})

test("simulationAttrs returns dir=rtl when rtl", () => {
  const attrs = simulationAttrs({ rtl: true })
  expect(attrs.dir).toBe("rtl")
})

test("simulationAttrs returns lang attribute", () => {
  const attrs = simulationAttrs({ language: "ar" })
  expect(attrs.lang).toBe("ar")
})

test("simulationAttrs returns empty for empty mode", () => {
  const attrs = simulationAttrs({})
  expect(Object.keys(attrs)).toHaveLength(0)
})

test("simulationStyleString builds correct CSS string", () => {
  const css = simulationStyleString({ viewport: { name: "Desktop", width: 1440, height: 900 } })
  expect(css).toContain("width: 1440px")
  expect(css).toContain("height: 900px")
})

test("simulationStyleString returns empty for empty mode", () => {
  const css = simulationStyleString({})
  expect(css).toBe("")
})
