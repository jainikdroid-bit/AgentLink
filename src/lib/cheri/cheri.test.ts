import { test } from "node:test"
import assert from "node:assert/strict"
import { BASE_POSE, PET_SCENE, enterScene, frameAt, moodPose, nextDelayMs, pickScene, sampleFx, sampleScene, sceneLength, tapScene } from "./director.ts"
import { renderFrame } from "./render.ts"
import { ALL_SCENES, MOOD_SCENES, SCENE_BY_ID, TAP_SCENES } from "./scenes.ts"
import type { Mood } from "./types.ts"

const MOODS: Mood[] = ["idle", "thinking", "working", "writing", "loading", "success", "error", "offline"]

test("scene ids are unique and every key and fx track sits inside its scene", () => {
  const ids = ALL_SCENES.map((s) => s.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const scene of ALL_SCENES) {
    assert.ok(scene.ms > 0, scene.id)
    let previous = -1
    for (const key of scene.keys) {
      assert.ok(key.t >= previous && key.t <= scene.ms, `${scene.id} key at ${key.t}`)
      previous = key.t
    }
    for (const fx of scene.fx ?? []) assert.ok(fx.t0 <= fx.t1 && fx.t1 <= scene.ms, `${scene.id} fx ${fx.k}`)
  }
})

test("there is plenty to watch: many idle skits and something for every mood", () => {
  assert.ok(MOOD_SCENES.idle.length >= 15)
  for (const mood of MOODS) assert.ok(MOOD_SCENES[mood].length >= 2, mood)
  assert.ok(TAP_SCENES.length >= 6)
})

test("a scene starts and ends on the mood's pose", () => {
  const base = moodPose("idle")
  for (const scene of ALL_SCENES) {
    assert.deepEqual(sampleScene(scene, 0, base), base)
    assert.deepEqual(sampleScene(scene, scene.ms, base), base)
  }
})

test("every frame of every scene renders to a compact, well-formed SVG", () => {
  for (const scene of ALL_SCENES) {
    for (const mood of MOODS) {
      for (const f of [0.05, 0.3, 0.5, 0.8]) {
        const svg = renderFrame(frameAt(mood, { id: scene.id, start: 0 }, scene.ms * f), mood)
        assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), scene.id)
        assert.ok(!svg.includes("NaN") && !svg.includes("undefined"), `${scene.id} ${mood} ${f}`)
        assert.ok(svg.length < 16000, `${scene.id} is ${svg.length} bytes`)
      }
    }
  }
})

test("fx fade in and out and report their own progress", () => {
  const fx = sampleFx([{ k: "heart", t0: 100, t1: 1100, x: 10, y: 20, y2: 0 }], 600)
  assert.equal(fx.length, 1)
  assert.equal(fx[0].p, 0.5)
  assert.equal(fx[0].y, 10)
  assert.equal(fx[0].o, 1)
  assert.equal(sampleFx([{ k: "heart", t0: 100, t1: 1100, x: 0, y: 0 }], 1200).length, 0)
})

test("pickScene stays in the mood's pool and never repeats the last one", () => {
  for (const mood of MOODS) {
    const pool = MOOD_SCENES[mood].map((s) => s.id)
    for (const r of [0, 0.4, 0.99]) {
      for (const last of [null, ...pool]) {
        const id = pickScene(mood, () => r, last)
        assert.ok(id && pool.includes(id))
        if (pool.length > 1 && last) assert.notEqual(id, last)
      }
    }
    const delay = nextDelayMs(mood, () => 0.5)
    assert.ok(delay >= 2000 && delay <= 12000)
  }
})

test("taps escalate, a long press pets, success and error get an entrance", () => {
  assert.equal(tapScene(1), "tapGiggle")
  assert.equal(tapScene(5), "tapPout")
  assert.equal(tapScene(7), "tapDizzy")
  assert.equal(tapScene(50), "tapIgnore")
  for (let n = 1; n < 12; n++) assert.ok(SCENE_BY_ID[tapScene(n)], `tap ${n}`)
  assert.ok(sceneLength(PET_SCENE) > 0)
  assert.equal(enterScene("working", "success"), "victory")
  assert.equal(enterScene("thinking", "error"), "facepalm")
  assert.equal(enterScene("idle", "idle"), null)
})

test("the resting pose keeps both hands below the frame", () => {
  assert.ok(BASE_POSE.l.y > 120 && BASE_POSE.r.y > 120)
})
