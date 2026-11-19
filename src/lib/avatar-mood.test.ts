import { test } from "node:test"
import assert from "node:assert/strict"
import { avatarMood, clampPosition, pinchWidth } from "./avatar-mood.ts"

test("connection problems win over everything", () => {
  assert.equal(avatarMood("computer-unreachable", "thinking", false), "offline")
  assert.equal(avatarMood("server-stopped", null, true), "offline")
  assert.equal(avatarMood("auth-failed", "working", false), "error")
})

test("the agent's activity drives her while online", () => {
  assert.equal(avatarMood("online-busy", "thinking", false), "thinking")
  assert.equal(avatarMood("online-busy", null, false), "working")
  assert.equal(avatarMood("online-idle", null, true), "success")
  assert.equal(avatarMood("reconnecting", null, false), "loading")
  assert.equal(avatarMood("online-idle", null, false), "idle")
})

test("the floating window stays on screen", () => {
  assert.deepEqual(clampPosition(-50, 9999, 100, 120, 400, 800), { x: 4, y: 676 })
  assert.deepEqual(clampPosition(100, 100, 100, 120, 400, 800), { x: 100, y: 100 })
})

test("pinching scales her within limits", () => {
  assert.equal(pinchWidth(100, 1.5), 150)
  assert.equal(pinchWidth(160, 10), 200)
  assert.equal(pinchWidth(160, 0.1), 50)
  assert.equal(pinchWidth(160, Number.NaN), 160)
})
