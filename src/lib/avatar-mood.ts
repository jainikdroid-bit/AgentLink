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
/** Full-body window widths; the height is AVATAR_ASPECT times the width. */
export const AVATAR_SIZES = { s: 64, m: 84, l: 112 } as const
export const AVATAR_ASPECT = 2.1
export type AvatarSize = keyof typeof AVATAR_SIZES
export const AVATAR_OPACITIES = [1, 0.75, 0.5] as const
export const AVATAR_MIN_WIDTH = 50
export const AVATAR_MAX_WIDTH = 200

/** Width after a pinch: the starting width times the finger spread, kept within limits. */
export function pinchWidth(start: number, scale: number): number {
  const w = Number.isFinite(scale) && scale > 0 ? start * scale : start
  return Math.round(Math.min(AVATAR_MAX_WIDTH, Math.max(AVATAR_MIN_WIDTH, w)))
}

/** Keeps the floating window on screen. */
export function clampPosition(x: number, y: number, w: number, h: number, screenW: number, screenH: number, margin = 4): { x: number; y: number } {
  return { x: Math.min(Math.max(margin, x), Math.max(margin, screenW - w - margin)), y: Math.min(Math.max(margin, y), Math.max(margin, screenH - h - margin)) }
}
