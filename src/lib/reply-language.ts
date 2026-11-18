// Asks the agent to think and reply in the language the app is shown in. Pure: the
// caller passes the resolved locale, so this has no i18n/Expo imports.
import type { SupportedLocale } from "./i18n/locale-resolve.ts"

/** English names, because the instruction itself is written in English. */
export const LANGUAGE_NAMES_EN: Record<SupportedLocale, string> = {
  en: "English",
  ru: "Russian",
  "zh-Hans": "Simplified Chinese",
  es: "Spanish",
  de: "German",
  fr: "French",
  pt: "Portuguese",
  ja: "Japanese",
  ko: "Korean",
  uk: "Ukrainian",
  tr: "Turkish",
}

/**
 * The sentence sent along with a prompt, or null when nothing should be added
 * (toggle off, or the app is in English: agents already answer in English).
 */
export function replyLanguageInstruction(locale: SupportedLocale, enabled: boolean): string | null {
  if (!enabled || locale === "en") return null
  return `Please think and reply in ${LANGUAGE_NAMES_EN[locale]}.`
}

/** For APIs without a separate system field: the instruction goes first, the message follows after a blank line. */
export function withReplyLanguage(text: string, instruction: string | null): string {
  if (!instruction) return text
  return text ? `${instruction}\n\n${text}` : instruction
}

const INSTRUCTION_LINE = /^Please think and reply in [A-Za-z ]+\.(?:\n\n|$)/

/** Hides the instruction from the user's own message when the server stored it in the text (v2 API). */
export function stripReplyLanguage(text: string): string {
  return text.replace(INSTRUCTION_LINE, "")
}
