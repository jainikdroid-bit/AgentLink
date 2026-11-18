import { test } from "node:test"
import assert from "node:assert/strict"
import { ALLOW_EXTERNAL_APPS, MAX_STREAM_CHARS, clampTimeoutMs, shapeTermuxResult, truncateOutput } from "./termux-pure.ts"

test("timeouts default to 60 s and stay within 1..300 s", () => {
  assert.equal(clampTimeoutMs(undefined), 60_000)
  assert.equal(clampTimeoutMs(""), 60_000)
  assert.equal(clampTimeoutMs("abc"), 60_000)
  assert.equal(clampTimeoutMs("-5"), 60_000)
  assert.equal(clampTimeoutMs(10), 10_000)
  assert.equal(clampTimeoutMs("0.2"), 1_000)
  assert.equal(clampTimeoutMs(9999), 300_000)
})

test("long output keeps its end and says how much was cut", () => {
  assert.equal(truncateOutput("short"), "short")
  const long = "a".repeat(MAX_STREAM_CHARS + 10) + "END"
  const out = truncateOutput(long)
  assert.ok(out.endsWith("END"))
  assert.match(out, /^\[… 13 characters cut …\]/)
})

test("Termux's own failure is surfaced, a normal run is not an error", () => {
  assert.deepEqual(shapeTermuxResult({ stdout: "hi\n", stderr: "", exitCode: 0, errCode: -1, errmsg: "" }), { exitCode: 0, stdout: "hi\n", stderr: "" })
  const failed = shapeTermuxResult({ stdout: "", stderr: "", exitCode: -1, errCode: 1, errmsg: "allow-external-apps is not true" })
  assert.equal(failed.error, "allow-external-apps is not true")
  assert.equal(shapeTermuxResult({}).exitCode, -1)
})

test("the setup line enables external apps and reloads Termux", () => {
  assert.match(ALLOW_EXTERNAL_APPS, /allow-external-apps=true/)
  assert.match(ALLOW_EXTERNAL_APPS, /termux-reload-settings$/)
})
