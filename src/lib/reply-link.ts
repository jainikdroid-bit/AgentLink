// Replies typed in the notification shade (Termux direct reply) reach the app as
// opencode://session/<id>?replyHex=<utf-8 bytes as hex>: hex survives any shell/URL quoting.
/** Large enough for a merged-sessions context (session-merge caps it at ~40k). */
export const MAX_REPLY_CHARS = 60_000

export function decodeReplyHex(hex: unknown): string | null {
  if (typeof hex !== "string" || hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) return null
  try {
    const text = decodeURIComponent(hex.replace(/(..)/g, "%$1")).trim()
    return text ? text.slice(0, MAX_REPLY_CHARS) : null
  } catch {
    return null
  }
}

export function encodeReplyHex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("")
}
