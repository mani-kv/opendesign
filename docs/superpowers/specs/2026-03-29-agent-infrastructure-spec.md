# Agent Infrastructure Spec — OpenDesign

## Status

**Approved** — 2026-03-29

Consensus reached via multi-model architectural review (GPT-5.2, Gemini 2.5 Pro, Claude Opus 4.6). All models unanimously recommended Option A (Vercel AI SDK + custom purpose-built modules). No external frameworks, no hosted services, no vector databases for MVP.

## Overview

This spec defines the agent infrastructure architecture for OpenDesign — the layers between "user annotates a component" and "agent generates a useful prototype variation." It covers memory, context management, retrieval, orchestration, and the artifact graph.

**What this spec is NOT:** It does not cover the canvas, Figma import pipeline, Sandpack rendering, or UI components. Those are defined in the [Agentic Prototyping Studio Design Spec](./2026-03-26-agentic-prototyping-studio-design.md).

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────┐
│                    OpenDesign Agents                      │
│  prototype │ design │ specs │ scenario │ research │ audit │
├──────────────────────────────────────────────────────────┤
│                  Context Injection                        │
│  system[0]: stable rules (cacheable)                     │
│  system[1]: dynamic context (per-turn)                   │
├──────────────────────────────────────────────────────────┤
│            Vercel AI SDK (transport layer)                │
│         streamText + tools + 24+ providers               │
├────────────┬─────────────┬───────────────────────────────┤
│   New      │   New       │   New                         │
│   Tools    │   Ingest    │   Memory                      │
│            │   Pipeline  │   System                      │
│ search_ctx │ upload→     │ 3-tier:                       │
│ memory_qry │ extract→    │  product (rules)              │
│ spatial_qry│ chunk→      │  feature (decisions)          │
│            │ FTS5 index  │  agent (conversation)         │
├────────────┴─────────────┴───────────────────────────────┤
│              SQLite (Drizzle ORM)                         │
│  Existing: Product, Feature, Agent, Checkpoint, Message  │
│  New: Decision, Patch, Document, Chunk, Excerpt          │
│  Indexes: FTS5 (text search), R-Tree (spatial, Phase 2)  │
└──────────────────────────────────────────────────────────┘
```

## Decision: Why Option A

### Options Evaluated

| Option | Description | Verdict |
|--------|-------------|---------|
| **A: Vercel AI SDK + Custom** | Keep existing transport, build domain-specific modules | **Selected** |
| B: LangChain/LangGraph | Replace with LangChain for memory/RAG, LangGraph for orchestration | Rejected — heavy abstractions, Python-first, fights namespace architecture |
| C: Mastra | TypeScript-native agent framework | Rejected — framework bet, would lose mature multi-provider handling |
| D: Hybrid (Mem0 + vector DB) | Keep Vercel AI SDK, add Mem0 + Turbopuffer/Qdrant | Rejected — external service dependencies violate self-contained constraint |

### Why Option A Wins

1. **Existing hooks are ideal.** `llm.ts` has a natural injection point via `system.push()` for context packs. The tool registry can expose memory/retrieval as tools without changing transport.
2. **24+ provider support is hard to replicate.** Replacing Vercel AI SDK risks losing mature edge-case handling (LiteLLM proxy quirks, provider-specific tool calling differences).
3. **Domain-specific needs don't fit generic frameworks.** Design decisions tied to components/checkpoints are fundamentally different from generic chat memory. Mem0 stores flat facts; we need structured design provenance.
4. **"User is the orchestrator"** (design spec line 33) eliminates the need for complex state machines like LangGraph. We need concurrent independent agent jobs, not graph-based orchestration.
5. **Self-contained.** SQLite handles everything at MVP scale — no external vector DBs, no hosted memory services.

---

## 1. Artifact Graph

### Concept

Every entity stores explicit references to related entities via foreign keys. This is not a graph database — it is graph-shaped data in SQLite. The graph enables:

- **Explainability** — "Why did this layout change?" → Decision with rationale, linked to component and checkpoint
- **Conflict detection** — Two agents modifying the same component → detected via `patch.component_id` overlap
- **Design system governance** — Token change → find all components using that token → find all features affected
- **Reusable design intelligence** — Past decisions about similar components retrieved for new explorations

### New Tables

```sql
-- Design decisions made by agents
CREATE TABLE decision (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL REFERENCES feature(id),
  component_id TEXT REFERENCES component(id),
  checkpoint_id TEXT REFERENCES checkpoint(id),
  agent_id TEXT NOT NULL REFERENCES agent(id),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  impact TEXT,
  confidence REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Code changes produced by decisions
CREATE TABLE patch (
  id TEXT PRIMARY KEY,
  component_id TEXT REFERENCES component(id),
  decision_id TEXT NOT NULL REFERENCES decision(id),
  checkpoint_id TEXT REFERENCES checkpoint(id),
  operation TEXT NOT NULL, -- 'create' | 'update' | 'delete'
  changes TEXT NOT NULL,   -- JSON diff or file content
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Component lock for multi-agent conflict prevention
CREATE TABLE component_lock (
  component_id TEXT PRIMARY KEY REFERENCES component(id),
  agent_id TEXT NOT NULL REFERENCES agent(id),
  acquired_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);
```

### Relationship Map

```
Product
  └── Feature
        ├── Agent
        │     ├── Decision
        │     │     ├── Patch → Component
        │     │     └── Checkpoint
        │     └── Messages (existing)
        ├── Document
        │     ├── Chunk (FTS5 indexed)
        │     └── Excerpt (user-pinned)
        └── Checkpoint
              └── Patches (approved)
```

### Rule

Every time a new entity is added, it must connect to at least one existing entity. If it connects to nothing, it breaks the graph.

---

## 2. Memory System

### Three Tiers

| Tier | Scope | Storage | Injection Method |
|------|-------|---------|-----------------|
| **Product memory** | Cross-feature, persistent | `document` + `excerpt` tables scoped to product | Stable rules in `system[0]` (cacheable) |
| **Feature memory** | Per-feature | `decision` table + feature-scoped documents | Dynamic context in `system[1]` + `memory_query` tool |
| **Agent memory** | Per-conversation | `message` table (existing) | Conversation history (existing) |

### What Gets Remembered

| Category | Example | Tier | How Stored |
|----------|---------|------|-----------|
| Brand guidelines | "Use 8px spacing grid" | Product | Document (pinned excerpt) |
| Design system tokens | Colors, typography, radii | Product | `design-system.json` on main branch |
| User preferences | "Prefer dark mode examples" | Product | Decision with `type: 'preference'` |
| Feature decisions | "Chose carousel over grid for hero" | Feature | Decision with rationale |
| Component states | "Button has 4 variants" | Feature | Component table (existing) |
| Conversation context | Messages, tool calls | Agent | Message table (existing) |

### What Does NOT Get Remembered

- Ephemeral task state (current tool execution, in-progress generation)
- Raw Figma API responses (re-fetchable via MCP)
- Intermediate agent reasoning (compacted away)

### No Mem0

Mem0 stores generic flat facts ("user likes dark mode"). We need structured design provenance — decisions tied to components, patches tied to checkpoints, rationale tied to impact. A `decision` table in Drizzle is more tailored, more queryable, and has zero external dependencies.

---

## 3. Context Management

### System Prompt Structure

Leverages the existing 2-part system structure in `llm.ts` (lines 88-93) for provider cache efficiency:

```
system[0] — STABLE (cacheable across turns)
├── Agent system prompt (from agent-def.ts)
├── Product-level rules & guidelines (pinned excerpts)
├── Design system summary (tokens, component catalog)
└── Provider-specific instructions

system[1] — DYNAMIC (changes per turn)
├── Annotation context (prompt, component metadata, spatial)
├── Pinned excerpts relevant to current annotation
├── Retrieved chunks from search_context tool
├── Recent feature decisions (from decision table)
└── Figma node context (component tree subset)
```

### Token Budgets

| Category | Budget | Notes |
|----------|--------|-------|
| Rules & guidelines (system[0]) | 2-8K tokens | Stable, benefits from provider caching |
| Dynamic context (system[1]) | 2-12K tokens | Annotation + retrieved chunks + decisions |
| Conversation history | 4-10K tokens | Compacted when exceeding budget |
| **Total target** | **< 20-30K tokens** | For sub-5-8s interactive responses |

### Compaction Rules

1. **NEVER** summarize source documents, pinned excerpts, or design system data
2. **ONLY** compact conversation history (messages between user and agent)
3. Source chunks stay immutable in SQLite — always re-retrievable
4. Maintain a bounded "working set": pinned excerpts + last retrieved citations + running summary

### Priority-Based Context Selection

When context exceeds budget, prioritize (highest first):

1. Active annotation prompt + component metadata
2. Pinned excerpts tagged for this annotation/component
3. Design system tokens relevant to selected component
4. Recent decisions for this feature
5. Retrieved chunks from `search_context`
6. Product-level rules
7. Conversation history (compacted first)

---

## 4. Document & Retrieval System

### File Types (MVP)

| Type | Processing | Storage |
|------|-----------|---------|
| **PDF** | `pdf-parse` → text extraction with page breaks | Document + chunks |
| **TXT** | Direct text | Document + chunks (if large) |
| **MD** | Direct text, preserve headings | Document + chunks (if large) |
| **CSV** | Parse schema + sample rows + computed stats | Document (structured summary) |
| **PNG/JPG** | Caption + OCR extraction at ingest | Document (text representation) |

**Deferred:** DOCX, PPTX, Google Sheets (require conversion pipelines).

**Size limits:** PDFs max 200 pages. Images max 20MB. CSVs capped at reasonable row/column counts.

### Ingest Pipeline

```
User uploads file
  │
  ├── Extract text (pdf-parse / direct / OCR)
  │
  ├── Classify by size
  │     ├── Small (< ~4K tokens) → store as-is, inject directly when scoped
  │     └── Large (> ~4K tokens) → chunk into passages
  │
  ├── Chunk (for large files)
  │     ├── 400-800 token passages
  │     ├── 10-15% overlap between chunks
  │     └── Metadata: page number, heading, ordinal position
  │
  ├── Index in FTS5 virtual table (BM25 ranking)
  │
  └── Scope assignment: global / product / feature
```

### Storage Schema

```sql
-- Uploaded documents
CREATE TABLE document (
  id TEXT PRIMARY KEY,
  product_id TEXT REFERENCES product(id),
  feature_id TEXT REFERENCES feature(id), -- NULL = product-level
  type TEXT NOT NULL, -- 'pdf' | 'txt' | 'md' | 'csv' | 'image'
  title TEXT NOT NULL,
  synopsis TEXT, -- 5-10 bullet summary (generated on ingest)
  raw_content TEXT, -- full extracted text (for small docs)
  size_tokens INTEGER,
  scope TEXT NOT NULL DEFAULT 'feature', -- 'global' | 'product' | 'feature'
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Chunked passages for large documents
CREATE TABLE chunk (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id),
  chunk_text TEXT NOT NULL,
  page INTEGER,
  heading TEXT,
  ordinal INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE chunk_fts USING fts5(
  chunk_text,
  content='chunk',
  content_rowid='rowid'
);

-- User-curated excerpts (pinned selections)
CREATE TABLE excerpt (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id),
  feature_id TEXT REFERENCES feature(id),
  content TEXT NOT NULL,
  page INTEGER,
  heading TEXT,
  pinned INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
```

### Retrieval at Runtime

Agents retrieve context via the `search_context` tool (not passive injection):

```
Agent calls: search_context({ query: "onboarding form validation", scope: "feature", top_k: 5 })

System:
  1. Query FTS5: SELECT * FROM chunk_fts WHERE chunk_fts MATCH 'onboarding form validation' ORDER BY rank LIMIT 5
  2. Join with chunk → document for metadata
  3. Return results with citations: [{ doc: "PRD v2", page: 12, heading: "Form Validation", snippet: "..." }]
```

### No Vector DB for MVP

SQLite FTS5 with BM25 ranking handles lexical search well. It is:
- Built into SQLite (zero dependencies)
- Fast (sub-millisecond for typical corpus sizes)
- Good enough for keyword/phrase matching on design documents

**Later (post-MVP):** Add embedding column to `chunk` table. Hybrid ranking: BM25 score + cosine similarity. Still in SQLite — embeddings stored as blobs, similarity computed in application code. External vector DB only if scale demands it.

---

## 5. New Agent Tools

### search_context

```typescript
Tool.Info = {
  id: "search_context",
  init: () => ({
    description: "Search uploaded documents for relevant context. Returns chunks with citations.",
    parameters: z.object({
      query: z.string().describe("Search query"),
      scope: z.enum(["global", "product", "feature"]).optional(),
      doc_ids: z.array(z.string()).optional().describe("Limit search to specific documents"),
      top_k: z.number().optional().default(5),
    }),
    execute: async (params) => {
      // FTS5 query on chunk_fts table
      // Join with document for metadata
      // Return top_k results with citations
    }
  })
}
```

### memory_query

```typescript
Tool.Info = {
  id: "memory_query",
  init: () => ({
    description: "Query past design decisions for context. Returns decisions with rationale and impact.",
    parameters: z.object({
      query: z.string().describe("What to search for"),
      feature_id: z.string().optional(),
      component_id: z.string().optional(),
      limit: z.number().optional().default(5),
    }),
    execute: async (params) => {
      // SQL query on decision table
      // Filter by feature/component scope
      // Return decisions with rationale, impact, confidence
    }
  })
}
```

### spatial_query (Phase 2 — when canvas is built)

```typescript
Tool.Info = {
  id: "spatial_query",
  init: () => ({
    description: "Query elements near an annotation on the canvas.",
    parameters: z.object({
      annotation_id: z.string(),
      radius: z.number().optional().default(200),
    }),
    execute: async (params) => {
      // R-Tree query on element bounding boxes
      // Return nearby elements, parent containers, sibling annotations
    }
  })
}
```

---

## 6. Agent Orchestration

### MVP: Minimal Orchestration

The design spec says "the user is the orchestrator" (line 33). This is a deliberate simplification that eliminates the need for complex state machines.

**What we build:**
- Per-annotation agent runs (independent, concurrent)
- Component locking (prevent two agents editing same component)
- Handoff via shared state (one agent's decisions visible to next agent's context)

**What we do NOT build:**
- Supervisor agent or meta-orchestrator
- LangGraph-style state machines
- Complex planning/reflection loops
- Agent-to-agent direct communication channels

### Component Locking

When an agent starts working on a component:

```typescript
// Acquire lock (60-second TTL, renewable)
ComponentLock.acquire(componentId, agentId, ttl: 60000)

// Other agents checking the same component:
ComponentLock.check(componentId)
// → { locked: true, by: agentId, expires: timestamp }
// Agent waits or works on a different component

// Release on completion or timeout
ComponentLock.release(componentId, agentId)
```

### Handoff Protocol

After an agent approves a variation:

1. Decision record created in `decision` table
2. Patch record created in `patch` table with `status: 'approved'`
3. Checkpoint auto-saved
4. Bus event emitted: `decision.created`
5. Other active agents on same feature receive updated context on their next turn (via `memory_query` or context injection)

No direct agent-to-agent messaging. The artifact graph IS the communication medium.

---

## 7. Context Injection Implementation

### Changes to `llm.ts`

The existing `system.push()` pattern (lines 67-93) is the injection point. Add a `ContextPacker` module that assembles context before each `streamText` call:

```typescript
// Pseudocode for context assembly
const ContextPacker = {
  async pack(input: {
    agentId: string
    featureId: string
    productId: string
    annotationId?: string
  }): Promise<{ stable: string; dynamic: string }> {

    // STABLE (system[0]) — cacheable
    const stable = [
      agentDef.prompt,                          // agent system prompt
      await getProductRules(productId),         // pinned product-level excerpts
      await getDesignSystemSummary(productId),  // tokens + component catalog
    ].join("\n\n")

    // DYNAMIC (system[1]) — per-turn
    const dynamic = [
      await getAnnotationContext(annotationId), // prompt, component metadata, spatial
      await getPinnedExcerpts(featureId),        // user-pinned document excerpts
      await getRecentDecisions(featureId, 5),    // last 5 decisions for this feature
    ].join("\n\n")

    // Enforce token budget
    return truncateTobudget(stable, dynamic, {
      stableBudget: 8000,
      dynamicBudget: 12000,
    })
  }
}
```

### Integration Point

In `llm.ts`, before calling `streamText`:

```typescript
const context = await ContextPacker.pack({
  agentId: input.agentID,
  featureId: input.featureID,
  productId: input.productID,
  annotationId: input.annotationID,
})

// Inject into existing system prompt structure
system.unshift(context.stable)  // system[0] — stable, cacheable
system.push(context.dynamic)    // system[1] — dynamic, per-turn
```

---

## 8. Implementation Order

| Step | What | Effort | Depends On |
|------|------|--------|-----------|
| 1 | Drizzle migration: Decision, Patch, Document, Chunk, Excerpt, ComponentLock tables | Small | Nothing |
| 2 | Document ingest pipeline (upload → extract → chunk → FTS5 index) | Medium | Step 1 |
| 3 | `search_context` tool in tool registry | Small | Steps 1-2 |
| 4 | `memory_query` tool in tool registry | Small | Step 1 |
| 5 | ContextPacker module + integration in `llm.ts` | Medium | Step 1 |
| 6 | Component locking for multi-agent | Small | Step 1 |
| 7 | Document upload API routes (`/document` CRUD) | Small | Step 1 |
| 8 | Excerpt/pin API routes + frontend UI | Medium | Steps 1, 7 |
| 9 | Spatial query + R-Tree index | Small | Canvas (Phase 2) |
| 10 | Embeddings column + hybrid ranking | Medium | Post-MVP |

Steps 1-5 can be parallelized. Steps 1-8 constitute the MVP agent infrastructure.

---

## 9. What We Explicitly Do NOT Build

| Thing | Why Not |
|-------|---------|
| **LangChain / LangGraph** | Over-abstracted, Python-first, fights our architecture |
| **Mastra** | Framework bet on unproven library |
| **Mem0** | Generic flat facts, external dependency, poor JS support |
| **Vector database** (Turbopuffer, Qdrant, Pinecone) | Unnecessary at MVP scale; SQLite FTS5 is sufficient |
| **Automated doc summarization** | Lossy, unpredictable, erodes trust |
| **Supervisor/meta-orchestrator agent** | User IS the orchestrator |
| **Agent-to-agent direct messaging** | Artifact graph is the communication medium |
| **Complex planning/reflection loops** | Premature for annotation-driven workflow |

---

## 10. Future Additions (Post-MVP)

| Capability | When | How |
|-----------|------|-----|
| **Hybrid retrieval** (BM25 + vector) | When FTS5 misses semantic matches | Add embedding column to `chunk`, compute cosine similarity in app |
| **Rerankers** | When retrieval quality needs improvement | Cross-encoder scoring on top of BM25 results |
| **Multimodal embeddings** | When image context matters | CLIP-style embeddings for screenshots/mood boards |
| **Per-scope indices** | When doc corpus grows large | Partition FTS5 indexes by product/feature |
| **Observability** | When debugging agent quality | LangFuse or Braintrust for tracing/evaluation |
| **Background indexing** | When large PDFs cause upload lag | Streaming ingestion with progress indicator |
| **State machine orchestration** | When agents manipulate canvas directly | LangGraph-style workflows for complex multi-step canvas operations |

---

## References

- [Agentic Prototyping Studio Design Spec](./2026-03-26-agentic-prototyping-studio-design.md) — Product vision, canvas architecture, workflow
- [Phase 1 Foundation Spec](./2026-03-27-phase1-product-feature-agent-foundation.md) — Product/Feature/Agent data model
- Consensus: GPT-5.2 (neutral architect, 8/10 confidence) + Gemini 2.5 Pro (pragmatic skeptic, 9/10 confidence) — unanimous on Option A
