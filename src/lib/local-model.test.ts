import { test } from "node:test"
import assert from "node:assert/strict"
import { modelLabel, parseLocalModels } from "./local-model.ts"

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
