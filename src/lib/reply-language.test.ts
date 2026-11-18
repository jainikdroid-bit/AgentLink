import test from "node:test"
import assert from "node:assert/strict"
import { SUPPORTED_LOCALES } from "./i18n/locale-resolve.ts"
import { LANGUAGE_NAMES_EN, replyLanguageInstruction, withReplyLanguage } from "./reply-language.ts"

test("names the language in English for every non-English locale", () => {
  assert.equal(replyLanguageInstruction("ru", true), "Please think and reply in Russian.")
  assert.equal(replyLanguageInstruction("zh-Hans", true), "Please think and reply in Simplified Chinese.")
  assert.equal(replyLanguageInstruction("uk", true), "Please think and reply in Ukrainian.")
  assert.equal(replyLanguageInstruction("pt", true), "Please think and reply in Portuguese.")
  assert.equal(replyLanguageInstruction("tr", true), "Please think and reply in Turkish.")
  assert.equal(replyLanguageInstruction("ko", true), "Please think and reply in Korean.")
  assert.equal(replyLanguageInstruction("ja", true), "Please think and reply in Japanese.")
})

test("every supported locale has a name", () => {
  for (const locale of SUPPORTED_LOCALES) assert.ok(LANGUAGE_NAMES_EN[locale], locale)
})

test("returns null for English or when the toggle is off", () => {
  assert.equal(replyLanguageInstruction("en", true), null)
  assert.equal(replyLanguageInstruction("ru", false), null)
})

test("withReplyLanguage puts the instruction first and keeps the text", () => {
  assert.equal(withReplyLanguage("hi", "Please think and reply in German."), "Please think and reply in German.\n\nhi")
  assert.equal(withReplyLanguage("hi", null), "hi")
  assert.equal(withReplyLanguage("", "X"), "X")
})

test("stripReplyLanguage hides only our leading instruction", async () => {
  const { stripReplyLanguage, withReplyLanguage } = await import("./reply-language.ts")
  assert.equal(stripReplyLanguage(withReplyLanguage("Hello", "Please think and reply in Russian.")), "Hello")
  assert.equal(stripReplyLanguage("Please think and reply in Simplified Chinese."), "")
  assert.equal(stripReplyLanguage("Hello\n\nPlease think and reply in Russian."), "Hello\n\nPlease think and reply in Russian.")
  assert.equal(stripReplyLanguage("please think about it"), "please think about it")
})
