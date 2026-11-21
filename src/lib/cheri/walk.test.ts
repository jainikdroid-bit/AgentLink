import { test } from "node:test"
import assert from "node:assert/strict"
import { CHERI_CAMERA_DISTANCE, CHERI_CAMERA_FOV, WALK_MILLISECONDS, WALK_SPEED, WALK_STANCE, stepOffset, walkScreenSpeed } from "./walk.ts"

test("the planted foot cancels the window's advance at every avatar size", () => {
  const viewHeight = 2 * CHERI_CAMERA_DISTANCE * Math.tan(CHERI_CAMERA_FOV * Math.PI / 360)
  for (const height of [134, 176, 420]) {
    const speed = walkScreenSpeed(height)
    const plantedScreenX = (t: number) => speed * t + stepOffset(t, 0).forward * height / viewHeight
    assert.ok(Math.abs(plantedScreenX(0.6) - plantedScreenX(0.1)) < 0.00001)
  }
})

test("the swing joins ground contact without a jump in position or velocity", () => {
  const duration = WALK_MILLISECONDS / 1000
  const delta = 0.00001
  for (const contact of [duration * WALK_STANCE, duration]) {
    const before = stepOffset(contact - delta, 0)
    const after = stepOffset(contact + delta, 0)
    assert.ok(Math.abs((after.forward - before.forward) / (2 * delta) + WALK_SPEED) < 0.0005)
    assert.ok(before.lift < delta && after.lift < delta)
  }
})

test("each leg has a support interval while the other foot swings", () => {
  for (let frame = 0; frame < 120; frame++) {
    const time = frame * WALK_MILLISECONDS / 120_000
    assert.equal(Math.min(stepOffset(time, 0).lift, stepOffset(time, 1).lift), 0)
  }
})
