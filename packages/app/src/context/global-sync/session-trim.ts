import type { Agent, PermissionRequest } from "@opencode-ai/sdk/v2/client"
import { cmp } from "./utils"
import { SESSION_RECENT_LIMIT, SESSION_RECENT_WINDOW } from "./types"

export function sessionUpdatedAt(session: Agent) {
  return session.time.updated ?? session.time.created
}

export function compareSessionRecent(a: Agent, b: Agent) {
  const aUpdated = sessionUpdatedAt(a)
  const bUpdated = sessionUpdatedAt(b)
  if (aUpdated !== bUpdated) return bUpdated - aUpdated
  return cmp(a.id, b.id)
}

export function takeRecentSessions(sessions: Agent[], limit: number, cutoff: number) {
  if (limit <= 0) return [] as Agent[]
  const selected: Agent[] = []
  const seen = new Set<string>()
  for (const session of sessions) {
    if (!session?.id) continue
    if (seen.has(session.id)) continue
    seen.add(session.id)
    if (sessionUpdatedAt(session) <= cutoff) continue
    const index = selected.findIndex((x) => compareSessionRecent(session, x) < 0)
    if (index === -1) selected.push(session)
    if (index !== -1) selected.splice(index, 0, session)
    if (selected.length > limit) selected.pop()
  }
  return selected
}

export function trimSessions(
  input: Agent[],
  options: { limit: number; permission: Record<string, PermissionRequest[]>; now?: number },
) {
  const limit = Math.max(0, options.limit)
  const cutoff = (options.now ?? Date.now()) - SESSION_RECENT_WINDOW
  const all = input
    .filter((s) => !!s?.id)
    .sort((a, b) => cmp(a.id, b.id))
  const base = all.slice(0, limit)
  const recent = takeRecentSessions(all.slice(limit), SESSION_RECENT_LIMIT, cutoff)
  return [...base, ...recent].sort((a, b) => cmp(a.id, b.id))
}
