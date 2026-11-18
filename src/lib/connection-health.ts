// One overall status for "can I work right now?", derived from what the app already knows:
// the event stream (SSE), the periodic health check and the launcher. Pure: no React/Expo imports.

import type { FailureKind } from "./failure-kind.ts"
import type { LauncherProbe } from "./launcher.ts"

/** Result of the periodic check of the server (and, when there is a launcher, of the computer). */
export type HealthResult = "ok" | "unreachable" | "unauthorized" | "timeout" | "server-down"

export type OverallStatus =
  | "no-connection"
  | "checking"
  | "online-idle"
  | "online-busy"
  | "reconnecting"
  | "computer-unreachable"
  | "server-stopped"
  | "auth-failed"

export type SuggestedAction = "retry" | "start-server" | "fix-password" | "open-connections" | null
export type StatusTone = "ok" | "busy" | "warn" | "error" | "neutral"
export type LinkState = "ok" | "fail" | "unknown"

export interface HealthInputs {
  hasConnection: boolean
  sseConnected: boolean
  authError: boolean
  lastHealth: HealthResult | null
  reconnectAttempts: number
  sessionBusy: boolean
  launcherAvailable: boolean
}

export interface StatusInfo {
  status: OverallStatus
  /** i18n keys */
  titleKey: string
  explanationKey: string
  action: SuggestedAction
  tone: StatusTone
}

export interface ChainLinks {
  phone: LinkState
  computer: LinkState
  server: LinkState
  agent: LinkState
}

const TONES: Record<OverallStatus, StatusTone> = {
  "no-connection": "neutral",
  checking: "neutral",
  "online-idle": "ok",
  "online-busy": "busy",
  reconnecting: "warn",
  "computer-unreachable": "error",
  "server-stopped": "error",
  "auth-failed": "error",
}

export function deriveStatus(input: HealthInputs): OverallStatus {
  if (!input.hasConnection) return "no-connection"
  if (input.authError || input.lastHealth === "unauthorized") return "auth-failed"
  if (input.lastHealth === "server-down") return "server-stopped"
  // A live event stream proves the whole path works, so one slow or failed check does not override it.
  if (input.sseConnected) return input.sessionBusy ? "online-busy" : "online-idle"
  if (input.lastHealth === "unreachable" || input.lastHealth === "timeout") return "computer-unreachable"
  return input.reconnectAttempts > 0 ? "reconnecting" : "checking"
}

function actionFor(status: OverallStatus, launcherAvailable: boolean): SuggestedAction {
  switch (status) {
    case "no-connection":
      return "open-connections"
    case "auth-failed":
      return "fix-password"
    case "server-stopped":
      return launcherAvailable ? "start-server" : "retry"
    case "computer-unreachable":
    case "reconnecting":
      return "retry"
    default:
      return null
  }
}

export function describeStatus(input: HealthInputs): StatusInfo {
  const status = deriveStatus(input)
  return {
    status,
    titleKey: `status.${status}.title`,
    explanationKey: `status.${status}.body`,
    action: actionFor(status, input.launcherAvailable),
    tone: TONES[status],
  }
}

/** The chain Phone -> Computer -> Server -> Agent, each link marked ok / fail / unknown. */
export function chainLinks(input: HealthInputs): ChainLinks {
  const status = deriveStatus(input)
  switch (status) {
    case "online-idle":
    case "online-busy":
      return { phone: "ok", computer: "ok", server: "ok", agent: "ok" }
    case "computer-unreachable":
      return { phone: "ok", computer: "fail", server: "unknown", agent: "unknown" }
    case "server-stopped":
    case "auth-failed":
      return { phone: "ok", computer: "ok", server: "fail", agent: "unknown" }
    case "reconnecting": {
      const reachable = input.lastHealth === "ok"
      const link: LinkState = reachable ? "ok" : "unknown"
      return { phone: "ok", computer: link, server: link, agent: "unknown" }
    }
    case "checking":
    case "no-connection":
      return { phone: "ok", computer: "unknown", server: "unknown", agent: "unknown" }
  }
}

/**
 * Combines the two probes of one health check. `server` is null when the server answered, else why it did not;
 * `launcher` is null when the connection has no launcher. A launcher that answers while the server does not means
 * the computer is fine and the server is stopped.
 */
export function combineProbes(server: FailureKind | null, launcher: LauncherProbe | null): HealthResult {
  if (server === null) return "ok"
  if (server === "unauthorized" || launcher?.kind === "unauthorized") return "unauthorized"
  if (launcher?.kind === "answers") return "server-down"
  if (server === "timeout") return "timeout"
  if (server === "unreachable") return "unreachable"
  return "server-down"
}
