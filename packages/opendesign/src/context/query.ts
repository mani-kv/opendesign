/**
 * A RAG query request to send to the server.
 */
export interface ContextQuery {
  query: string
  documentIds?: string[]
  maxResults?: number
}

/**
 * A RAG query result from the server.
 */
export interface ContextResult {
  documentId: string
  documentName: string
  snippet: string
  relevance: number
}

/**
 * Build a context query for the orchestrator agent.
 */
export function buildContextQuery(
  query: string,
  options?: { documentIds?: string[]; maxResults?: number },
): ContextQuery {
  return {
    query,
    documentIds: options?.documentIds,
    maxResults: options?.maxResults ?? 5,
  }
}

/**
 * Format RAG results as context for agent prompts.
 */
export function formatContextForPrompt(results: ContextResult[]): string {
  if (results.length === 0) return ""

  return results
    .map((r) => `[${r.documentName}] (relevance: ${(r.relevance * 100).toFixed(0)}%)\n${r.snippet}`)
    .join("\n\n---\n\n")
}
