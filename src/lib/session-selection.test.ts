import test from "node:test"
import assert from "node:assert/strict"
import { EMPTY_SELECTION, selectionReducer as r, pruneSelection } from "./session-selection.ts"

test("enter selects the session and activates", () => {
  const s = r(EMPTY_SELECTION, { type: "enter", id: "a" })
  assert.equal(s.active, true)
  assert.deepEqual(s.ids, ["a"])
})
test("toggle adds and removes; removing the last one leaves selection mode", () => {
  let s = r(EMPTY_SELECTION, { type: "enter", id: "a" })
  s = r(s, { type: "toggle", id: "b" })
  assert.deepEqual(s.ids, ["a", "b"])
  s = r(s, { type: "toggle", id: "a" })
  assert.deepEqual(s.ids, ["b"])
  s = r(s, { type: "toggle", id: "b" })
  assert.deepEqual(s, EMPTY_SELECTION)
})
test("toggle outside selection mode does nothing", () => {
  assert.equal(r(EMPTY_SELECTION, { type: "toggle", id: "a" }), EMPTY_SELECTION)
})
test("selectAll dedupes; empty list clears", () => {
  assert.deepEqual(r(EMPTY_SELECTION, { type: "selectAll", ids: ["a", "b", "a"] }).ids, ["a", "b"])
  assert.deepEqual(r({ active: true, ids: ["a"] }, { type: "selectAll", ids: [] }), EMPTY_SELECTION)
})
test("clear resets", () => {
  assert.deepEqual(r({ active: true, ids: ["a"] }, { type: "clear" }), EMPTY_SELECTION)
})
test("reducer never mutates its input", () => {
  const s = { active: true, ids: ["a"] as readonly string[] }
  r(s, { type: "toggle", id: "b" })
  assert.deepEqual(s.ids, ["a"])
})
test("pruneSelection drops vanished ids and exits when empty", () => {
  const s = { active: true, ids: ["a", "b"] as readonly string[] }
  assert.deepEqual(pruneSelection(s, ["b", "c"]).ids, ["b"])
  assert.deepEqual(pruneSelection(s, ["z"]), EMPTY_SELECTION)
  assert.equal(pruneSelection(s, ["a", "b"]), s)
})
