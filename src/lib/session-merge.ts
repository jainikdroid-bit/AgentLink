// Builds the first prompt of a "merged" session out of several earlier sessions. Pure: no RN/Expo imports.

export interface MergePart {
  type: string
  text?: string
  synthetic?: boolean
  ignored?: boolean
}

export interface MergeMessage {
  info: { role: string }
  parts: MergePart[]
}

export interface MergeSource {
  title?: string
  /** Epoch ms used for ordering (oldest first) and the header date. */
  created?: number
  messages: MergeMessage[]
}

export interface MergeOptions {
  /** Cap for the whole prompt. */
  maxChars?: number
  /** Cap for one message; longer ones are cut and marked. */
  maxMessageChars?: number
  /** Fallback title for sessions without one. */
  untitled?: string
  /** Instruction appended at the end. */
  instruction?: string
}

export const DEFAULT_MAX_CHARS = 40_000
export const DEFAULT_MAX_MESSAGE_CHARS = 4_000
export const MERGE_INSTRUCTION =
  "Read this context from earlier sessions. Reply only with a short summary of what was done and what is still open, then wait for my next request."

interface Entry {
  sourceIndex: number
  text: string
}

function formatDate(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "unknown date"
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ")
}

/** Visible text of one message: text parts only, no reasoning/tool/file/synthetic/ignored. */
export function messageText(parts: readonly MergePart[]): string {
  return parts
    .filter((p) => p.type === "text" && !p.synthetic && !p.ignored && typeof p.text === "string")
    .map((p) => (p.text as string).trim())
    .filter(Boolean)
    .join("\n\n")
}

function trimMessage(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n[... ${text.length - max} more characters cut]`
}

/**
 * The merge prompt, plus how many messages were dropped to fit the cap.
 * Sessions go oldest first; when the cap is exceeded the oldest messages are dropped first.
 */
export function buildMergePrompt(
  sources: readonly MergeSource[],
  opts: MergeOptions = {},
): { text: string; dropped: number; included: number } {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS
  const maxMsg = opts.maxMessageChars ?? DEFAULT_MAX_MESSAGE_CHARS
  const untitled = opts.untitled ?? "Untitled"
  const instruction = opts.instruction ?? MERGE_INSTRUCTION

  const ordered = sources
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.created ?? 0) - (b.s.created ?? 0) || a.i - b.i)
    .map((x) => x.s)

  const headers = ordered.map((s, i) => `=== Session ${i + 1}: ${s.title?.trim() || untitled} (${formatDate(s.created)}) ===`)

  const entries: Entry[] = []
  ordered.forEach((s, sourceIndex) => {
    for (const m of s.messages) {
      const body = messageText(m.parts)
      if (!body) continue
      const label = m.info.role === "user" ? "User" : m.info.role === "assistant" ? "Assistant" : null
      if (!label) continue
      entries.push({ sourceIndex, text: `${label}: ${trimMessage(body, maxMsg)}` })
    }
  })

  const total = entries.length
  const preface = "Context from earlier sessions:\n\n"
  const tail = `\n\n${instruction}`
  const sep = "\n\n"
  const noteReserve = 120

  // Size of the prompt if only entries[from..] are kept (headers counted once per session that still has messages).
  const sizeFrom = (from: number): number => {
    let size = preface.length + tail.length + noteReserve
    const seen = new Set<number>()
    for (let i = from; i < entries.length; i++) {
      const e = entries[i]
      if (!seen.has(e.sourceIndex)) {
        seen.add(e.sourceIndex)
        size += headers[e.sourceIndex].length + sep.length
      }
      size += e.text.length + sep.length
    }
    return size
  }
  let start = 0
  while (start < entries.length && sizeFrom(start) > maxChars) start++

  const kept = entries.slice(start)
  const lines: string[] = []
  let current = -1
  for (const e of kept) {
    if (e.sourceIndex !== current) {
      current = e.sourceIndex
      lines.push(headers[current])
    }
    lines.push(e.text)
  }
  if (kept.length === 0) lines.push("(no readable messages)")

  const note = start > 0 ? `[${start} of ${total} earlier messages were left out to keep this short.]\n\n` : ""
  return { text: `${preface}${note}${lines.join(sep)}${tail}`, dropped: start, included: kept.length }
}
