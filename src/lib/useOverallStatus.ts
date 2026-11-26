import { useMemo } from "react"
import { useConnections } from "../stores/connections"
import { useEvents } from "../stores/events"
import { useHealth } from "../stores/health"
import { canStartFromPhone } from "./launcher"
import { chainLinks, describeStatus, type HealthInputs } from "./connection-health"

/** The one status of phone -> computer -> server -> agent, for the chip and the details sheet. */
export function useOverallStatus(opts: { sessionId?: string; busy?: boolean } = {}) {
  const { sessionId, busy: busyOverride } = opts
  const activeConnection = useConnections((s) => s.activeConnection)
  const sseConnected = useEvents((s) => s.connected)
  const authError = useEvents((s) => s.authError)
  const reconnectAttempts = useEvents((s) => s.reconnectAttempts)
  const sessionStatus = useEvents((s) => s.sessionStatus)
  const lastHealth = useHealth((s) => s.lastHealth)
  const checkedAt = useHealth((s) => s.checkedAt)
  const checking = useHealth((s) => s.checking)

  return useMemo(() => {
    const busy = (type: string) => type === "busy" || type === "retry"
    const sessionBusy =
      busyOverride !== undefined
        ? busyOverride
        : sessionId
          ? busy(sessionStatus[sessionId]?.type ?? "idle")
          : Object.values(sessionStatus).some((st) => busy(st.type))
    const input: HealthInputs = {
      hasConnection: !!activeConnection,
      sseConnected,
      authError,
      lastHealth,
      reconnectAttempts,
      sessionBusy,
      launcherAvailable: canStartFromPhone(activeConnection),
    }
    const info = describeStatus(input)
    const links = chainLinks(input)
    // An open event stream proves connectivity, not that the model can answer.
    const statuses = sessionId ? [sessionStatus[sessionId]] : Object.values(sessionStatus)
    const retry = busyOverride === undefined && info.status === "online-busy"
      ? statuses.find((st) => st?.type === "retry")
      : undefined
    const retryAttempt = retry?.type === "retry" ? retry.attempt : undefined
    if (retryAttempt !== undefined) links.agent = "unknown"
    return { info: retryAttempt === undefined ? info : { ...info, tone: "warn" as const }, links, checkedAt, checking, retryAttempt }
  }, [activeConnection, sseConnected, authError, reconnectAttempts, sessionStatus, lastHealth, checkedAt, checking, sessionId, busyOverride])
}
