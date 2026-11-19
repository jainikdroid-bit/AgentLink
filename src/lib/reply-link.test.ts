import { test } from "node:test"
import assert from "node:assert/strict"
import { decodeReplyHex, encodeReplyHex } from "./reply-link.ts"

test("a reply survives the hex round trip, Cyrillic and quotes included", () => {
  const text = 'Да, сделай "так" & потом $HOME'
  assert.equal(decodeReplyHex(encodeReplyHex(text)), text)
})

test("bad or empty input is ignored", () => {
  for (const bad of [undefined, "", "abc", "zz", "%41", 5, encodeReplyHex("   ")]) assert.equal(decodeReplyHex(bad), null)
  assert.equal(decodeReplyHex("c3"), null)
})
