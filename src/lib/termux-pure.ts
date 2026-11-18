// Pure helpers for phone_termux_run (no React Native imports, unit-tested).

export const DEFAULT_TIMEOUT_SEC = 60
export const MAX_TIMEOUT_SEC = 300
/** Per stream, so a chatty command cannot flood the agent's context. */
export const MAX_STREAM_CHARS = 16_000

/** The agent's timeoutSec (text or number) as milliseconds, clamped to 1..300 s; bad input means the default. */
export function clampTimeoutMs(value: unknown): number {
  const n = typeof value === "number" ? value : Number(String(value ?? "").trim())
  const sec = Number.isFinite(n) && n > 0 ? Math.min(MAX_TIMEOUT_SEC, Math.max(1, n)) : DEFAULT_TIMEOUT_SEC
  return Math.round(sec * 1000)
}

/** Keeps the end of a long output (where errors and results usually are) and says how much was cut. */
export function truncateOutput(text: string, max = MAX_STREAM_CHARS): string {
  if (text.length <= max) return text
  const cut = text.length - max
  return `[… ${cut} characters cut …]\n${text.slice(text.length - max)}`
}

export interface TermuxResult {
  exitCode: number
  stdout: string
  stderr: string
  /** Termux's own error (e.g. allow-external-apps is off), when it could not run the command at all. */
  error?: string
}

export function shapeTermuxResult(raw: { stdout?: string; stderr?: string; exitCode?: number; errCode?: number; errmsg?: string }): TermuxResult {
  const out: TermuxResult = {
    exitCode: typeof raw.exitCode === "number" ? raw.exitCode : -1,
    stdout: truncateOutput(raw.stdout ?? ""),
    stderr: truncateOutput(raw.stderr ?? ""),
  }
  // Termux reports err = -1 (RESULT_CODE_OK) when it ran the command; anything else is its own failure.
  if (typeof raw.errCode === "number" && raw.errCode !== -1 && raw.errmsg) out.error = raw.errmsg
  return out
}

/** The one-line Termux setting that lets other apps run commands. */
export const ALLOW_EXTERNAL_APPS = 'mkdir -p ~/.termux && echo "allow-external-apps=true" >> ~/.termux/termux.properties && termux-reload-settings'
