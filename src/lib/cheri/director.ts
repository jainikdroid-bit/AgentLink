// The director turns (mood, running scene, time) into a Frame, and decides which scene plays next.
// Pure and time-driven: the app ticks it ~15 times a second, the browser lab the same way.
import { ENTER_SCENES, MOOD_SCENES, REST_L, REST_R, SCENE_BY_ID, TAP_SCENES, TYPE_L, TYPE_R, type FxTrack, type Scene } from "./scenes.ts"
import type { Arm, Frame, Fx, Mood, Pose } from "./types.ts"

export const BASE_POSE: Pose = {
  bob: 0,
  sway: 0,
  squash: 1,
  tilt: 0,
  headX: 0,
  eyes: "open",
  eyeX: 0,
  eyeY: 0,
  blink: 0,
  brows: "normal",
  mouth: "smile",
  mouthOpen: 0,
  blush: 1,
  earL: 0,
  earR: 0,
  led: null,
  l: REST_L,
  r: REST_R,
}

const CHIN: Arm = { x: 65, y: 83, hand: "fist", rot: 0 }
const CLASP_L: Arm = { x: 54, y: 101, hand: "fist", rot: 0 }
const CLASP_R: Arm = { x: 66, y: 101, hand: "fist", rot: 0 }
const PEACE: Arm = { x: 88, y: 64, hand: "peace", rot: -12 }
const SHRUG_L: Arm = { x: 26, y: 102, hand: "open", rot: -50 }
const SHRUG_R: Arm = { x: 94, y: 102, hand: "open", rot: 50 }

/** How each mood looks when no scene is playing. */
export const MOOD_POSE: Record<Mood, Partial<Pose>> = {
  idle: {},
  thinking: { eyeX: 1.4, eyeY: -1.6, brows: "raised", mouth: "smirk", r: CHIN, tilt: 4 },
  working: { eyeY: 1.6, brows: "focused", l: TYPE_L, r: TYPE_R },
  writing: { eyeY: 1.6, brows: "normal", l: TYPE_L, r: TYPE_R },
  loading: { l: CLASP_L, r: CLASP_R, eyes: "open" },
  success: { eyes: "happy", mouth: "grin", r: PEACE, blush: 1.4 },
  error: { brows: "worried", mouth: "wavy", l: SHRUG_L, r: SHRUG_R, blush: 0.4 },
  offline: { eyes: "sleepy", mouth: "small", earL: -35, earR: -35, tilt: 7, bob: 1 },
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerpArm = (a: Arm, b: Arm, t: number): Arm => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), rot: lerp(a.rot, b.rot, t), hand: t < 0.5 ? a.hand : b.hand })

const NUMERIC = ["bob", "sway", "squash", "tilt", "headX", "eyeX", "eyeY", "blink", "mouthOpen", "blush", "earL", "earR"] as const

/** Blend two poses: numbers and arms ease, discrete parts switch at the midpoint. */
export function blendPose(a: Pose, b: Pose, t: number): Pose {
  const out: Pose = { ...(t < 0.5 ? a : b) }
  for (const k of NUMERIC) out[k] = lerp(a[k], b[k], t)
  out.l = lerpArm(a.l, b.l, t)
  out.r = lerpArm(a.r, b.r, t)
  return out
}

export function moodPose(mood: Mood): Pose {
  return { ...BASE_POSE, ...MOOD_POSE[mood] }
}

/** Sample a scene at time t (ms since start) on top of the mood's pose. */
export function sampleScene(scene: Scene, t: number, base: Pose): Pose {
  // Cumulative keys: each key's full pose is the previous one plus its changes.
  const frames: { t: number; pose: Pose }[] = [{ t: 0, pose: base }]
  for (const key of scene.keys) {
    const prev = frames[frames.length - 1].pose
    frames.push({ t: Math.max(key.t, frames[frames.length - 1].t), pose: { ...prev, ...key.pose } })
  }
  frames.push({ t: scene.ms, pose: base })
  if (t <= 0) return base
  if (t >= scene.ms) return base
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1]
    const b = frames[i]
    if (t <= b.t) {
      const span = b.t - a.t
      return span <= 0 ? b.pose : blendPose(a.pose, b.pose, ease((t - a.t) / span))
    }
  }
  return base
}

export function sampleFx(tracks: FxTrack[] | undefined, t: number): Fx[] {
  if (!tracks) return []
  const out: Fx[] = []
  for (const tr of tracks) {
    if (t < tr.t0 || t > tr.t1) continue
    const span = Math.max(1, tr.t1 - tr.t0)
    const p = (t - tr.t0) / span
    const fade = tr.fade ?? 140
    const o = fade <= 0 ? 1 : Math.min(1, (t - tr.t0) / fade, (tr.t1 - t) / fade)
    out.push({
      k: tr.k,
      x: lerp(tr.x, tr.x2 ?? tr.x, p),
      y: lerp(tr.y, tr.y2 ?? tr.y, p),
      s: lerp(tr.s ?? 1, tr.s2 ?? tr.s ?? 1, p),
      r: lerp(tr.r ?? 0, tr.r2 ?? tr.r ?? 0, p),
      o: Math.max(0, o),
      p,
      text: tr.text,
      c: tr.c,
    })
  }
  return out
}

/** Small always-on life: breathing, blinking, typing, the loading ring, sleepy z's. */
export function lifeFx(mood: Mood, now: number, pose: Pose, scenePlaying: boolean): { pose: Pose; fx: Fx[] } {
  const p = { ...pose }
  const fx: Fx[] = []
  p.bob += Math.sin(now / 700) * 0.6
  const cycle = now % 3400
  if (cycle < 130 && (p.eyes === "open" || p.eyes === "wink")) p.blink = Math.max(p.blink, 1 - Math.abs(cycle - 65) / 65)
  const fx1 = (k: Fx["k"], x: number, y: number, extra: Partial<Fx> = {}): Fx => ({ k, x, y, s: 1, o: 1, r: 0, p: 0, ...extra })
  if (scenePlaying) return { pose: p, fx }
  switch (mood) {
    case "working":
    case "writing": {
      const tap = Math.floor(now / 120) % 2
      p.l = { ...p.l, y: p.l.y - (tap ? 2.5 : 0) }
      p.r = { ...p.r, y: p.r.y - (tap ? 0 : 2.5) }
      fx.push(fx1("keyboard", 60, 105, { p: (now % 2000) / 2000 }))
      if (mood === "writing") fx.push(fx1("panel", 98, 66, { p: (now % 4000) / 4000 }))
      else fx.push(fx1("gear", 14, 26, { p: (now % 2200) / 2200, s: 0.8 }))
      break
    }
    case "thinking": {
      const dots = ".".repeat(1 + (Math.floor(now / 450) % 3))
      fx.push(fx1("bubble", 96, 30, { text: dots }))
      break
    }
    case "loading":
      fx.push(fx1("ring", 60, 60, { p: (now % 1600) / 1600 }))
      p.eyeX = Math.sin(now / 260) * 1.6
      break
    case "success":
      fx.push(fx1("sparkle", 98, 46, { s: 0.6 + 0.3 * Math.abs(Math.sin(now / 300)), r: (now / 10) % 90 }))
      fx.push(fx1("sparkle", 24, 40, { s: 0.5 + 0.2 * Math.abs(Math.sin(now / 380)), c: "#22d3ee" }))
      break
    case "error": {
      const q = (now % 1800) / 1800
      fx.push(fx1("sweat", 79, 44 + q * 8, { o: Math.min(1, (1 - q) * 3) }))
      break
    }
    case "offline": {
      const q = (now % 2400) / 2400
      fx.push(fx1("z", 86 + q * 8, 40 - q * 16, { s: 0.8 + q * 0.6, o: Math.min(1, (1 - q) * 3) }))
      fx.push(fx1("snot", 64, 64, { s: 0.6 + 0.7 * Math.abs(Math.sin(now / 900)) }))
      break
    }
    default:
      break
  }
  return { pose: p, fx }
}

export interface Playing {
  id: string
  start: number
}

/** The frame for this moment. */
export function frameAt(mood: Mood, playing: Playing | null, now: number): Frame {
  const base = moodPose(mood)
  const scene = playing ? SCENE_BY_ID[playing.id] : undefined
  const t = playing ? now - playing.start : 0
  const active = !!scene && t >= 0 && t < scene.ms
  const pose = active ? sampleScene(scene, t, base) : base
  const life = lifeFx(mood, now, pose, active)
  return { pose: life.pose, fx: [...life.fx, ...(active ? sampleFx(scene.fx, t) : [])] }
}

export function sceneLength(id: string): number {
  return SCENE_BY_ID[id]?.ms ?? 0
}

export function moodScenes(mood: Mood): readonly Scene[] {
  return MOOD_SCENES[mood]
}

/** A random scene for the mood that is not the one just played. */
export function pickScene(mood: Mood, rand: () => number, last?: string | null): string | null {
  const pool = MOOD_SCENES[mood]
  if (pool.length === 0) return null
  const choices = pool.length > 1 && last ? pool.filter((s) => s.id !== last) : pool
  return choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))].id
}

const DELAY: Record<Mood, readonly [number, number]> = {
  idle: [3500, 8000],
  thinking: [5000, 9000],
  working: [6000, 11000],
  writing: [6000, 11000],
  loading: [3000, 6000],
  success: [3000, 6000],
  error: [3500, 7000],
  offline: [4000, 8000],
}

export function nextDelayMs(mood: Mood, rand: () => number): number {
  const [min, max] = DELAY[mood]
  return Math.round(min + rand() * (max - min))
}

export function enterScene(previous: Mood, next: Mood): string | null {
  if (previous === next) return null
  if (next === "success") return ENTER_SCENES.success
  if (next === "error") return ENTER_SCENES.error
  return null
}

export const TAP_WINDOW_MS = 1800

/** The more you poke her, the less amused she gets. */
export function tapScene(taps: number): string {
  const order = ["tapGiggle", "tapShy", "tapHearts", "tapHearts", "tapPout", "tapStop", "tapDizzy", "tapDizzy", "tapIgnore"]
  return order[Math.min(order.length - 1, Math.max(0, taps - 1))]
}

export const PET_SCENE = "pet"
export const TAP_SCENE_IDS = TAP_SCENES.map((s) => s.id)
