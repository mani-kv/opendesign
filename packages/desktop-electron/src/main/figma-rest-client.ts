/**
 * Typed Figma REST API client with auth injection, typed errors, and retry logic.
 */

// ── Figma REST response shapes ────────────────────────────────────────────────

export type FigmaColor = { r: number; g: number; b: number; a: number }

export type FigmaNodeBase = {
  id: string
  name: string
  type: string
}

export type FigmaNodeDocument = FigmaNodeBase & {
  children?: FigmaNodeDocument[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  fills?: unknown[]
  strokes?: unknown[]
  [key: string]: unknown
}

export type FigmaFileNodesResponse = {
  name: string
  nodes: Record<string, { document: FigmaNodeDocument; components: Record<string, unknown> }>
}

export type FigmaVariableValue = string | number | boolean | FigmaColor

export type FigmaVariable = {
  id: string
  name: string
  key: string
  variableCollectionId: string
  resolvedType: "BOOLEAN" | "FLOAT" | "STRING" | "COLOR"
  valuesByMode: Record<string, FigmaVariableValue>
  remote: boolean
  description: string
  hiddenFromPublishing: boolean
  scopes: string[]
}

export type FigmaVariableCollection = {
  id: string
  name: string
  key: string
  modes: { modeId: string; name: string }[]
  defaultModeId: string
  remote: boolean
  hiddenFromPublishing: boolean
  variableIds: string[]
}

export type FigmaVariablesResponse = {
  status: number
  error: boolean
  meta: {
    variables: Record<string, FigmaVariable>
    variableCollections: Record<string, FigmaVariableCollection>
  }
}

export type FigmaStyle = {
  key: string
  name: string
  description: string
  style_type: "FILL" | "TEXT" | "EFFECT" | "GRID"
  remote: boolean
  node_id: string
}

export type FigmaStylesResponse = {
  styles: FigmaStyle[]
}

export type FigmaImageFormat = "jpg" | "png" | "svg" | "pdf"

export type FigmaImageOptions = {
  scale?: number
  format?: FigmaImageFormat
  svg_include_id?: boolean
  svg_simplify_stroke?: boolean
  use_absolute_bounds?: boolean
  version?: string
}

export type FigmaImageResponse = {
  err: string | null
  images: Record<string, string | null>
  status?: number
}

// ── Error types ───────────────────────────────────────────────────────────────

export type FigmaErrorCode = "figma_auth_required" | "figma_rate_limited" | "figma_api_error"

export class FigmaApiError extends Error {
  readonly code: FigmaErrorCode
  readonly status: number

  constructor(code: FigmaErrorCode, status: number, message: string) {
    super(message)
    this.name = "FigmaApiError"
    this.code = code
    this.status = status
  }
}

// ── Config ────────────────────────────────────────────────────────────────────

export type FigmaRestClientConfig = {
  getToken: () => Promise<string | null>
  baseUrl?: string
  maxRetries?: number
  initialRetryDelayMs?: number
}

// ── Client ────────────────────────────────────────────────────────────────────

const FIGMA_BASE_URL = "https://api.figma.com"
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 1000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  token: string,
  maxRetries: number,
  initialDelayMs: number,
): Promise<Response> {
  let attempt = 0
  while (true) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (res.status === 401) throw new FigmaApiError("figma_auth_required", 401, "Figma authentication required")

    if (res.status === 429) {
      attempt++
      if (attempt >= maxRetries) throw new FigmaApiError("figma_rate_limited", 429, "Figma rate limit exceeded")
      await sleep(initialDelayMs * Math.pow(2, attempt - 1))
      continue
    }

    if (!res.ok) throw new FigmaApiError("figma_api_error", res.status, `Figma API error: ${res.status} ${res.statusText}`)

    return res
  }
}

export class FigmaRestClient {
  private readonly getToken: () => Promise<string | null>
  private readonly baseUrl: string
  private readonly maxRetries: number
  private readonly initialDelayMs: number

  constructor(config: FigmaRestClientConfig) {
    this.getToken = config.getToken
    this.baseUrl = config.baseUrl ?? FIGMA_BASE_URL
    this.maxRetries = config.maxRetries ?? MAX_RETRIES
    this.initialDelayMs = config.initialRetryDelayMs ?? INITIAL_DELAY_MS
  }

  private async request<T>(path: string): Promise<T> {
    const token = await this.getToken()
    if (!token) throw new FigmaApiError("figma_auth_required", 401, "No Figma token available")
    const res = await fetchWithRetry(`${this.baseUrl}${path}`, token, this.maxRetries, this.initialDelayMs)
    return res.json() as Promise<T>
  }

  getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaFileNodesResponse> {
    const ids = nodeIds.join(",")
    return this.request<FigmaFileNodesResponse>(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`)
  }

  getVariables(fileKey: string): Promise<FigmaVariablesResponse> {
    return this.request<FigmaVariablesResponse>(`/v1/files/${fileKey}/variables/local`)
  }

  getStyles(fileKey: string): Promise<FigmaStylesResponse> {
    return this.request<FigmaStylesResponse>(`/v1/files/${fileKey}/styles`)
  }

  getImage(fileKey: string, nodeId: string, opts?: FigmaImageOptions): Promise<FigmaImageResponse> {
    const params = new URLSearchParams({ ids: nodeId })
    if (opts?.scale != null) params.set("scale", String(opts.scale))
    if (opts?.format) params.set("format", opts.format)
    if (opts?.svg_include_id != null) params.set("svg_include_id", String(opts.svg_include_id))
    if (opts?.svg_simplify_stroke != null) params.set("svg_simplify_stroke", String(opts.svg_simplify_stroke))
    if (opts?.use_absolute_bounds != null) params.set("use_absolute_bounds", String(opts.use_absolute_bounds))
    if (opts?.version) params.set("version", opts.version)
    return this.request<FigmaImageResponse>(`/v1/images/${fileKey}?${params.toString()}`)
  }
}
