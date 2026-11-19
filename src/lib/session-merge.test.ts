import test from "node:test"
import assert from "node:assert/strict"
import { buildMergePrompt, messageText, MERGE_INSTRUCTION, type MergeSource } from "./session-merge.ts"

const msg = (role: string, text: string, extra: Record<string, unknown> = {}) => ({
  info: { role },
  parts: [{ type: "text", text, ...extra }],
})

test("messageText keeps visible text only", () => {
  const t = messageText([
    { type: "reasoning", text: "thinking" },
    { type: "text", text: " hello " },
    { type: "tool" },
    { type: "text", text: "auto", synthetic: true },
    { type: "file" },
    { type: "text", text: "world" },
  ])
  assert.equal(t, "hello\n\nworld")
})

test("sessions are ordered oldest first with title and date headers", () => {
  const a: MergeSource = { title: "New one", created: Date.UTC(2026, 10, 2), messages: [msg("user", "second")] }
  const b: MergeSource = { title: "Old one", created: Date.UTC(2026, 10, 1), messages: [msg("user", "first"), msg("assistant", "done")] }
  const { text, dropped } = buildMergePrompt([a, b])
  assert.equal(dropped, 0)
  assert.ok(text.indexOf("Old one") < text.indexOf("New one"))
  assert.ok(text.includes("(2026-11-01 00:00)"))
  assert.ok(text.includes("User: first\n\nAssistant: done"))
  assert.ok(text.endsWith(MERGE_INSTRUCTION))
})

test("skips empty/non-text messages and untitled sessions get the fallback", () => {
  const s: MergeSource = {
    created: 1,
    messages: [{ info: { role: "assistant" }, parts: [{ type: "tool" }, { type: "reasoning", text: "x" }] }, msg("user", "hi")],
  }
  const { text, included } = buildMergePrompt([s], { untitled: "Без названия" })
  assert.equal(included, 1)
  assert.ok(text.includes("Без названия"))
  assert.ok(!text.includes("Assistant:"))
})

test("long messages are trimmed and marked", () => {
  const s: MergeSource = { created: 1, messages: [msg("user", "x".repeat(500))] }
  const { text } = buildMergePrompt([s], { maxMessageChars: 100 })
  assert.ok(text.includes("[... 400 more characters cut]"))
})

test("cap drops oldest messages first and reports how many", () => {
  const messages = Array.from({ length: 20 }, (_, i) => msg(i % 2 ? "assistant" : "user", `m${String(i).padStart(2, "0")} ` + "y".repeat(200)))
  const { text, dropped, included } = buildMergePrompt([{ title: "T", created: 1, messages }], { maxChars: 2000 })
  assert.ok(dropped > 0)
  assert.equal(dropped + included, 20)
  assert.ok(text.length <= 2000)
  assert.ok(text.includes("m19"))
  assert.ok(!text.includes("m00 "))
  assert.ok(text.includes(`${dropped} of 20 earlier messages were left out`))
})

test("no readable messages still yields a prompt", () => {
  const { text, included } = buildMergePrompt([{ created: 1, messages: [] }])
  assert.equal(included, 0)
  assert.ok(text.includes("(no readable messages)"))
})
