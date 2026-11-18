import test from "node:test"
import assert from "node:assert/strict"
import { classifyFailure, failureMessageKey } from "./failure-kind.ts"

test("auth failures", () => {
  const e = Object.assign(new Error("API Error: 401 - nope"), { name: "ApiAuthError", status: 401 })
  assert.equal(classifyFailure(e), "unauthorized")
  assert.equal(classifyFailure(new Error("API Error: 403 - x")), "unauthorized")
})

test("timeouts", () => {
  assert.equal(classifyFailure(new Error("Request timed out after 30000ms")), "timeout")
  assert.equal(classifyFailure(new Error("The operation was aborted")), "timeout")
})

test("unreachable", () => {
  assert.equal(classifyFailure(new TypeError("Network request failed")), "unreachable")
  assert.equal(classifyFailure(new Error("connect ECONNREFUSED 1.2.3.4:4096")), "unreachable")
})

test("server errors", () => {
  assert.equal(classifyFailure(Object.assign(new Error("API Error: 500 - boom"), { status: 500 })), "server-error")
  assert.equal(classifyFailure(new Error("Failed to send message: 502 - bad gateway")), "server-error")
  assert.equal(classifyFailure(new Error("API Error: 404 - no")), "unknown")
})

test("unknown and keys", () => {
  assert.equal(classifyFailure(undefined), "unknown")
  assert.equal(classifyFailure("weird"), "unknown")
  assert.equal(failureMessageKey("timeout", "send"), "errors.send.timeout")
})
