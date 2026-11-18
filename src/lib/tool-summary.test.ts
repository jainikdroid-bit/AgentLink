import test from "node:test"
import assert from "node:assert/strict"
import { countTools, summarizeTools, groupConsecutive } from "./tool-summary.ts"

test("counts tools in order of first appearance", () => {
  assert.deepEqual(countTools(["bash", "edit", "bash", undefined, "bash"]), [
    { name: "bash", count: 3 },
    { name: "edit", count: 1 },
    { name: "tool", count: 1 },
  ])
})

test("summary shows counts above one and trims the tail", () => {
  assert.equal(summarizeTools(["bash", "bash", "bash", "edit", "edit"]), "bash ×3, edit ×2")
  assert.equal(summarizeTools(["read"]), "read")
  assert.equal(summarizeTools(["a", "b", "c", "d", "e"]), "a, b, c +2")
  assert.equal(summarizeTools([]), "")
})

test("groups consecutive tool items and keeps the order", () => {
  const items = [
    { id: "1", t: "agent" },
    { id: "2", t: "tool" },
    { id: "3", t: "tool" },
    { id: "4", t: "thought" },
    { id: "5", t: "tool" },
  ]
  const out = groupConsecutive(items, (i) => i.t === "tool")
  assert.equal(out.length, 4)
  assert.deepEqual(out[1], { kind: "group", id: "group:2", items: [items[1], items[2]] })
  assert.deepEqual(out[3], { kind: "group", id: "group:5", items: [items[4]] })
  assert.deepEqual(out[0], { kind: "item", item: items[0] })
})

test("no tools means no groups", () => {
  assert.deepEqual(groupConsecutive([{ id: "1" }], () => false), [{ kind: "item", item: { id: "1" } }])
})
