import type { ContextDocument, ContextDocType } from "../types/context-doc"

const EXT_MAP: Record<string, ContextDocType> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".svg": "image",
  ".webp": "image",
}

/**
 * Detect document type from file extension.
 */
export function detectDocType(filename: string): ContextDocType {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase()
  return EXT_MAP[ext] ?? "text"
}

/**
 * Create context document metadata.
 */
export function createContextDoc(input: { name: string; path: string; type?: ContextDocType }): ContextDocument {
  return {
    id: `doc_${Date.now().toString(36)}`,
    name: input.name,
    type: input.type ?? detectDocType(input.name),
    path: input.path,
    addedAt: Date.now(),
    indexed: false,
  }
}

/**
 * Filter documents by type.
 */
export function filterByType(docs: ContextDocument[], type: ContextDocType): ContextDocument[] {
  return docs.filter((d) => d.type === type)
}

/**
 * Check if a document has been indexed for RAG.
 */
export function pendingIndexing(docs: ContextDocument[]): ContextDocument[] {
  return docs.filter((d) => !d.indexed)
}
