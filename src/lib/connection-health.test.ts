import test from "node:test"
import assert from "node:assert/strict"
import { chainLinks, combineProbes, deriveStatus, describeStatus, type HealthInputs } from "./connection-health.ts"

const base: HealthInputs = {
  hasConnection: true,
  sseConnected: false,
  authError: false,
  lastHealth: null,
  reconnectAttempts: 0,
  sessionBusy: false,
  launcherAvailable: false,
}
const make = (over: Partial<HealthInputs>): HealthInputs => ({ ...base, ...over })

test("no connection", () => {
  const info = describeStatus(make({ hasConnection: false, sseConnected: true }))
  assert.equal(info.status, "no-connection")
  assert.equal(info.action, "open-connections")
  assert.equal(info.titleKey, "status.no-connection.title")
  assert.equal(info.explanationKey, "status.no-connection.body")
})

test("checking before anything is known", () => {
  assert.equal(deriveStatus(base), "checking")
  assert.equal(describeStatus(base).action, null)
})

test("online idle and busy follow the event stream", () => {
  assert.equal(deriveStatus(make({ sseConnected: true })), "online-idle")
  assert.equal(deriveStatus(make({ sseConnected: true, sessionBusy: true, lastHealth: "ok" })), "online-busy")
  assert.equal(describeStatus(make({ sseConnected: true })).tone, "ok")
})

test("a live stream outweighs a single failed check", () => {
  assert.equal(deriveStatus(make({ sseConnected: true, lastHealth: "timeout" })), "online-idle")
})

test("reconnecting when the stream dropped but the server answered", () => {
  const input = make({ reconnectAttempts: 2, lastHealth: "ok" })
  assert.equal(deriveStatus(input), "reconnecting")
  assert.equal(describeStatus(input).action, "retry")
  assert.deepEqual(chainLinks(input), { phone: "ok", computer: "ok", server: "ok", agent: "unknown" })
})

test("computer unreachable on network failure or timeout", () => {
  for (const lastHealth of ["unreachable", "timeout"] as const) {
    const input = make({ lastHealth, reconnectAttempts: 3 })
    assert.equal(deriveStatus(input), "computer-unreachable")
    assert.equal(describeStatus(input).action, "retry")
  }
  assert.equal(chainLinks(make({ lastHealth: "timeout" })).computer, "fail")
})

test("server stopped offers the launcher when there is one", () => {
  assert.equal(describeStatus(make({ lastHealth: "server-down", launcherAvailable: true })).action, "start-server")
  assert.equal(describeStatus(make({ lastHealth: "server-down" })).action, "retry")
  assert.deepEqual(chainLinks(make({ lastHealth: "server-down" })), { phone: "ok", computer: "ok", server: "fail", agent: "unknown" })
})

test("auth failure from the stream or from the check", () => {
  assert.equal(deriveStatus(make({ authError: true, sseConnected: true })), "auth-failed")
  const input = make({ lastHealth: "unauthorized" })
  assert.equal(deriveStatus(input), "auth-failed")
  assert.equal(describeStatus(input).action, "fix-password")
  assert.equal(describeStatus(input).tone, "error")
})

test("chain when all is well and when unknown", () => {
  assert.deepEqual(chainLinks(make({ sseConnected: true })), { phone: "ok", computer: "ok", server: "ok", agent: "ok" })
  assert.deepEqual(chainLinks(base), { phone: "ok", computer: "unknown", server: "unknown", agent: "unknown" })
})

test("combineProbes: server answered", () => {
  assert.equal(combineProbes(null, null), "ok")
  assert.equal(combineProbes(null, { kind: "unreachable" }), "ok")
})

test("combineProbes: launcher answering while the server is not means the server stopped", () => {
  assert.equal(combineProbes("timeout", { kind: "answers", serverUp: false }), "server-down")
  assert.equal(combineProbes("unreachable", { kind: "answers", serverUp: false }), "server-down")
})

test("combineProbes: neither answers is a computer problem", () => {
  assert.equal(combineProbes("unreachable", { kind: "unreachable" }), "unreachable")
  assert.equal(combineProbes("timeout", { kind: "unreachable" }), "timeout")
  assert.equal(combineProbes("timeout", null), "timeout")
})

test("combineProbes: password problems win, server errors without a launcher mean the server is down", () => {
  assert.equal(combineProbes("unauthorized", null), "unauthorized")
  assert.equal(combineProbes("unreachable", { kind: "unauthorized" }), "unauthorized")
  assert.equal(combineProbes("server-error", null), "server-down")
  assert.equal(combineProbes("unknown", null), "server-down")
})
