import { describe, expect, test } from "bun:test"
import type { PermissionRequest, Agent } from "@opencode-ai/sdk/v2/client"
import { trimSessions } from "./session-trim"

// Use a large epoch so SESSION_RECENT_WINDOW (4h = 14_400_000ms) is meaningful
const BASE_NOW = 100_000_000_000

const session = (input: { id: string; created: number; updated?: number }) =>
  ({
    id: input.id,
    time: {
      created: input.created,
      updated: input.updated,
    },
  }) as unknown as Agent

describe("trimSessions", () => {
  test("keeps base roots and recent roots beyond the limit", () => {
    const now = BASE_NOW
    const recent = now - 1_000 // 1 second ago — within 4h window
    const old = now - 50_000_000 // ~14h ago — outside 4h window
    const list = [
      session({ id: "a", created: old }),
      session({ id: "b", created: old }),
      session({ id: "c", created: old }),
      session({ id: "d", created: old, updated: recent }), // recently updated
      session({ id: "e", created: old }),
    ]

    const result = trimSessions(list, { limit: 2, permission: {}, now })
    // base: ["a", "b"], recent (updated within 4h): ["d"]
    expect(result.map((x) => x.id)).toEqual(["a", "b", "d"])
  })

  test("keeps only base sessions when no sessions are recent", () => {
    const now = BASE_NOW
    const old = now - 50_000_000
    const list = [
      session({ id: "a", created: old }),
      session({ id: "b", created: old }),
      session({ id: "c", created: old }),
      session({ id: "d", created: old }),
      session({ id: "e", created: old }),
    ]

    const result = trimSessions(list, { limit: 2, permission: {}, now })
    expect(result.map((x) => x.id)).toEqual(["a", "b"])
  })

  test("permission parameter is accepted (backwards compat)", () => {
    const now = BASE_NOW
    const old = now - 50_000_000
    const list = [
      session({ id: "root-1", created: now - 1_000 }),
      session({ id: "root-2", created: now - 2_000 }),
      session({ id: "old-1", created: old }),
      session({ id: "old-2", created: old }),
    ]

    const result = trimSessions(list, {
      limit: 2,
      permission: {
        "old-1": [{ id: "perm-1" } as PermissionRequest],
      },
      now,
    })

    // base: ["old-1", "old-2"], recent: ["root-1", "root-2"]
    expect(result.map((x) => x.id)).toEqual(["old-1", "old-2", "root-1", "root-2"])
  })
})
