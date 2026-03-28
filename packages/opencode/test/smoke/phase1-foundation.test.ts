/**
 * Phase 1 Smoke Tests: Product/Feature/Agent Foundation (Backend)
 *
 * Verifies that the backend data model, namespaces, routes, and FK chain
 * are correct. If any of these fail, Phase 1 is NOT done.
 */
import { describe, test, expect, afterEach } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Product } from "../../src/product"
import { Feature } from "../../src/feature"
import { Agent } from "../../src/agent"
import { AgentDef } from "../../src/agent/agent-def"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util/log"
import { resetDatabase } from "../fixture/db"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterEach(async () => {
  await resetDatabase()
})

describe("Phase 1: namespace consolidation", () => {
  test("Product namespace exists and has core methods", () => {
    expect(Product.fromDirectory).toBeDefined()
    expect(Product.update).toBeDefined()
    expect(Product.initGit).toBeDefined()
  })

  test("Feature namespace exists and has CRUD", () => {
    expect(Feature.create).toBeDefined()
    expect(Feature.get).toBeDefined()
    expect(Feature.list).toBeDefined()
    expect(Feature.remove).toBeDefined()
    expect(Feature.listByProduct).toBeDefined()
  })

  test("Agent namespace is the instance CRUD (not AgentDef)", () => {
    expect(Agent.create).toBeDefined()
    expect(Agent.get).toBeDefined()
    expect(Agent.list).toBeDefined()
    expect(Agent.remove).toBeDefined()
    expect(Agent.messages).toBeDefined()
  })

  test("AgentDef namespace is the type definitions", () => {
    expect(AgentDef.list).toBeDefined()
    expect(AgentDef.get).toBeDefined()
    expect(AgentDef.defaultAgent).toBeDefined()
  })
})

describe("Phase 1: FK chain Product → Feature → Agent", () => {
  test(
    "can create Product → Feature → Agent without FK errors",
    async () => {
      const tmp = await tmpdir({ git: true })
      try {
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const product = Instance.project
            expect(product.id).toBeDefined()

            const feature = await Feature.create({
              productID: product.id,
              name: "test-feature",
              branch: "main",
            })
            expect(feature.id).toBeDefined()
            expect(feature.productID).toBe(product.id)

            const agent = await Agent.create({
              featureID: feature.id,
            })
            expect(agent.id).toBeDefined()
            expect(agent.featureID).toBe(feature.id)
          },
        })
      } finally {
        await Instance.disposeAll()
        await tmp[Symbol.asyncDispose]()
      }
    },
    15000,
  )

  test(
    "Agent.create auto-resolves featureID when not provided",
    async () => {
      const tmp = await tmpdir({ git: true })
      try {
        await Instance.provide({
          directory: tmp.path,
          fn: async () => {
            const agent = await Agent.create({})
            expect(agent.id).toBeDefined()
            expect(agent.featureID).toBeDefined()
          },
        })
      } finally {
        await Instance.disposeAll()
        await tmp[Symbol.asyncDispose]()
      }
    },
    15000,
  )
})

describe("Phase 1: API routes", () => {
  test(
    "all routes exist: /product/current, /feature, /agent-session",
    async () => {
      const tmp = await tmpdir({ git: true })
      const app = Server.Default()
      try {
        const product = await app.request("/product/current", {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(product.status).toBe(200)
        const body = await product.json()
        expect(body.id).toBeDefined()
        expect(body.worktree).toBe(tmp.path)

        const feature = await app.request("/feature", {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(feature.status).toBe(200)

        const agent = await app.request("/agent-session", {
          headers: { "x-opencode-directory": tmp.path },
        })
        expect(agent.status).toBe(200)
      } finally {
        await Instance.disposeAll()
        await tmp[Symbol.asyncDispose]()
      }
    },
    15000,
  )
})
