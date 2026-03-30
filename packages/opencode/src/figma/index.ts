/**
 * Server-side Figma integration — OAuth + REST API client.
 * Provides "Sign in with Figma" flow and REST API calls using per-user OAuth tokens.
 * Token storage uses the Instance-scoped SQLite database.
 */

import { homedir } from "node:os"
import { join } from "node:path"

const TOKEN_URL = "https://api.figma.com/v1/oauth/token"
const REFRESH_URL = "https://api.figma.com/v1/oauth/refresh"
const FIGMA_API = "https://api.figma.com"
const SCOPES = "file_content:read,file_metadata:read"
const MAX_RETRIES = 3
const INITIAL_DELAY_MS = 1000

// ── Types ────────────────────────────────────────────────────────────────────

type TokenData = {
  access_token: string
  refresh_token: string
  expires_at: number
}

export type FigmaImageResponse = {
  err: string | null
  images: Record<string, string | null>
}

export type FigmaNodeDocument = {
  id: string
  name: string
  type: string
  children?: FigmaNodeDocument[]
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  [key: string]: unknown
}

export type FigmaFileNodesResponse = {
  name: string
  nodes: Record<string, { document: FigmaNodeDocument; components: Record<string, unknown> }>
}

export class FigmaApiError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status: number, message: string) {
    super(message)
    this.name = "FigmaApiError"
    this.code = code
    this.status = status
  }
}

// ── CSRF State Store ─────────────────────────────────────────────────────────

const STATE_TTL_MS = 5 * 60 * 1000 // 5 minutes

const pendingStates = new Map<string, number>()

function pruneStates() {
  const now = Date.now()
  for (const [state, expiry] of pendingStates) {
    if (now > expiry) pendingStates.delete(state)
  }
}

function verifyState(state: string): boolean {
  pruneStates()
  if (!pendingStates.has(state)) return false
  pendingStates.delete(state)
  return true
}

// ── Token Storage (file-based, in ~/.opendesign/) ────────────────────────────

function tokenPath(): string {
  return join(homedir(), ".opendesign", "figma-token.json")
}

async function loadToken(): Promise<TokenData | null> {
  try {
    const file = Bun.file(tokenPath())
    if (!(await file.exists())) return null
    return (await file.json()) as TokenData
  } catch {
    return null
  }
}

async function saveToken(data: TokenData): Promise<void> {
  const { mkdir, chmod } = await import("node:fs/promises")
  const dir = join(homedir(), ".opendesign")
  await mkdir(dir, { recursive: true })
  const path = tokenPath()
  await Bun.write(path, JSON.stringify(data))
  await chmod(path, 0o600)
}

async function clearToken(): Promise<void> {
  const { chmod } = await import("node:fs/promises")
  const path = tokenPath()
  try {
    // Overwrite with null rather than deleting — avoids TOCTOU on the path
    await Bun.write(path, "null")
    await chmod(path, 0o600)
  } catch {
    // file doesn't exist, nothing to do
  }
}

// ── OAuth Flow ───────────────────────────────────────────────────────────────

export namespace Figma {
  export function clientId(): string {
    return process.env.FIGMA_CLIENT_ID ?? ""
  }

  function clientSecret(): string {
    return process.env.FIGMA_CLIENT_SECRET ?? ""
  }

  export function getAuthUrl(redirectUri: string): string {
    const id = clientId()
    if (!id) throw new Error("FIGMA_CLIENT_ID is not set")
    const state = crypto.randomUUID()
    pendingStates.set(state, Date.now() + STATE_TTL_MS)
    return (
      `https://www.figma.com/oauth?client_id=${encodeURIComponent(id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&state=${encodeURIComponent(state)}` +
      `&response_type=code`
    )
  }

  export async function exchangeCode(code: string, redirectUri: string, state: string): Promise<TokenData> {
    if (!verifyState(state)) {
      throw new FigmaApiError("figma_invalid_state", 400, "Invalid or expired OAuth state parameter")
    }
    const params = new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    })
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new FigmaApiError("figma_auth_failed", res.status, `Token exchange failed: ${res.status} ${text}`)
    }
    const body = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
    const data: TokenData = {
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      expires_at: Date.now() + body.expires_in * 1000,
    }
    await saveToken(data)
    return data
  }

  async function refreshToken(token: TokenData): Promise<TokenData> {
    const params = new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: token.refresh_token,
    })
    const res = await fetch(REFRESH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    if (!res.ok) {
      await clearToken()
      throw new FigmaApiError("figma_auth_required", res.status, `Token refresh failed: ${res.status}`)
    }
    const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
    const next: TokenData = {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? token.refresh_token,
      expires_at: Date.now() + body.expires_in * 1000,
    }
    await saveToken(next)
    return next
  }

  export async function getAccessToken(): Promise<string> {
    const token = await loadToken()
    if (!token) throw new FigmaApiError("figma_auth_required", 401, "Not authenticated with Figma")
    if (Date.now() >= token.expires_at - 60_000) {
      const next = await refreshToken(token)
      return next.access_token
    }
    return token.access_token
  }

  export async function isAuthenticated(): Promise<boolean> {
    const token = await loadToken()
    return token !== null
  }

  export async function disconnect(): Promise<void> {
    await clearToken()
  }

  // ── REST API ─────────────────────────────────────────────────────────────

  async function request<T>(path: string): Promise<T> {
    const token = await getAccessToken()
    console.log(`[figma-api] request: ${path}`)
    let attempt = 0
    while (true) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 30_000) // 30s timeout
      try {
        const res = await fetch(`${FIGMA_API}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        })
        clearTimeout(timeout)
        console.log(`[figma-api] response: ${res.status} for ${path}`)
        if (res.status === 401) throw new FigmaApiError("figma_auth_required", 401, "Figma authentication required")
        if (res.status === 429) {
          attempt++
          if (attempt >= MAX_RETRIES) throw new FigmaApiError("figma_rate_limited", 429, "Figma rate limit exceeded")
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "0", 10)
          const rawDelay = Math.max(retryAfter * 1000, INITIAL_DELAY_MS * Math.pow(2, attempt - 1))
          const delay = Math.min(rawDelay, 10_000) // cap at 10 seconds
          console.log(`[figma-api] rate limited, retry #${attempt} in ${delay}ms (raw: ${rawDelay}ms)`)
          await new Promise((r) => setTimeout(r, delay))
          continue
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "")
          console.log(`[figma-api] error: ${res.status} ${res.statusText} — ${body.substring(0, 200)}`)
          throw new FigmaApiError("figma_api_error", res.status, `Figma API: ${res.status} ${res.statusText}`)
        }
        return res.json() as Promise<T>
      } catch (e) {
        clearTimeout(timeout)
        if (e instanceof FigmaApiError) throw e
        console.log(`[figma-api] fetch error for ${path}:`, e)
        throw new FigmaApiError("figma_api_error", 500, `Figma API request failed: ${e}`)
      }
    }
  }

  export async function getImage(fileKey: string, nodeId: string, opts?: { scale?: number; format?: string }): Promise<FigmaImageResponse> {
    const params = new URLSearchParams({ ids: nodeId })
    if (opts?.scale) params.set("scale", String(opts.scale))
    if (opts?.format) params.set("format", opts.format)
    return request<FigmaImageResponse>(`/v1/images/${fileKey}?${params.toString()}`)
  }

  export async function getFileNodes(fileKey: string, nodeIds: string[]): Promise<FigmaFileNodesResponse> {
    const ids = nodeIds.join(",")
    return request<FigmaFileNodesResponse>(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}`)
  }

  export async function getComponents(fileKey: string) {
    return request<{ meta: { components: unknown[] } }>(`/v1/files/${fileKey}/components`)
  }

  export async function getVariables(fileKey: string) {
    return request<{ meta: { variables: Record<string, unknown>; variableCollections: Record<string, unknown> } }>(
      `/v1/files/${fileKey}/variables/local`,
    )
  }

  export async function getStyles(fileKey: string) {
    return request<{ meta: { styles: unknown[] } }>(`/v1/files/${fileKey}/styles`)
  }
}
