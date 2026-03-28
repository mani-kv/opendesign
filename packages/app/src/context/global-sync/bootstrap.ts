import type {
  Config,
  OpencodeClient,
  Path,
  PermissionRequest,
  Product,
  ProviderAuthResponse,
  ProviderListResponse,
  QuestionRequest,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import { showToast } from "@opencode-ai/ui/toast"
import { getFilename } from "@opencode-ai/util/path"
import { retry } from "@opencode-ai/util/retry"
import { batch } from "solid-js"
import { reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type { AgentDefInfo, State, VcsCache } from "./types"
import { cmp, normalizeProviderList } from "./utils"
import { formatServerError } from "@/utils/server-errors"

type GlobalStore = {
  ready: boolean
  path: Path
  project: Product[]
  session_todo: {
    [agentID: string]: Todo[]
  }
  provider: ProviderListResponse
  provider_auth: ProviderAuthResponse
  config: Config
  reload: undefined | "pending" | "complete"
}

export async function bootstrapGlobal(input: {
  globalSDK: OpencodeClient
  connectErrorTitle: string
  connectErrorDescription: string
  requestFailedTitle: string
  translate: (key: string, vars?: Record<string, string | number>) => string
  formatMoreCount: (count: number) => string
  setGlobalStore: SetStoreFunction<GlobalStore>
}) {
  const health = await input.globalSDK.global
    .health()
    .then((x) => x.data)
    .catch(() => undefined)
  if (!health?.healthy) {
    showToast({
      variant: "error",
      title: input.connectErrorTitle,
      description: input.connectErrorDescription,
    })
    input.setGlobalStore("ready", true)
    return
  }

  const tasks = [
    retry(() =>
      input.globalSDK.path.get().then((x) => {
        input.setGlobalStore("path", x.data!)
      }),
    ),
    retry(() =>
      input.globalSDK.global.config.get().then((x) => {
        input.setGlobalStore("config", x.data!)
      }),
    ),
    retry(() =>
      input.globalSDK.product.list().then((x) => {
        const projects = (x.data ?? [])
          .filter((p: Product) => !!p?.id)
          .filter((p: Product) => !!p.worktree && !p.worktree.includes("opencode-test"))
          .slice()
          .sort((a: Product, b: Product) => cmp(a.id, b.id))
        input.setGlobalStore("project", projects)
      }),
    ),
    retry(() =>
      input.globalSDK.provider.list().then((x) => {
        input.setGlobalStore("provider", normalizeProviderList(x.data!))
      }),
    ),
    retry(() =>
      input.globalSDK.provider.auth().then((x) => {
        input.setGlobalStore("provider_auth", x.data ?? {})
      }),
    ),
  ]

  const results = await Promise.allSettled(tasks)
  const errors = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => r.reason)
  if (errors.length) {
    const message = formatServerError(errors[0], input.translate)
    const more = errors.length > 1 ? input.formatMoreCount(errors.length - 1) : ""
    showToast({
      variant: "error",
      title: input.requestFailedTitle,
      description: message + more,
    })
  }
  input.setGlobalStore("ready", true)
}

function groupByAgent<T extends { id: string; agentID: string }>(input: T[]) {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    if (!item?.id || !item.agentID) return acc
    const list = acc[item.agentID]
    if (list) list.push(item)
    if (!list) acc[item.agentID] = [item]
    return acc
  }, {})
}

export async function bootstrapDirectory(input: {
  directory: string
  sdk: OpencodeClient
  store: Store<State>
  setStore: SetStoreFunction<State>
  vcsCache: VcsCache
  loadSessions: (directory: string) => Promise<void> | void
  translate: (key: string, vars?: Record<string, string | number>) => string
}) {
  if (input.store.status !== "complete") input.setStore("status", "loading")

  const blockingRequests = {
    project: () => input.sdk.product.current().then((x) => input.setStore("project", x.data!.id)),
    provider: () =>
      input.sdk.provider.list().then((x) => {
        input.setStore("provider", normalizeProviderList(x.data!))
      }),
    agentDef: () =>
      input.sdk.agentDef.list().then((x) => input.setStore("agentDef", (x.data ?? []) as unknown as AgentDefInfo[])),
    config: () => input.sdk.config.get().then((x) => input.setStore("config", x.data!)),
  }

  try {
    await Promise.all(Object.values(blockingRequests).map((p) => retry(p)))
  } catch (err) {
    console.error("Failed to bootstrap instance", err)
    const project = getFilename(input.directory)
    showToast({
      variant: "error",
      title: `Failed to reload ${project}`,
      description: formatServerError(err, input.translate),
    })
    input.setStore("status", "partial")
    return
  }

  if (input.store.status !== "complete") input.setStore("status", "partial")

  Promise.all([
    input.sdk.path.get().then((x) => input.setStore("path", x.data!)),
    input.sdk.command.list().then((x) => input.setStore("command", x.data ?? [])),
    input.sdk.agent.status().then((x) => input.setStore("session_status", x.data!)),
    input.loadSessions(input.directory),
    input.sdk.mcp.status().then((x) => input.setStore("mcp", x.data!)),
    input.sdk.lsp.status().then((x) => input.setStore("lsp", x.data!)),
    input.sdk.vcs.get().then((x) => {
      const next = x.data ?? input.store.vcs
      input.setStore("vcs", next)
      if (next?.branch) input.vcsCache.setStore("value", next)
    }),
    input.sdk.permission.list().then((x) => {
      const perms = Array.isArray(x.data) ? x.data : []
      const grouped = groupByAgent(
        perms.filter((perm): perm is PermissionRequest => !!perm?.id && !!perm.agentID),
      )
      batch(() => {
        for (const agentID of Object.keys(input.store.permission)) {
          if (grouped[agentID]) continue
          input.setStore("permission", agentID, [])
        }
        for (const [agentID, permissions] of Object.entries(grouped)) {
          input.setStore(
            "permission",
            agentID,
            reconcile(
              permissions.filter((p) => !!p?.id).sort((a, b) => cmp(a.id, b.id)),
              { key: "id" },
            ),
          )
        }
      })
    }),
    input.sdk.question.list().then((x) => {
      const questions = Array.isArray(x.data) ? x.data : []
      const grouped = groupByAgent(
        questions.filter(
          (q): q is QuestionRequest & { agentID: string } => !!q?.id && !!q.sessionID,
        ).map((q) => ({ ...q, agentID: q.sessionID })),
      )
      batch(() => {
        for (const agentID of Object.keys(input.store.question)) {
          if (grouped[agentID]) continue
          input.setStore("question", agentID, [])
        }
        for (const [agentID, questions] of Object.entries(grouped)) {
          input.setStore(
            "question",
            agentID,
            reconcile(
              questions.filter((q) => !!q?.id).sort((a, b) => cmp(a.id, b.id)),
              { key: "id" },
            ),
          )
        }
      })
    }),
  ]).then(() => {
    input.setStore("status", "complete")
  })
}
