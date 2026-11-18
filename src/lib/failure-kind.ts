// Sorts a caught error into something a person can act on. Duck-typed on purpose (sdk.ts is RN-only,
// so this file cannot import its error classes): the SDK errors carry `status`, network errors only a message.

export type FailureKind = "unauthorized" | "timeout" | "unreachable" | "server-error" | "unknown"

const STATUS_IN_MESSAGE = /(?:API Error|HTTP|Failed to send message): (\d{3})\b/i

export function classifyFailure(error: unknown): FailureKind {
  const meta = (error ?? {}) as { status?: unknown; name?: unknown }
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  const fromMessage = Number(STATUS_IN_MESSAGE.exec(message)?.[1])
  const status = typeof meta.status === "number" ? meta.status : fromMessage
  if (meta.name === "ApiAuthError" || status === 401 || status === 403) return "unauthorized"
  if (/timed out|timeout|aborted/i.test(message)) return "timeout"
  if (/network request failed|failed to fetch|network error|unreachable|ENOTFOUND|ECONN|EHOSTUNREACH|ENETUNREACH|offline/i.test(message)) return "unreachable"
  if (Number.isFinite(status) && status >= 500) return "server-error"
  return "unknown"
}

/** i18n key for the message shown for this kind of failure; `scope` is what was being done. */
export function failureMessageKey(kind: FailureKind, scope: "load" | "send"): string {
  return `errors.${scope}.${kind}`
}
