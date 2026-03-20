import { test, expect } from "bun:test"
import { parseFigmaUrl, buildFigmaEmbedUrl } from "../../src/figma/parse"

test("parseFigmaUrl extracts key from design URL", () => {
  const result = parseFigmaUrl("https://www.figma.com/design/abc123XYZ/My-Design")
  expect(result).toEqual({ key: "abc123XYZ", type: "design" })
})

test("parseFigmaUrl extracts key from file URL", () => {
  const result = parseFigmaUrl("https://figma.com/file/def456/Other")
  expect(result).toEqual({ key: "def456", type: "file" })
})

test("parseFigmaUrl extracts key from proto URL", () => {
  const result = parseFigmaUrl("https://www.figma.com/proto/ghi789/Proto-Test")
  expect(result).toEqual({ key: "ghi789", type: "proto" })
})

test("parseFigmaUrl extracts key from board URL", () => {
  const result = parseFigmaUrl("https://figma.com/board/jkl012/Board-Name")
  expect(result).toEqual({ key: "jkl012", type: "board" })
})

test("parseFigmaUrl returns null for invalid URL", () => {
  expect(parseFigmaUrl("https://google.com")).toBeNull()
  expect(parseFigmaUrl("not a url")).toBeNull()
  expect(parseFigmaUrl("")).toBeNull()
})

test("parseFigmaUrl handles URL without protocol", () => {
  const result = parseFigmaUrl("figma.com/design/abc123/Test")
  expect(result).toEqual({ key: "abc123", type: "design" })
})

test("buildFigmaEmbedUrl creates correct embed URL", () => {
  const url = buildFigmaEmbedUrl("abc123")
  expect(url).toBe("https://embed.figma.com/design/abc123?embed-host=opendesign")
})

test("buildFigmaEmbedUrl handles proto type", () => {
  const url = buildFigmaEmbedUrl("abc123", "proto")
  expect(url).toBe("https://embed.figma.com/proto/abc123?embed-host=opendesign")
})

test("buildFigmaEmbedUrl maps file to design", () => {
  const url = buildFigmaEmbedUrl("abc123", "file")
  expect(url).toBe("https://embed.figma.com/design/abc123?embed-host=opendesign")
})

test("buildFigmaEmbedUrl accepts custom host", () => {
  const url = buildFigmaEmbedUrl("abc123", "design", "myapp")
  expect(url).toBe("https://embed.figma.com/design/abc123?embed-host=myapp")
})
