import { create } from "zustand"
import { useConnections } from "./connections"
import { combineProbes, type HealthResult } from "../lib/connection-health"
import { classifyFailure, type FailureKind } from "../lib/failure-kind"
import { canStartFromPhone, type LauncherProbe } from "../lib/launcher"
import { probeLauncher } from "../lib/launcher-api"

// A short timeout: this runs every ~15 s, a slow answer already counts as "not healthy".
const HEALTH_TIMEOUT_MS = 6_000

interface HealthState {
  lastHealth: HealthResult | null
  /** When the last check finished (ms since epoch). */
  checkedAt: number | null
  checking: boolean
  check: () => Promise<void>
  reset: () => void
}

let inFlight: Promise<void> | null = null

export const useHealth = create<HealthState>((set) => ({
  lastHealth: null,
  checkedAt: null,
  checking: false,

  reset: () => set({ lastHealth: null, checkedAt: null, checking: false }),

  check: async () => {
    if (inFlight) return inFlight
    const { activeConnection, client, clientBase } = useConnections.getState()
    if (!activeConnection || !client) {
      set({ lastHealth: null, checkedAt: null, checking: false })
      return
    }
    const connectionId = activeConnection.id
    inFlight = (async () => {
      set({ checking: true })
      let server: FailureKind | null = null
      try {
        await client.global.health(HEALTH_TIMEOUT_MS)
      } catch (error) {
        server = classifyFailure(error)
      }
      // Only when the server did not answer is it worth asking the launcher: it tells a stopped server from an unreachable computer.
      let launcher: LauncherProbe | null = null
      if (server !== null && canStartFromPhone(activeConnection)) {
        launcher = await probeLauncher({
          serverUrl: activeConnection.url,
          launcherPort: activeConnection.launcherPort as number,
          auth: clientBase?.auth,
          tunnel: !!activeConnection.tunnelTopic,
        })
      }
      // The person may have switched computers while we were asking: that answer belongs to the old one.
      if (useConnections.getState().activeConnection?.id !== connectionId) {
        set({ checking: false })
        return
      }
      set({ lastHealth: combineProbes(server, launcher), checkedAt: Date.now(), checking: false })
    })().finally(() => {
      inFlight = null
    })
    return inFlight
  },
}))
