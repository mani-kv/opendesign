import { test, expect } from "bun:test"
import { createRoot } from "solid-js"
import { createDesignSystemRegistry } from "../../src/design-system/registry"
import type { DesignSystemEntry, ComponentRef } from "../../src/types/design-system"

function makeEntry(id: string, name = id): DesignSystemEntry {
  return {
    id,
    name,
    tokens: { id: `tok_${id}`, name: `${name} tokens`, tokens: { "color.primary": "#000" } },
    components: [],
  }
}

test("add: adds entry and auto-sets activeId on first add", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    expect(reg.state.systems).toHaveLength(0)
    expect(reg.state.activeId).toBeNull()

    const entry = makeEntry("ds1", "Material")
    reg.add(entry)
    expect(reg.state.systems).toHaveLength(1)
    expect(reg.state.activeId).toBe("ds1")

    const entry2 = makeEntry("ds2", "Tailwind")
    reg.add(entry2)
    expect(reg.state.systems).toHaveLength(2)
    expect(reg.state.activeId).toBe("ds1")
    dispose()
  })
})

test("remove: removes entry and resets activeId if removed was active", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    reg.add(makeEntry("ds1"))
    reg.add(makeEntry("ds2"))
    expect(reg.state.activeId).toBe("ds1")

    reg.remove("ds1")
    expect(reg.state.systems).toHaveLength(1)
    expect(reg.state.activeId).toBe("ds2")

    reg.remove("ds2")
    expect(reg.state.systems).toHaveLength(0)
    expect(reg.state.activeId).toBeNull()
    dispose()
  })
})

test("setActive: changes active design system", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    reg.add(makeEntry("ds1"))
    reg.add(makeEntry("ds2"))

    reg.setActive("ds2")
    expect(reg.state.activeId).toBe("ds2")

    // setting to nonexistent id does nothing
    reg.setActive("nonexistent")
    expect(reg.state.activeId).toBe("ds2")
    dispose()
  })
})

test("active: returns active entry", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    expect(reg.active()).toBeNull()

    reg.add(makeEntry("ds1", "Material"))
    expect(reg.active()?.name).toBe("Material")
    dispose()
  })
})

test("getById: returns entry by id", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    reg.add(makeEntry("ds1", "Material"))
    expect(reg.getById("ds1")?.name).toBe("Material")
    expect(reg.getById("nonexistent")).toBeNull()
    dispose()
  })
})

test("updateTokens: updates tokens and sync time", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    reg.add(makeEntry("ds1"))

    const newTokens = { "color.primary": "#fff", "color.secondary": "#aaa" }
    reg.updateTokens("ds1", newTokens, 12345)

    const ds = reg.getById("ds1")!
    expect(ds.tokens.tokens["color.primary"]).toBe("#fff")
    expect(ds.tokens.tokens["color.secondary"]).toBe("#aaa")
    expect(ds.tokens.lastSynced).toBe(12345)
    dispose()
  })
})

test("updateComponents: replaces components", () => {
  createRoot((dispose) => {
    const reg = createDesignSystemRegistry()
    reg.add(makeEntry("ds1"))
    expect(reg.getById("ds1")!.components).toHaveLength(0)

    const comps: ComponentRef[] = [
      { name: "Button", packageName: "@ui/core", importPath: "@ui/core/Button" },
      { name: "Input", packageName: "@ui/core", importPath: "@ui/core/Input" },
    ]
    reg.updateComponents("ds1", comps)
    expect(reg.getById("ds1")!.components).toHaveLength(2)
    expect(reg.getById("ds1")!.components[0].name).toBe("Button")
    dispose()
  })
})
