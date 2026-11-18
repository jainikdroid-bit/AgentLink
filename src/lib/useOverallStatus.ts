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
    return { info: describeStatus(input), links: chainLinks(input), checkedAt, checking }
  }, [activeConnection, sseConnected, authError, reconnectAttempts, sessionStatus, lastHealth, checkedAt, checking, sessionId, busyOverride])
}
