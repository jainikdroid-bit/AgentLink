import { useEffect } from "react"
import { AppState } from "react-native"
import { useConnections } from "../stores/connections"
import { useHealth } from "../stores/health"

const CHECK_EVERY_MS = 15_000

// Checks the server (and the launcher, when the server does not answer) every ~15 s while the app is in the
// front and a connection exists. Mounted once, in the root layout.
export function useConnectionHealth() {
  const connectionId = useConnections((s) => s.activeConnection?.id ?? null)
  useEffect(() => {
    useHealth.getState().reset()
    if (!connectionId) return
    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer) return
      void useHealth.getState().check()
      timer = setInterval(() => void useHealth.getState().check(), CHECK_EVERY_MS)
    }
    const stop = () => {
      if (timer) clearInterval(timer)
      timer = null
    }
    if (AppState.currentState === "active") start()
    const sub = AppState.addEventListener("change", (state) => (state === "active" ? start() : stop()))
    return () => {
      stop()
      sub.remove()
    }
  }, [connectionId])
}
