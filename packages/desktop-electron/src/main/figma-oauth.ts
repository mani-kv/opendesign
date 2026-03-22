import { BrowserWindow, safeStorage } from "electron"
import * as http from "node:http"
import * as url from "node:url"
import { getStore } from "./store"

const STORE_NAME = "figma-auth"
const TOKEN_KEY = "token"
const REDIRECT_URI = "http://localhost:19523/figma/callback"
const SCOPES = "files:read,file_variables:read,file_dev_resources:read"
const TOKEN_URL = "https://api.figma.com/v1/oauth/token"
const REFRESH_URL = "https://api.figma.com/v1/oauth/refresh"

type TokenData = {
  access_token: string
  refresh_token: string
  expires_at: number
}

function clientId() {
  return process.env.FIGMA_CLIENT_ID ?? ""
}

function clientSecret() {
  return process.env.FIGMA_CLIENT_SECRET ?? ""
}

function loadToken(): TokenData | null {
  const store = getStore(STORE_NAME)
  const raw = store.get(TOKEN_KEY) as string | undefined
  if (!raw) return null
  if (!safeStorage.isEncryptionAvailable()) return JSON.parse(raw) as TokenData
  try {
    const decrypted = safeStorage.decryptString(Buffer.from(raw as string, "base64"))
    return JSON.parse(decrypted) as TokenData
  } catch {
    return null
  }
}

function saveToken(data: TokenData) {
  const store = getStore(STORE_NAME)
  const json = JSON.stringify(data)
  const encoded = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json).toString("base64")
    : json
  store.set(TOKEN_KEY, encoded)
}

function clearToken() {
  getStore(STORE_NAME).delete(TOKEN_KEY)
}

async function exchangeCode(code: string): Promise<TokenData> {
  const params = new URLSearchParams({
    client_id: clientId(),
    client_secret: clientSecret(),
    redirect_uri: REDIRECT_URI,
    code,
    grant_type: "authorization_code",
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
  const body = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  }
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
    clearToken()
    throw new Error(`Token refresh failed: ${res.status}`)
  }
  const body = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number }
  const next: TokenData = {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  }
  saveToken(next)
  return next
}

function waitForCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const parsed = url.parse(req.url ?? "", true)
      if (!parsed.pathname?.startsWith("/figma/callback")) {
        res.writeHead(404)
        res.end()
        return
      }
      const code = parsed.query["code"] as string | undefined
      const error = parsed.query["error"] as string | undefined
      res.writeHead(200, { "Content-Type": "text/html" })
      res.end("<html><body><h2>Connected to Figma. You can close this tab.</h2></body></html>")
      server.close()
      if (error) return reject(new Error(`OAuth error: ${error}`))
      if (!code) return reject(new Error("No code in callback"))
      resolve(code)
    })
    server.listen(19523, "127.0.0.1", () => {})
    server.on("error", reject)
  })
}

export async function startOAuthFlow(): Promise<void> {
  const id = clientId()
  if (!id) throw new Error("FIGMA_CLIENT_ID is not set")

  const authUrl =
    `https://www.figma.com/oauth?client_id=${encodeURIComponent(id)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}` +
    `&state=opendesign` +
    `&response_type=code`

  const callbackPromise = waitForCallback()

  const win = new BrowserWindow({
    width: 800,
    height: 700,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
    title: "Connect to Figma",
  })
  win.loadURL(authUrl)

  const code = await callbackPromise.finally(() => {
    if (!win.isDestroyed()) win.close()
  })

  const data = await exchangeCode(code)
  saveToken(data)
}

export async function getAccessToken(): Promise<string> {
  const token = loadToken()
  if (!token) throw new Error("Not authenticated with Figma")
  // refresh 60 s before expiry
  if (Date.now() >= token.expires_at - 60_000) {
    const next = await refreshToken(token)
    return next.access_token
  }
  return token.access_token
}

export function isAuthenticated(): boolean {
  return loadToken() !== null
}
