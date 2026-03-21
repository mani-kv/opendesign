import { test, expect } from "bun:test"
import { detectDocType, createContextDoc, filterByType, pendingIndexing } from "../../src/context/documents"
import type { ContextDocument } from "../../src/types/context-doc"

test("detectDocType detects markdown", () => {
  expect(detectDocType("readme.md")).toBe("markdown")
  expect(detectDocType("notes.markdown")).toBe("markdown")
})

test("detectDocType detects pdf", () => {
  expect(detectDocType("spec.pdf")).toBe("pdf")
})

test("detectDocType detects image types", () => {
  expect(detectDocType("logo.png")).toBe("image")
  expect(detectDocType("photo.jpg")).toBe("image")
  expect(detectDocType("icon.svg")).toBe("image")
  expect(detectDocType("banner.webp")).toBe("image")
})

test("detectDocType defaults to text for unknown extensions", () => {
  expect(detectDocType("data.csv")).toBe("text")
  expect(detectDocType("config.yaml")).toBe("text")
})

test("createContextDoc creates with correct type", () => {
  const doc = createContextDoc({ name: "design.pdf", path: "/tmp/design.pdf" })
  expect(doc.name).toBe("design.pdf")
  expect(doc.type).toBe("pdf")
  expect(doc.path).toBe("/tmp/design.pdf")
  expect(doc.indexed).toBe(false)
  expect(doc.id).toMatch(/^doc_/)
})

test("createContextDoc uses explicit type override", () => {
  const doc = createContextDoc({ name: "notes.txt", path: "/tmp/notes.txt", type: "markdown" })
  expect(doc.type).toBe("markdown")
})

test("filterByType filters correctly", () => {
  const docs: ContextDocument[] = [
    { id: "1", name: "a.md", type: "markdown", path: "/a.md", addedAt: 1, indexed: false },
    { id: "2", name: "b.png", type: "image", path: "/b.png", addedAt: 2, indexed: false },
    { id: "3", name: "c.md", type: "markdown", path: "/c.md", addedAt: 3, indexed: true },
  ]
  const filtered = filterByType(docs, "markdown")
  expect(filtered).toHaveLength(2)
  expect(filtered.every((d) => d.type === "markdown")).toBe(true)
})

test("pendingIndexing returns only non-indexed docs", () => {
  const docs: ContextDocument[] = [
    { id: "1", name: "a.md", type: "markdown", path: "/a.md", addedAt: 1, indexed: true },
    { id: "2", name: "b.png", type: "image", path: "/b.png", addedAt: 2, indexed: false },
    { id: "3", name: "c.txt", type: "text", path: "/c.txt", addedAt: 3, indexed: false },
  ]
  const pending = pendingIndexing(docs)
  expect(pending).toHaveLength(2)
  expect(pending.every((d) => !d.indexed)).toBe(true)
})
