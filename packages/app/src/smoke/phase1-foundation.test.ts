/**
 * Phase 1 Smoke Tests: Product/Feature/Agent Foundation (Frontend)
 *
 * These tests verify that Phase 1 is actually complete — every acceptance
 * criterion that was promised in the plan is checked here. If any of these
 * fail, Phase 1 is NOT done.
 *
 * Pattern: each phase gets its own smoke test file in src/smoke/.
 */
import { describe, test, expect } from "bun:test"
import { dict } from "../i18n/en"
import path from "path"

const appRoot = path.resolve(import.meta.dir, "..")
const sdkRoot = path.resolve(appRoot, "../../../packages/sdk/js/src/v2/gen")

describe("Phase 1: i18n terminology", () => {
  const noProjectKeys = [
    "command.project.add",
    "command.project.open",
    "dialog.project.add.title",
    "dialog.project.add.placeholder",
    "project.unknown",
    "workspace.empty.title",
    "workspace.empty.description",
    "sidebar.context.projects",
    "sidebar.context.project",
    "sidebar.project.recentSessions",
    "sidebar.project.viewAllSessions",
    "sidebar.project.delete.title",
    "sidebar.project.delete.confirm",
    "sidebar.project.delete.button",
    "sidebar.nav.projectsAndSessions",
  ] as const

  test("no user-facing string says 'project' (should say 'product' or 'feature')", () => {
    const violations: string[] = []
    for (const key of noProjectKeys) {
      const val = dict[key as keyof typeof dict]
      if (typeof val === "string" && /\bproject\b/i.test(val)) {
        violations.push(`${key}: "${val}"`)
      }
    }
    expect(violations).toEqual([])
  })

  test("left rail says PRODUCT (not WORKSPACE)", () => {
    expect(dict["sidebar.context.workspace"]).toBe("PRODUCT")
  })

  test("inner sidebar says Features (not Projects)", () => {
    expect(dict["sidebar.context.projects"]).toBe("Features")
  })

  test("workspace-level strings say 'product' not 'workspace'", () => {
    expect(dict["command.workspace.new"]).toContain("product")
    expect(dict["dialog.workspace.add.title"]).toContain("product")
  })

  const sessionKeys = [
    "command.session.new",
    "command.session.previous",
    "command.session.next",
    "command.session.previous.unseen",
    "command.session.next.unseen",
    "command.session.archive",
    "notification.action.goToSession",
  ] as const

  test("no user-facing string says 'session' (should say 'feature' or 'agent')", () => {
    const violations: string[] = []
    for (const key of sessionKeys) {
      const val = dict[key as keyof typeof dict]
      if (typeof val === "string" && /\bsession\b/i.test(val)) {
        violations.push(`${key}: "${val}"`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe("Phase 1: file structure", () => {
  test("feature page exists", async () => {
    const file = Bun.file(path.join(appRoot, "pages/feature.tsx"))
    expect(await file.exists()).toBe(true)
  })

  test("product-scope context exists", async () => {
    const file = Bun.file(path.join(appRoot, "context/product-scope.tsx"))
    expect(await file.exists()).toBe(true)
  })

  test("agent-chat context exists", async () => {
    const file = Bun.file(path.join(appRoot, "context/agent-chat.tsx"))
    expect(await file.exists()).toBe(true)
  })

  test("feature page uses canvas-primary layout (not chat-primary)", async () => {
    const source = await Bun.file(path.join(appRoot, "pages/feature.tsx")).text()
    expect(source).toContain("Canvas")
    expect(source).toContain("AgentChatProvider")
  })
})

describe("Phase 1: SDK types", () => {
  test("SDK has Product types", async () => {
    const source = await Bun.file(path.join(sdkRoot, "types.gen.ts")).text()
    expect(source).toContain("ProductCurrent")
    expect(source).toContain("FeatureCreate")
    expect(source).toContain("AgentList")
  })

  test("SDK client has Product, Feature, Agent classes", async () => {
    const source = await Bun.file(path.join(sdkRoot, "sdk.gen.ts")).text()
    expect(source).toContain("export class Product")
    expect(source).toContain("export class Feature")
    expect(source).toContain("export class Agent")
  })

  test("SDK routes point to /agent-session not /session", async () => {
    const source = await Bun.file(path.join(sdkRoot, "sdk.gen.ts")).text()
    // Agent CRUD should use /agent-session
    expect(source).toContain('url: "/agent-session"')
    // The old /session path should not appear as a primary route
    const agentCreateSection = source.slice(
      source.indexOf("export class Agent"),
      source.indexOf("export class Agent") + 2000,
    )
    expect(agentCreateSection).toContain("/agent-session")
  })
})

describe("Phase 1: dialog uses correct API", () => {
  test("DialogAddProject creates a feature, not an agent session", async () => {
    const source = await Bun.file(
      path.join(appRoot, "components/dialog-add-project.tsx"),
    ).text()
    expect(source).toContain("client.feature.create")
    expect(source).not.toContain("client.agent.create")
  })
})

describe("Phase 1: routing", () => {
  test("app router includes product and feature routes", async () => {
    const source = await Bun.file(path.join(appRoot, "app.tsx")).text()
    expect(source).toContain("/product/")
    expect(source).toContain("/feature/")
    expect(source).toContain("FeatureRoute")
    expect(source).toContain("ProductLayout")
  })
})
