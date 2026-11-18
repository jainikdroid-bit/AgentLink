// Which mood the floating 3D Cheri shows: what the agent is doing wins, then the connection's state,
// and a short celebration right after a run finishes. Pure (no React).
import type { OverallStatus } from "./connection-health.ts"

export type AvatarMood = "idle" | "thinking" | "working" | "writing" | "loading" | "success" | "error" | "offline"

export function avatarMood(status: OverallStatus, activity: AvatarMood | null, celebrating: boolean): AvatarMood {
  if (status === "computer-unreachable" || status === "server-stopped" || status === "no-connection") return "offline"
  if (status === "auth-failed") return "error"
  if (activity) return activity
  if (status === "online-busy") return "working"
  if (celebrating) return "success"
  if (status === "reconnecting" || status === "checking") return "loading"
  return "idle"
}

/** Size presets of the floating window (width; height is 4/3 of it). */
export const AVATAR_SIZES = { s: 120, m: 160, l: 210 } as const
export type AvatarSize = keyof typeof AVATAR_SIZES
export const AVATAR_OPACITIES = [1, 0.75, 0.5] as const

/** Keeps the floating window on screen. */
export function clampPosition(x: number, y: number, w: number, h: number, screenW: number, screenH: number, margin = 4): { x: number; y: number } {
  return { x: Math.min(Math.max(margin, x), Math.max(margin, screenW - w - margin)), y: Math.min(Math.max(margin, y), Math.max(margin, screenH - h - margin)) }
}
