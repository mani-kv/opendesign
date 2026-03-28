import type {
  Agent,
  Command,
  Config,
  FileDiff,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Path,
  PermissionRequest,
  Product,
  ProviderListResponse,
  QuestionRequest,
  SessionStatus,
  Todo,
  VcsInfo,
} from "@opencode-ai/sdk/v2/client"
import type { Accessor } from "solid-js"
import type { SetStoreFunction, Store } from "solid-js/store"

/**
 * Agent definition info — the shape returned by GET /agent-def.
 * The SDK codegen collapses this into the `Agent` type, but
 * these fields differ from agent *instance* fields.
 */
export type AgentDefInfo = {
  name: string
  label?: string
  description?: string
  mode: "subagent" | "primary" | "all"
  hidden?: boolean
  model?: {
    providerID: string
    modelID: string
  }
  variant?: string
  options?: Record<string, unknown>
}

export type ProjectMeta = {
  name?: string
  icon?: {
    override?: string
    color?: string
  }
  commands?: {
    start?: string
  }
}

export type State = {
  status: "loading" | "partial" | "complete"
  agentDef: AgentDefInfo[]
  command: Command[]
  project: string
  projectMeta: ProjectMeta | undefined
  icon: string | undefined
  provider: ProviderListResponse
  config: Config
  path: Path
  session: Agent[]
  sessionTotal: number
  session_status: {
    [agentID: string]: SessionStatus
  }
  session_diff: {
    [agentID: string]: FileDiff[]
  }
  todo: {
    [agentID: string]: Todo[]
  }
  permission: {
    [agentID: string]: PermissionRequest[]
  }
  question: {
    [agentID: string]: QuestionRequest[]
  }
  mcp: {
    [name: string]: McpStatus
  }
  lsp: LspStatus[]
  vcs: VcsInfo | undefined
  limit: number
  message: {
    [agentID: string]: Message[]
  }
  part: {
    [messageID: string]: Part[]
  }
}

export type VcsCache = {
  store: Store<{ value: VcsInfo | undefined }>
  setStore: SetStoreFunction<{ value: VcsInfo | undefined }>
  ready: Accessor<boolean>
}

export type MetaCache = {
  store: Store<{ value: ProjectMeta | undefined }>
  setStore: SetStoreFunction<{ value: ProjectMeta | undefined }>
  ready: Accessor<boolean>
}

export type IconCache = {
  store: Store<{ value: string | undefined }>
  setStore: SetStoreFunction<{ value: string | undefined }>
  ready: Accessor<boolean>
}

export type ChildOptions = {
  bootstrap?: boolean
}

export type DirState = {
  lastAccessAt: number
}

export type EvictPlan = {
  stores: string[]
  state: Map<string, DirState>
  pins: Set<string>
  max: number
  ttl: number
  now: number
}

export type DisposeCheck = {
  directory: string
  hasStore: boolean
  pinned: boolean
  booting: boolean
  loadingSessions: boolean
}

export type RootLoadArgs = {
  directory: string
  limit: number
  list: (query: { directory: string; roots: true; limit?: number }) => Promise<{ data?: Agent[] }>
}

export type RootLoadResult = {
  data?: Agent[]
  limit: number
  limited: boolean
}

export const MAX_DIR_STORES = 30
export const DIR_IDLE_TTL_MS = 20 * 60 * 1000
export const SESSION_RECENT_WINDOW = 4 * 60 * 60 * 1000
export const SESSION_RECENT_LIMIT = 50
