import { test } from "node:test"
import assert from "node:assert/strict"
import { modelLabel, parseLocalModels, waitForLocalModelState, type LocalModel } from "./local-model.ts"

test("models and their memory state are read from the launcher", () => {
  assert.deepEqual(parseLocalModels(200, { ok: true, available: true, models: [{ id: "qwen36-free", state: "loaded" }, { id: "x", state: "weird" }] }), [
    { id: "qwen36-free", state: "loaded" },
    { id: "x", state: "unknown" },
  ])
})

test("no model server, an old launcher or an error means nothing to show", () => {
  assert.equal(parseLocalModels(200, { ok: true, available: false }), null)
  assert.equal(parseLocalModels(404, { ok: false }), null)
  assert.equal(parseLocalModels(200, null), null)
})

test("labels drop folders and the .gguf extension", () => {
  assert.equal(modelLabel("qwen36-free"), "qwen36-free")
  assert.equal(modelLabel("org/Model-7B-Q4_K_M.gguf"), "Model-7B-Q4_K_M")
})

test("unloading waits for confirmation even if the first refresh still says loaded", async () => {
  const snapshots: (LocalModel[] | null)[] = [
    [{ id: "qwen36-free", state: "loaded" }],
    null,
    [{ id: "qwen36-free", state: "unloading" }],
    [{ id: "qwen36-free", state: "unloaded" }],
  ]
  const result = await waitForLocalModelState(
    async () => snapshots.shift() ?? null, "qwen36-free", "unloaded",
    new AbortController().signal, { intervalMs: 0 },
  )
  assert.deepEqual(result, [{ id: "qwen36-free", state: "unloaded" }])
})

test("an unconfirmed change reports failure and a cancelled change ignores late snapshots", async () => {
  const controller = new AbortController()
  assert.equal(await waitForLocalModelState(
    async () => [{ id: "qwen36-free", state: "loaded" }],
    "qwen36-free", "unloaded", controller.signal, { timeoutMs: 0 },
  ), null)
  assert.equal(await waitForLocalModelState(async () => {
    controller.abort()
    return [{ id: "qwen36-free", state: "unloaded" }]
  }, "qwen36-free", "unloaded", controller.signal), null)
})
