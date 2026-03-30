# Figma Integration Architecture Spec

## Status

**Approved** — 2026-03-29 (Updated 2026-03-30 with hybrid SVG-on-raster architecture)

Consensus reached via multi-model review (GPT-5.2, Gemini 2.5 Pro, Claude Opus 4.6). Addresses rate limit issues discovered during Phase 2 and defines the ideal end-to-end Figma experience.

## Design Principles

- **Zero jargon** — No "MCP", "PAT", "OAuth", "rate limit" in user-facing UI
- **Instant feedback** — User should never wonder "is it loading?"
- **Progressive disclosure** — Simple path first, power-user options hidden
- **Graceful degradation** — Always show SOMETHING, even if low quality
- **One-time setup** — Connect once, never think about it again
- **Objects never disappear** — They degrade to snapshot mode, never vanish

## Problem Statement

Figma's REST API `/images` endpoint has a **render budget** (not just a rate limit) that produces multi-day `Retry-After` values (observed: 396,972 seconds / ~4.5 days) for free-plan users. This makes the REST API unreliable as the primary image acquisition path. Our target audience is UX/Product designers — many on free Figma plans — who just want to paste a Figma URL and see their design.

## The Ideal User Experience

### First Paste (no connection yet)

The canvas is open and ready. No connection step required upfront. When a user first pastes a Figma URL:

```
┌─────────────────────────────────────────┐
│                                         │
│     [Figma logo]  Connect to Figma      │
│                                         │
│     Allow OpenDesign to access your     │
│     Figma files to generate previews.   │
│                                         │
│     [████ Authorize with Figma ████]    │
│                                         │
│     One-time setup. A browser window    │
│     will open for you to grant          │
│     permission.                         │
│                                         │
└─────────────────────────────────────────┘
```

- Clean, minimal OAuth modal — one click, familiar to designers
- After authorization, the import completes automatically — no re-paste needed
- The pasted URL is remembered and processed immediately after auth succeeds

### Every Subsequent Paste (connected)

Progressive rendering — the object upgrades in place:

```
t = 0ms     Skeleton card drops at paste location
            (file name, frame name parsed from URL, shimmer animation)

t = 0-1s    Low-res snapshot appears
            (thumbnail from /files endpoint, or cached image)

t = 1-5s    High-res image replaces it
            (from best available provider, upgrade in place)

t = 5-15s   Structured layers load async (future)
            (hover highlights, component detection, inspect mode)
```

The user sees immediate feedback at every stage. The object is interactive from the moment it appears.

### When Rate Limited (invisible to user)

Never say "rate limit." Instead:

```
"Figma is taking a moment. Using a snapshot now —
 details will sharpen automatically."
```

- Background: silent retry with exponential backoff
- When ready: upgrade in place, no user action needed
- If another provider is available, switch transparently

### Free Plan Power User (hits limits frequently)

One-time, non-blocking suggestion — framed as a perk, not a workaround:

```
"Unlock faster, higher-quality imports."

[Install our free Desktop Companion]

"Works offline and bypasses wait times."
```

### Connection Status (toolbar)

Small Figma icon with status dot — always visible, never scary:

```
[Figma ●] Connected              ← green dot
[Figma ○] Snapshot mode           ← gray, still works
[Figma ⚠] Needs attention        ← amber, one-click fix
```

Click opens a simple connection panel:
- "Connected as [Figma username]"
- "Last successful import: 2 minutes ago"
- [Test connection] [Disconnect]
- "More options" (collapsed): Switch method, Clear cache

### Error Recovery

All errors appear **in-context on the pasted object** — never as a modal blocking the canvas. Each error shows:

1. What happened (plain language)
2. What OpenDesign is doing now (fallback action)
3. One primary fix button
4. "Continue with snapshot" secondary option

| Failure | User sees | Primary action | Fallback |
|---------|-----------|---------------|----------|
| Figma app not running | "Can't reach the Figma app." | "Open Figma" | "Switch connection method" |
| Access expired | "Your Figma access needs a refresh." | "Refresh access" | "Keep snapshot imports" |
| Network down | "You're offline. Using saved previews." | "Retry when online" | "Work offline" |
| Service crashed | "Enhanced import paused unexpectedly." | "Resume" | "Send diagnostics" |
| File not accessible | "This file isn't accessible." | "Request access" | "Import a different link" |

**Existing canvas objects NEVER disappear.** They degrade to snapshot mode with an "upgrade pending" badge.

### Multi-Plan Support (feels identical)

The experience is the same for free and paid users. The backend adapts:

| User type | What happens (invisible to user) |
|-----------|--------------------------------|
| Paid (Dev Mode) | Official MCP or high-limit REST API — fastest, highest fidelity |
| Free (no limits hit) | REST API — works fine for light usage |
| Free (rate limited) | Desktop Companion (Console MCP) — no limits, local |
| Free (no Desktop Companion) | Snapshot from thumbnail + "upgrade available" prompt |

No "free vs paid" language. Only capability language if methods need switching:
- "Best for live updates and high fidelity"
- "Best if your workspace doesn't support account connection"
- "Best offline / on this computer"

## Technical Architecture

### FigmaService (backend-agnostic facade)

The canvas calls a single endpoint. The backend auto-selects the best provider.

```
Canvas (paste Figma URL)
    │
    ▼
POST /figma/image   ← single endpoint, provider-agnostic
    │
    ▼
┌──────────────────────────────────────────────────────┐
│                   FigmaService                        │
│                                                      │
│  Provider Chain (auto-detect, health-based):          │
│                                                      │
│  1. Official MCP  (if available + healthy)            │
│     └── Best for paid users, OAuth, remote            │
│                                                      │
│  2. Console MCP   (if configured + healthy)           │
│     └── Best for free users, local, no rate limits    │
│                                                      │
│  3. REST API      (if authenticated)                  │
│     └── Last resort for images, primary for metadata  │
│     └── Rate limit lockout tracking                   │
│                                                      │
│  4. Thumbnail     (always available if REST auth'd)   │
│     └── Low-res file thumbnail from /files endpoint   │
│                                                      │
│  ┌──────────────────────────────────────────────┐    │
│  │              Image Cache                      │    │
│  │   Key: hash(fileKey, nodeId, scale, format)   │    │
│  │   Storage: ~/.opendesign/cache/ (0700 perms)  │    │
│  │   TTL: 24h or file version change             │    │
│  │   In-flight dedup: Map<key, Promise>          │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

### Provider Priority (for images)

When both Official MCP and Console MCP are available, prefer Official MCP (more secure, OAuth-based, no local dependencies). Console MCP is the fallback for free-plan users.

```
1. Cache          → instant, no API call
2. Official MCP   → paid plans, reliable, remote
3. Console MCP    → free plans, local, no rate limits
4. REST /images   → any plan, but rate limited (with lockout tracking)
5. REST thumbnail → low-res fallback, always works
6. → Onboarding   → nothing available, prompt connection
```

### Provider Priority (for metadata)

```
1. REST API       → primary (cheaper, less restricted)
2. Console MCP    → fallback
3. Official MCP   → fallback
```

### Provider Health Checks

Each provider has a multi-layer health check with **three distinct states:**

```typescript
interface FigmaProvider {
  name: string
  isAvailable(): Promise<boolean>     // config exists + basic connectivity
  isHealthy(): Promise<boolean>       // functional probe (can actually fetch)
  getImage(fileKey, nodeId, opts): Promise<ImageResult>
}

type ProviderState =
  | "healthy"           // working normally
  | "degraded"          // transient failures (5xx, timeouts) — retry after cooldown
  | "auth-invalid"      // 401/403 — credentials expired, user action required
  | "rate-locked"       // 429 — rate limited, retry after Retry-After expires
```

**Health check details:**
- **Official MCP:** MCP client connected + authenticated + tool discovery
- **Console MCP:** MCP client connected + `figma_take_screenshot` tool present + Figma desktop reachable
- **REST API:** OAuth token valid + not in rate limit lockout

**State transitions (critical for correctness):**
- **5xx / timeout** → count toward circuit breaker. After 3 failures → "degraded" for 5 minutes. **Per-file, not global** — one bad file doesn't poison all requests.
- **401 / 403** → immediately set "auth-invalid". Clear cached credentials. Don't retry — prompt user to re-authenticate. This prevents infinite retry loops when a PAT is rotated.
- **429** → set "rate-locked" with `lockedUntil = now + Retry-After`. Only affects the rate-limited endpoint (e.g., REST `/images` locked but REST metadata still healthy). Don't count toward circuit breaker failures.
- **Success after degraded** → reset to "healthy" immediately.

**This prevents:**
- PAT rotation causing infinite retry loops (auth-invalid ≠ provider-down)
- Rate limit on `/images` killing metadata access (separate state per endpoint)
- One corrupted Figma file poisoning the provider for all files (per-file tracking)

### Console MCP Configuration

Shipped with OpenDesign but NOT auto-started. Only started when user enables "Desktop Companion."

```json
{
  "figma-console": {
    "command": "npx",
    "args": ["-y", "figma-console-mcp@0.7.2"],
    "env": {
      "FIGMA_ACCESS_TOKEN": "",
      "ENABLE_MCP_APPS": "true"
    }
  }
}
```

**Security requirements:**
- **Pin exact version** (no `@latest`) — update pinned version with OpenDesign releases
- **PAT storage:** OS keychain on Electron (macOS Keychain, Windows Credential Manager). File with 0600 permissions on CLI/web. Inject at runtime only — never persist in config files.
- **Start only when needed** — don't auto-launch on app startup
- **"Forget token"** action that wipes PAT + clears cached images

### Official Figma MCP Configuration

```json
{
  "figma": {
    "type": "http",
    "url": "https://mcp.figma.com/mcp"
  }
}
```

OAuth handled by OpenCode's existing MCP OAuth infrastructure.

### REST API

Already implemented in `packages/opencode/src/figma/index.ts`. Enhancements:

- **Rate limit lockout:** Track `Retry-After` per user. If > 60s, mark REST `/images` as "locked out." Continue using REST for metadata.
- **File thumbnail:** `GET /v1/files/:key` returns `thumbnailUrl` — use as instant low-res fallback. Different quota bucket from `/images`.
- **Version tracking:** Use `GET /v1/files/:key` `version` field for cache invalidation. Check version every 5 minutes per fileKey (not per session).

### Atomic Asset Bundle

The critical insight from adversarial review: PNG, SVG, and node tree MUST be version-locked. If Figma file changes between fetching PNG and SVG, the overlay won't align with the visual — "wrong highlights on wrong pixels."

```typescript
type AssetBundle = {
  id: string                    // hash(fileKey + nodeId + fileVersion + scale)
  fileKey: string
  nodeId: string
  fileVersion: string           // pinned Figma file version — all assets from same version
  rasterPath: string            // cached PNG file path
  svgPath?: string              // cached sanitized SVG file path
  nodeTree?: FigmaNodeTree      // cached node tree JSON
  checksum: string              // sha256 of raster bytes for integrity
  provider: string              // which provider served this bundle
  fetchedAt: number
}
```

**Fetch sequence (version-pinned):**
```
1. GET /v1/files/:key → extract fileVersion
2. Fetch PNG with ?version={fileVersion}     ← pinned
3. Fetch SVG with ?version={fileVersion}     ← pinned, same version
4. Fetch node tree (already version-scoped)  ← pinned
5. Save all three atomically as a bundle
```

All three assets are guaranteed to be from the same Figma file version. The UI only swaps bundles atomically — never shows PNG from version A with SVG from version B.

### Image Cache

**Storage:** `~/.opendesign/cache/figma-bundles/` with 0700 directory permissions.

**Bundle directory structure:**
```
{bundleId}/
├── raster.png          (the visual truth)
├── overlay.svg         (sanitized SVG for interaction)
├── nodetree.json       (Figma node tree)
└── meta.json           (bundle metadata)
```

Where `bundleId = sha256(fileKey + nodeId + fileVersion + scale)`.

**Meta file:**
```json
{
  "fileKey": "abc123",
  "nodeId": "1:2",
  "fileVersion": "v42",
  "scale": 2,
  "provider": "console-mcp",
  "fetchedAt": 1711700000000,
  "rasterChecksum": "sha256:...",
  "svgSanitized": true,
  "nodeCount": 147
}
```

**Cache rules:**
- TTL: 24 hours
- **Version-based invalidation:** check file version every 5 minutes per fileKey. If version changed → invalidate all bundles for that file. Show "Update available" badge on affected canvas items.
- In-flight dedup: `Map<bundleId, Promise<AssetBundle>>` with cleanup on resolve AND reject
- Atomic writes: write to temp directory, then atomic rename to final bundle path
- Checksum validation: verify `rasterChecksum` on cache read to detect corruption
- "Clear cache" control in settings

### Concurrency Controls

Prevent API stampedes when user pastes many frames or multiple items refresh simultaneously:

- **Max 3 concurrent Figma fetches** — additional requests queued in FIFO order
- **Viewport priority** — items near the viewport are fetched first, off-screen items deferred
- **Batch where possible** — REST `/images` accepts multiple node IDs in one request
- **Dedup by bundleId** — concurrent requests for the same bundle share one fetch Promise

### SVG Sanitization (security-critical)

SVG from Figma export is treated as **untrusted input**. Before rendering as an overlay:

```
Strip: <script>, <foreignObject>, <iframe>
Strip: on* event attributes (onclick, onload, onerror, etc.)
Strip: external references (<image href="http://...">, <use xlink:href="http://...">)
Strip: data URIs in href attributes (potential data exfiltration)
Cap: total path data size (reject if > 5MB to prevent DOM DoS)
Cap: total element count (reject if > 2000 elements, use node-tree fallback instead)
Preserve: data-figma-node-id, data-component-key attributes
Preserve: geometry (paths, rects, circles, groups)
```

Use DOMPurify or equivalent. If sanitization strips essential structure, fall back to node-tree-generated SVG overlay (Approach B).

### Response Format

For large images, avoid base64 in JSON. Instead:

1. **Cache the bundle locally** as files
2. **Serve via local URLs:** `GET /figma/cache/:bundleId/raster` and `GET /figma/cache/:bundleId/overlay`
3. **Return URLs in JSON:** `{ imageUrl, svgUrl, provider, fileVersion, quality }`

This avoids memory bloat and proxy size limits.

### Post-Import Synchronization

Imported designs are snapshots. They can become stale when the source Figma file changes.

**Auto-detection:**
- On canvas load: check file version for each imported item via REST `GET /v1/files/:key`
- Every 5 minutes: poll file versions for visible canvas items
- If version differs from cached bundle → show blue "Update available" dot on the canvas item

**User-triggered refresh:**
- "Refresh" button always available on each canvas item
- Click → re-fetch entire Asset Bundle atomically at new version → upgrade in place

**Source unavailable (file deleted / access revoked):**
- Refresh fails with 404 or 403
- Canvas item shows "Source unavailable" badge
- Options: [Keep as reference] [Remove from canvas]
- Cached snapshot preserved — object doesn't disappear

**This prevents:**
- Users prototyping against stale designs
- Zombie objects with no recovery path
- "Objects never disappear" conflicting with reality (they degrade, not vanish)

## Backend Implementation

### FigmaService Module

**File:** `packages/opencode/src/figma/service.ts`

```typescript
export namespace FigmaService {
  type BundleResult = {
    imageUrl: string       // local cache URL for raster
    svgUrl?: string        // local cache URL for sanitized SVG overlay
    provider: string       // which provider served it
    fileVersion: string    // Figma file version this bundle represents
    quality: "thumbnail" | "standard" | "high"
    nodeCount?: number     // number of nodes in SVG overlay (for perf budgeting)
  }

  // Main entry point — fetches version-pinned Asset Bundle
  export async function getImage(
    fileKey: string,
    nodeId: string,
    opts?: { scale?: number; format?: string }
  ): Promise<BundleResult>

  // Check if file version changed since last fetch
  export async function checkVersion(fileKey: string): Promise<{
    currentVersion: string
    cachedVersion?: string
    changed: boolean
  }>

  // Get all providers and their status
  export async function getProviders(): Promise<ProviderStatus[]>

  // Configure Console MCP with access key
  export async function configureDesktopCompanion(accessKey: string): Promise<void>

  // Get file thumbnail (low-res, no render budget)
  export async function getThumbnail(fileKey: string): Promise<string | null>
}
```

### API Endpoints

```
GET  /figma/auth/status           → { authenticated, provider, userName }
GET  /figma/auth/url              → { url } (OAuth authorization URL)
POST /figma/auth/callback         → { authenticated }
POST /figma/auth/disconnect       → { authenticated: false }

POST /figma/image                 → { imageUrl, svgUrl?, provider, fileVersion, quality }
GET  /figma/cache/:bundleId/:file → binary file (raster.png, overlay.svg, nodetree.json)
GET  /figma/providers             → [{ name, state, method }]
POST /figma/configure             → { configured } (set up Desktop Companion)
GET  /figma/version/:fileKey      → { currentVersion, cachedVersion?, changed }

POST /figma/nodes                 → { name, nodes } (metadata)
```

**Status codes:**
- `200` — bundle available (imageUrl + optional svgUrl)
- `202` — processing, thumbnail available now (poll for upgrade)
- `401` — not authenticated
- `403` — authenticated but no access to this file
- `409` — no provider available, `{ code: "figma_needs_setup", methods: [...] }`
- `429` — rate limited, `{ retryAfter: seconds }`

## Frontend Changes

### Canvas Paste Flow

```
Paste Figma URL
    │
    ├── INSTANT: Drop skeleton card at paste location
    │   (file name + frame name parsed from URL, shimmer animation)
    │
    ▼
POST /figma/image
    │
    ├── 200 + imageUrl + svgUrl
    │   ├── Load raster PNG → upgrade skeleton to image
    │   ├── Load SVG overlay (async) → enable component selection
    │   └── Store fileVersion for future sync checks
    │
    ├── 200 + imageUrl (no svgUrl)
    │   └── Load raster PNG → upgrade skeleton, no overlay yet
    │
    ├── 202 + thumbnailUrl
    │   ├── Show low-res thumbnail → poll for high-res upgrade
    │   └── When ready → swap to full bundle atomically
    │
    ├── 403 (no access to file)
    │   └── In-context: "This file isn't accessible"
    │       [Request access] [Import a different link]
    │
    ├── 409 (needs_setup)
    │   └── Show connection modal (first time only)
    │       After auth → auto-retry with queued URL → upgrade card
    │
    ├── 401 (not authenticated)
    │   └── Show "Authorize with Figma" modal
    │
    ├── 429 (rate limited)
    │   └── In-context: "Figma is taking a moment..."
    │       Background retry. Show thumbnail if available.
    │
    └── 5xx / network error
        └── In-context: "Import paused unexpectedly"
            [Retry] [Keep as placeholder]
```

### Post-Import Canvas Item States

Each canvas item can be in one of these states:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  skeleton   │────▶│   raster    │────▶│   raster +  │
│  (loading)  │     │   only      │     │  SVG overlay │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                          ┌────────────────────┤
                          │                    │
                    ┌─────▼─────┐       ┌──────▼──────┐
                    │  update   │       │   source    │
                    │ available │       │ unavailable │
                    │ (blue dot)│       │  (badge)    │
                    └───────────┘       └─────────────┘
```

- **skeleton** → loading, shimmer animation
- **raster only** → image visible, no component selection yet
- **raster + SVG overlay** → full experience, components selectable
- **update available** → blue dot, "Refresh" action, source file changed in Figma
- **source unavailable** → stale badge, file deleted or access revoked, [Keep] or [Remove]

### Skeleton Card (immediate feedback)

When URL is pasted, before any API call returns:

```
┌──────────────────────────────────┐
│  ┌────────────────────────────┐  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  │  ░░░░░  shimmer  ░░░░░░░  │  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  │  ░░░░░░░░░░░░░░░░░░░░░░░  │  │
│  └────────────────────────────┘  │
│  MyApp / Login Screen            │
│  Getting preview...              │
└──────────────────────────────────┘
```

File name and frame name parsed from URL before any API call.

### Connection Modal

Triggered ONLY on first paste when no provider is available.

After first successful auth, never shown again unless user disconnects.

### Toolbar Figma Button (updated)

```
Connected:     [Figma ●] Figma         ← colored logo, green dot
Snapshot mode: [Figma ○] Figma         ← gray logo, gray dot
Needs fix:     [Figma ⚠] Figma         ← gray logo, amber dot

Click → connection panel (not a dropdown):
  "Connected as designer@company.com"
  "Method: Connected to your Figma account"
  "Last import: 2 minutes ago"
  [Test connection]  [Disconnect]
```

## Implementation Phases

### Phase A: Core Infrastructure (backend)
1. `FigmaService` facade with provider adapters
2. Image cache (hash-based filenames, 0700 perms)
3. Cache serving endpoint (`GET /figma/cache/:hash`)
4. Updated `/figma/image` using FigmaService
5. Rate limit lockout tracking for REST
6. Thumbnail fallback via `/files/:key`

### Phase B: Console MCP Provider (free plan support)
1. Console MCP provider adapter
2. PAT configuration endpoint + secure storage
3. Health check with circuit breaker
4. Pin MCP version in default config
5. Start-on-demand (not auto-start)

### Phase C: Connection UX (frontend)
1. OAuth connection modal (first paste trigger)
2. Progressive rendering (skeleton → thumbnail → high-res)
3. Toolbar status indicator (green/gray/amber dot)
4. In-context error cards on canvas items
5. "Desktop Companion" suggestion for rate-limited users
6. Connection panel (click Figma button)

### Phase D: SVG Overlay + Component Awareness
1. Fetch SVG alongside raster (check for `data-node-id` attributes)
2. If no node IDs in exported SVG: generate SVG overlay from node tree JSON
3. Canvas item renders raster + transparent SVG overlay
4. Inspect mode: `pointer-events: all` on SVG, `elementFromPoint` hit-testing
5. Component highlight on hover (stroke outline on SVG element)
6. Node metadata tooltip (component name, type, properties)
7. Annotation anchoring to specific Figma node IDs
8. Node tree fetching and caching (`/files/:key/nodes`)

### Phase E: Polish + Hardening
1. Official MCP provider adapter
2. Version-based cache invalidation
3. In-flight deduplication
4. "Clear cache" in settings
5. Auto-retry + upgrade-in-place for rate-limited items
6. "Open in Figma" link on canvas items
7. Lazy-load SVG overlay (only when near viewport)
8. Performance gating (limit SVG nodes for complex designs)

## Hybrid SVG-on-Raster Architecture

### The Insight

Figma's SVG export (`/images?format=svg`) is a **visual export**, not a semantic translation. It doesn't reliably preserve node IDs, component relationships, or hierarchy — elements get flattened, merged, and reordered. However, SVG is the right **interaction layer** when overlaid on top of a raster image.

### What Figma SVG Export Loses

| Feature | What happens in SVG export |
|---------|---------------------------|
| Background blur | No SVG equivalent — rasterized as embedded `<image>` |
| Text with mixed styles | Becomes outlined paths — not selectable as text |
| Stroke alignment (inside/outside) | Not SVG-native — geometry gets expanded |
| Nested masks + boolean ops | Flattened into single paths, sub-shapes lost |
| Auto-layout | Computed and flattened — no reflow semantics |
| Image fills | Embedded as data URIs (huge file size) |
| Drop shadows / inner shadows | SVG filters — expensive, render differently across browsers |

### The Hybrid Model

Don't replace raster with SVG. **Layer SVG on top of raster:**

```
┌──────────────────────────────────────────────────┐
│  Canvas Item (per imported Figma frame)           │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │  Layer 1: Raster PNG                        │  │
│  │  (what the user sees)                       │  │
│  │  Visual truth — blurs, shadows, fonts all   │  │
│  │  render perfectly                           │  │
│  ├────────────────────────────────────────────┤  │
│  │  Layer 2: SVG overlay                       │  │
│  │  (interaction layer — transparent)          │  │
│  │  pointer-events: none (until inspect mode)  │  │
│  │  each element carries data-figma-node-id    │  │
│  │  pixel-perfect hit testing via DOM          │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Why this is superior to each alternative:**

| Approach | Visual fidelity | Selectability | Component tracking | Performance |
|----------|----------------|---------------|-------------------|-------------|
| Raster only + hit-map | Perfect | Bounding boxes only | Brittle | Fast |
| Pure SVG | Lossy | Element-level | Unreliable (flattened) | Degrades with complexity |
| **Hybrid (raster + SVG overlay)** | **Perfect** | **Element-level** | **data-node-id mapping** | **Fast (PNG texture + lightweight SVG)** |
| HTML/CSS reconstruction | Varies | Element-level | Possible | Complex to build |

### SVG Overlay Generation

Two approaches, tried in order:

**Approach A: Use exported SVG with node IDs (if available)**
- Request SVG from Figma API/MCP: `/images/:key?format=svg&ids=:nodeId`
- Check if exported SVG contains `data-node-id` attributes
- If yes: overlay directly with `pointer-events: none; opacity: 0;`
- Raster PNG provides visual truth underneath

**Approach B: Generate SVG from node tree JSON (fallback)**
- Fetch node tree: `/files/:key/nodes?ids=:nodeId`
- Generate SVG with `<rect>` / `<path>` elements from `absoluteBoundingBox` data
- Each element carries `data-figma-node-id`, `data-component-key`
- Focus on INSTANCE/COMPONENT nodes, not every leaf path
- Simpler but gives precise component-level selection

### Progressive Rendering Pipeline (updated)

```
t = 0ms      Skeleton card (file name, frame name, shimmer)
t = 0-1s     Low-res thumbnail (from /files endpoint)
t = 1-5s     High-res raster PNG (from best available provider)
t = 5-15s    SVG overlay loads (async, transparent interaction layer)
             → components become selectable
             → hover highlights activate
             → annotation anchors appear
```

This replaces the previous "structured layers (hit-map)" concept with a DOM-native SVG interaction layer.

### Interaction Model (inspect mode)

When inspect mode is active (or by default when hovering a canvas item):

1. SVG overlay gets `pointer-events: all`
2. `document.elementFromPoint(x, y)` identifies the SVG element under cursor
3. Element's `data-figma-node-id` maps to the Figma node tree
4. Highlight the element's bounds (stroke outline on the SVG element)
5. Show component name / metadata in a tooltip
6. Click to select → show annotation popover → spawn agent

**This is vastly superior to bounding-box hit-maps** because:
- Hit testing follows actual element shapes (not just rectangles)
- No custom hit-testing code needed — the browser does it natively
- Rotated, transformed, and non-rectangular elements work correctly
- Component hierarchy is navigable via SVG group structure

### The Golden Thread (component tracking)

The SVG overlay enables a persistent mapping chain:

```
Figma Component (node ID: "123:456")
    ↓
SVG Element (data-figma-node-id="123:456")
    ↓
Annotation (anchored to node "123:456")
    ↓
Agent Task (working on component "123:456")
    ↓
Code Component (Sandpack prototype, references "123:456")
    ↓
Decision Record (artifact graph, linked to component "123:456")
    ↓
Push back to Figma (future — update node "123:456")
```

Every entity in the system references the same Figma node ID. This is the foundation for:
- **Explainability:** "This button changed because Agent 2 approved variation B"
- **Conflict detection:** Two agents modifying the same component
- **Design system governance:** Token change → find all affected components
- **Round-trip updates:** Agent changes → visual diff → push back to Figma

### Canvas Item Type (updated)

```typescript
type CanvasItem = {
  id: string
  type: "figma_raster"
  fileKey: string
  nodeId: string
  x: number
  y: number
  width: number
  height: number
  src: string              // raster PNG URL
  svgSrc?: string          // SVG overlay URL (loaded async)
  nodeTree?: FigmaNode     // node tree JSON (for metadata)
  createdAt: number
}
```

### Performance Budget

Hard limits to prevent the "5000-node design freezes the browser" cliff:

```
SVG overlay element cap:    2000 nodes max (reject + fall back to node-tree approach)
Node-tree overlay cap:       200 top-level components (deeper inspection on-demand)
Concurrent Figma fetches:      3 max (queue the rest)
SVG file size cap:           5 MB max (reject + fall back)
Node tree JSON cap:         10 MB max
```

**Progressive depth inspection:**
- Initial SVG overlay contains only top-level FRAME, COMPONENT, and INSTANCE nodes
- When user clicks a component → generate sub-overlay for its children on demand
- Like Figma's "double-click to enter group" — inspect gets deeper as you drill in

**Pan/zoom performance:**
- **Disable SVG pointer events during pan/zoom** (`pointer-events: none`) to prevent SVG from capturing gestures and causing layout recalc
- Re-enable after gesture ends (debounced, 100ms after last pointer/wheel event)
- During zoom animation, SVG overlay is hidden entirely (CSS `visibility: hidden` — skips layout)

**Viewport prioritization:**
- Only fetch SVG overlays for items currently visible in the viewport
- Off-screen items keep raster only until scrolled into view
- On viewport change (pan/zoom), queue SVG fetches for newly visible items

**Cache SVG** alongside raster in the Asset Bundle

## What This Does NOT Cover

- Custom Figma plugin development — future enhancement
- Design system sync (components, variables, tokens) — separate spec
- Live selection tracking — requires active MCP connection, future
- Write-back to Figma — post-MVP
- Editable SVG (vector editing on canvas) — out of scope, we are "selectable but not editable"

## References

- [Agentic Prototyping Studio Design Spec](./2026-03-26-agentic-prototyping-studio-design.md)
- [Phase 2 Canvas Spec](./2026-03-29-phase2-html-infinite-canvas.md)
- [Agent Infrastructure Spec](./2026-03-29-agent-infrastructure-spec.md)
- Consensus: GPT-5.2 (8/10) + Gemini 2.5 Pro (9/10) — ideal UX design
- Security review: GPT-5.2 (8/10) — supply chain, PAT storage, cache privacy
- SVG analysis: GPT-5.2 (8/10) + Gemini 2.5 Pro (8/10) — hybrid SVG-on-raster architecture, component tracking via data-node-id
