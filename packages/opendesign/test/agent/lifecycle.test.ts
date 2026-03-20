import { test, expect } from "bun:test"
import { canTransition, transition, isTerminal } from "../../src/agent/lifecycle"

test("created can transition to working", () => {
  expect(canTransition("created", "working")).toBe(true)
})

test("created cannot transition to ready", () => {
  expect(canTransition("created", "ready")).toBe(false)
})

test("working can transition to waiting or ready", () => {
  expect(canTransition("working", "waiting")).toBe(true)
  expect(canTransition("working", "ready")).toBe(true)
})

test("waiting can only go back to working", () => {
  expect(canTransition("waiting", "working")).toBe(true)
  expect(canTransition("waiting", "ready")).toBe(false)
})

test("ready can be approved or go back to working", () => {
  expect(canTransition("ready", "approved")).toBe(true)
  expect(canTransition("ready", "working")).toBe(true)
})

test("approved can only be archived", () => {
  expect(canTransition("approved", "archived")).toBe(true)
  expect(canTransition("approved", "working")).toBe(false)
})

test("archived is terminal", () => {
  expect(isTerminal("archived")).toBe(true)
  expect(canTransition("archived", "created")).toBe(false)
})

test("transition returns new state on valid transition", () => {
  expect(transition("created", "working")).toBe("working")
  expect(transition("working", "ready")).toBe("ready")
})

test("transition throws on invalid transition", () => {
  expect(() => transition("created", "approved")).toThrow("invalid agent state transition")
})

test("isTerminal returns false for non-terminal states", () => {
  expect(isTerminal("created")).toBe(false)
  expect(isTerminal("working")).toBe(false)
  expect(isTerminal("ready")).toBe(false)
})
