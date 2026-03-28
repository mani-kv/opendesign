import { Binary } from "@opencode-ai/util/binary"
import { produce, reconcile, type SetStoreFunction, type Store } from "solid-js/store"
import type {
  Agent,
  FileDiff,
  Message,
  Part,
  PermissionRequest,
  Product,
  QuestionRequest,
  SessionStatus,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import type { State, VcsCache } from "./types"
import { trimSessions } from "./session-trim"
import { dropSessionCaches } from "./session-cache"

export function applyGlobalEvent(input: {
  event: { type: string; properties?: unknown }
  project: Product[]
  setGlobalProject: (next: Product[] | ((draft: Product[]) => void)) => void
  refresh: () => void
}) {
  if (input.event.type === "global.disposed" || input.event.type === "server.connected") {
    input.refresh()
    return
  }

  if (input.event.type !== "product.updated") return
  const properties = input.event.properties as Product
  const result = Binary.search(input.project, properties.id, (s) => s.id)
  if (result.found) {
    input.setGlobalProject((draft) => {
      draft[result.index] = { ...draft[result.index], ...properties }
    })
    return
  }
  input.setGlobalProject((draft) => {
    draft.splice(result.index, 0, properties)
  })
}

function cleanupSessionCaches(
  setStore: SetStoreFunction<State>,
  agentID: string,
  setSessionTodo?: (agentID: string, todos: Todo[] | undefined) => void,
) {
  if (!agentID) return
  setSessionTodo?.(agentID, undefined)
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, [agentID])
    }),
  )
}

export function cleanupDroppedSessionCaches(
  store: Store<State>,
  setStore: SetStoreFunction<State>,
  next: Agent[],
  setSessionTodo?: (agentID: string, todos: Todo[] | undefined) => void,
) {
  const keep = new Set(next.map((item) => item.id))
  const stale = [
    ...Object.keys(store.message),
    ...Object.keys(store.session_diff),
    ...Object.keys(store.todo),
    ...Object.keys(store.permission),
    ...Object.keys(store.question),
    ...Object.keys(store.session_status),
    ...Object.values(store.part)
      .map((parts) => parts?.find((part) => !!part?.agentID)?.agentID)
      .filter((agentID): agentID is string => !!agentID),
  ].filter((agentID, index, list) => !keep.has(agentID) && list.indexOf(agentID) === index)
  if (stale.length === 0) return
  for (const agentID of stale) {
    setSessionTodo?.(agentID, undefined)
  }
  setStore(
    produce((draft) => {
      dropSessionCaches(draft, stale)
    }),
  )
}

export function applyDirectoryEvent(input: {
  event: { type: string; properties?: unknown }
  store: Store<State>
  setStore: SetStoreFunction<State>
  push: (directory: string) => void
  directory: string
  loadLsp: () => void
  vcsCache?: VcsCache
  setSessionTodo?: (agentID: string, todos: Todo[] | undefined) => void
}) {
  const event = input.event
  switch (event.type) {
    case "server.instance.disposed": {
      input.push(input.directory)
      return
    }
    case "agent.created": {
      const info = (event.properties as { info: Agent }).info
      const result = Binary.search(input.store.session, info.id, (s) => s.id)
      if (result.found) {
        input.setStore("session", result.index, reconcile(info))
        break
      }
      const next = input.store.session.slice()
      next.splice(result.index, 0, info)
      const trimmed = trimSessions(next, { limit: input.store.limit, permission: input.store.permission })
      input.setStore("session", reconcile(trimmed, { key: "id" }))
      cleanupDroppedSessionCaches(input.store, input.setStore, trimmed, input.setSessionTodo)
      input.setStore("sessionTotal", (value) => value + 1)
      break
    }
    case "agent.updated": {
      const info = (event.properties as { info: Agent }).info
      const result = Binary.search(input.store.session, info.id, (s) => s.id)
      if (result.found) {
        input.setStore("session", result.index, reconcile(info))
        break
      }
      const next = input.store.session.slice()
      next.splice(result.index, 0, info)
      const trimmed = trimSessions(next, { limit: input.store.limit, permission: input.store.permission })
      input.setStore("session", reconcile(trimmed, { key: "id" }))
      cleanupDroppedSessionCaches(input.store, input.setStore, trimmed, input.setSessionTodo)
      break
    }
    case "agent.deleted": {
      const info = (event.properties as { info: Agent }).info
      const result = Binary.search(input.store.session, info.id, (s) => s.id)
      if (result.found) {
        const nextSessions = input.store.session.slice()
        nextSessions.splice(result.index, 1)
        input.setStore("session", nextSessions)
      }
      cleanupSessionCaches(input.setStore, info.id, input.setSessionTodo)
      input.setStore("sessionTotal", (value) => Math.max(0, value - 1))
      break
    }
    case "agent.diff": {
      const props = event.properties as { agentID: string; diff: FileDiff[] }
      input.setStore("session_diff", props.agentID, reconcile(props.diff, { key: "file" }))
      break
    }
    case "todo.updated": {
      const props = event.properties as { agentID: string; todos: Todo[] }
      input.setStore("todo", props.agentID, reconcile(props.todos, { key: "id" }))
      input.setSessionTodo?.(props.agentID, props.todos)
      break
    }
    case "session.status": {
      const props = event.properties as { sessionID: string; status: SessionStatus }
      input.setStore("session_status", props.sessionID, reconcile(props.status))
      break
    }
    case "message.updated": {
      const info = (event.properties as { info: Message }).info
      const messages = input.store.message[info.agentID]
      if (!messages) {
        input.setStore("message", info.agentID, [info])
        break
      }
      const result = Binary.search(messages, info.id, (m) => m.id)
      if (result.found) {
        input.setStore("message", info.agentID, result.index, reconcile(info))
        break
      }
      const next = messages.slice()
      next.splice(result.index, 0, info)
      input.setStore("message", info.agentID, next)
      break
    }
    case "message.removed": {
      const props = event.properties as { agentID: string; messageID: string }
      const msgs = input.store.message[props.agentID]
      if (msgs) {
        const result = Binary.search(msgs, props.messageID, (m) => m.id)
        if (result.found) {
          const nextMsgs = msgs.slice()
          nextMsgs.splice(result.index, 1)
          input.setStore("message", props.agentID, nextMsgs)
        }
      }
      input.setStore(
        produce((draft) => {
          delete draft.part[props.messageID]
        }),
      )
      break
    }
    case "message.part.updated": {
      const part = (event.properties as { part: Part }).part
      const parts = input.store.part[part.messageID]
      if (!parts) {
        input.setStore("part", part.messageID, [part])
        break
      }
      const result = Binary.search(parts, part.id, (p) => p.id)
      if (result.found) {
        input.setStore("part", part.messageID, result.index, reconcile(part))
        break
      }
      const nextParts = parts.slice()
      nextParts.splice(result.index, 0, part)
      input.setStore("part", part.messageID, nextParts)
      break
    }
    case "message.part.removed": {
      const props = event.properties as { messageID: string; partID: string }
      const parts = input.store.part[props.messageID]
      if (!parts) break
      const result = Binary.search(parts, props.partID, (p) => p.id)
      if (result.found) {
        const nextList = parts.slice()
        nextList.splice(result.index, 1)
        if (nextList.length === 0) {
          input.setStore(
            produce((draft) => {
              delete draft.part[props.messageID]
            }),
          )
        } else {
          input.setStore("part", props.messageID, nextList)
        }
      }
      break
    }
    case "message.part.delta": {
      const props = event.properties as { messageID: string; partID: string; field: string; delta: string }
      const parts = input.store.part[props.messageID]
      if (!parts) break
      const result = Binary.search(parts, props.partID, (p) => p.id)
      if (!result.found) break
      input.setStore(
        "part",
        props.messageID,
        produce((draft) => {
          const part = draft[result.index]
          const field = props.field as keyof typeof part
          const existing = part[field] as string | undefined
          ;(part[field] as string) = (existing ?? "") + props.delta
        }),
      )
      break
    }
    case "vcs.branch.updated": {
      const props = event.properties as { branch: string }
      if (input.store.vcs?.branch === props.branch) break
      const next = { branch: props.branch }
      input.setStore("vcs", next)
      if (input.vcsCache) input.vcsCache.setStore("value", next)
      break
    }
    case "permission.asked": {
      const permission = event.properties as PermissionRequest
      const permissions = input.store.permission[permission.agentID]
      if (!permissions) {
        input.setStore("permission", permission.agentID, [permission])
        break
      }
      const result = Binary.search(permissions, permission.id, (p) => p.id)
      if (result.found) {
        input.setStore("permission", permission.agentID, result.index, reconcile(permission))
        break
      }
      const nextPerms = permissions.slice()
      nextPerms.splice(result.index, 0, permission)
      input.setStore("permission", permission.agentID, nextPerms)
      break
    }
    case "permission.replied": {
      const props = event.properties as { agentID: string; requestID: string }
      const permissions = input.store.permission[props.agentID]
      if (!permissions) break
      const result = Binary.search(permissions, props.requestID, (p) => p.id)
      if (!result.found) break
      const nextPerms = permissions.slice()
      nextPerms.splice(result.index, 1)
      input.setStore("permission", props.agentID, nextPerms)
      break
    }
    case "question.asked": {
      const question = event.properties as QuestionRequest
      const questions = input.store.question[question.sessionID]
      if (!questions) {
        input.setStore("question", question.sessionID, [question])
        break
      }
      const result = Binary.search(questions, question.id, (q) => q.id)
      if (result.found) {
        input.setStore("question", question.sessionID, result.index, reconcile(question))
        break
      }
      const nextQuestions = questions.slice()
      nextQuestions.splice(result.index, 0, question)
      input.setStore("question", question.sessionID, nextQuestions)
      break
    }
    case "question.replied":
    case "question.rejected": {
      const props = event.properties as { sessionID: string; requestID: string }
      const questions = input.store.question[props.sessionID]
      if (!questions) break
      const result = Binary.search(questions, props.requestID, (q) => q.id)
      if (!result.found) break
      const nextQuestions = questions.slice()
      nextQuestions.splice(result.index, 1)
      input.setStore("question", props.sessionID, nextQuestions)
      break
    }
    case "lsp.updated": {
      input.loadLsp()
      break
    }
  }
}
