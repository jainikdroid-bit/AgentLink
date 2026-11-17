// Draws one frame of Cheri as an SVG string (120x120). Pure: no React, so the browser lab and
// the app (react-native-svg's SvgXml) render the exact same picture.
import type { Arm, BrowKind, EyeKind, Frame, Fx, HandShape, Mood, MouthKind, Pose } from "./types.ts"

export const PALETTE = {
  bg: "#FBEAF0",
  skin: "#F5C4B3",
  skinEdge: "#DFA08A",
  hair: "#ED93B1",
  headset: "#993556",
  top: "#993556",
  jacket: "#F4C0D1",
  jacketEdge: "#D4537E",
  line: "#4B1528",
  iris: "#378ADD",
  irisDark: "#185FA5",
  lips: "#D4537E",
  mouth: "#993556",
  tongue: "#ED93B1",
  blush: "#F4C0D1",
  blushStrong: "#ED93B1",
  nose: "#F0997B",
  choker: "#2C2C2A",
  cyan: "#22d3ee",
  magenta: "#e879f9",
  amber: "#EF9F27",
  gold: "#FAC775",
  green: "#1D9E75",
  red: "#E24B4A",
  grey: "#888780",
  greyLight: "#B4B2A9",
  tear: "#85B7EB",
  tearEdge: "#378ADD",
  purple: "#7F77DD",
} as const
const C = PALETTE

export const MOOD_LED: Record<Mood, string> = {
  idle: C.hair,
  thinking: C.amber,
  working: C.cyan,
  writing: C.cyan,
  loading: C.cyan,
  success: C.green,
  error: C.red,
  offline: C.grey,
}

/** Shoulders on the canvas, and how long each arm segment is. */
export const SHOULDER_L = { x: 37, y: 95 }
export const SHOULDER_R = { x: 83, y: 95 }
const SEGMENT = 20

// The head is drawn on the sketch grid and placed with this transform (scale 1.12 about (60,46), down 6).
const HEAD_SCALE = 1.12
const HEAD_DX = -7.2
const HEAD_DY = 0.48
const NECK = { x: 60, y: 80 }

const n = (v: number) => (Math.round(v * 10) / 10).toString()

function attrs(a: Record<string, string | number | undefined>) {
  let out = ""
  for (const [k, v] of Object.entries(a)) if (v !== undefined) out += ` ${k}="${typeof v === "number" ? n(v) : v}"`
  return out
}
const el = (tag: string, a: Record<string, string | number | undefined>, inner?: string) =>
  inner === undefined ? `<${tag}${attrs(a)}/>` : `<${tag}${attrs(a)}>${inner}</${tag}>`
const path = (d: string, a: Record<string, string | number | undefined> = {}) => el("path", { d, ...a })
const stroke = (color: string, width: number) => ({ stroke: color, "stroke-width": width, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" })

function heartPath(x: number, y: number, s: number) {
  return `M${n(x)} ${n(y + 3 * s)} C${n(x - 4.5 * s)} ${n(y)} ${n(x - 2.5 * s)} ${n(y - 3.2 * s)} ${n(x)} ${n(y - 1.2 * s)} C${n(x + 2.5 * s)} ${n(y - 3.2 * s)} ${n(x + 4.5 * s)} ${n(y)} ${n(x)} ${n(y + 3 * s)} Z`
}
function starPath(x: number, y: number, r: number) {
  const k = r * 0.3
  return `M${n(x)} ${n(y - r)} L${n(x + k)} ${n(y - k)} L${n(x + r)} ${n(y)} L${n(x + k)} ${n(y + k)} L${n(x)} ${n(y + r)} L${n(x - k)} ${n(y + k)} L${n(x - r)} ${n(y)} L${n(x - k)} ${n(y - k)} Z`
}

// ---------- face (head grid) ----------

function lash(x: number) {
  return path(`M${x - 5} 47.5 Q${x} 43.5 ${x + 5} 47.5 L${x + 7} 46`, stroke(C.line, 1.8))
}

function openEye(x: number, p: Pose) {
  if (p.blink > 0.55) return path(`M${x - 4.5} 50 Q${x} 52 ${x + 4.5} 50`, stroke(C.line, 1.8))
  const ry = Math.max(0.5, 4.4 * (1 - p.blink))
  const cx = x + p.eyeX
  const cy = 50 + p.eyeY
  return (
    el("ellipse", { cx, cy, rx: 3.4, ry, fill: C.iris }) +
    el("ellipse", { cx, cy: cy + 1.2, rx: 2, ry: ry * 0.45, fill: C.irisDark, opacity: 0.55 }) +
    (p.blink < 0.3 ? el("circle", { cx: cx + 1.2, cy: cy - 1.6, r: 1.3, fill: "#fff" }) + el("circle", { cx: cx - 1, cy: cy + 1.6, r: 0.6, fill: "#fff" }) : "") +
    lash(x)
  )
}

function eyes(kind: EyeKind, p: Pose): string {
  const s = stroke(C.line, 2)
  switch (kind) {
    case "happy":
      return path("M47 50.5 Q51 45.5 55 50.5M65 50.5 Q69 45.5 73 50.5", s)
    case "wink":
      return openEye(51, p) + path("M64 49.5 Q69 53.5 74 49.5 L76 48", s)
    case "closed":
      return path("M46.5 49.5 Q51 52 55.5 49.5M64.5 49.5 Q69 52 73.5 49.5", s)
    case "squeeze":
      return path("M47 46.5 L54 49.5 L47 52.5M73 46.5 L66 49.5 L73 52.5", { ...s, "stroke-width": 2.2 })
    case "spiral":
      return path("M51 50 m-1.2 0 a1.2 1.2 0 1 1 2.4 0 a2.4 2.4 0 1 1 -4.8 0 a3.6 3.6 0 1 1 7.2 0M69 50 m-1.2 0 a1.2 1.2 0 1 1 2.4 0 a2.4 2.4 0 1 1 -4.8 0 a3.6 3.6 0 1 1 7.2 0", stroke(C.line, 1.2))
    case "smug":
    case "side": {
      const dx = kind === "side" ? 2 + p.eyeX : p.eyeX
      return (
        el("ellipse", { cx: 51 + dx, cy: 51, rx: 3.2, ry: 2.6, fill: C.iris }) +
        el("ellipse", { cx: 69 + dx, cy: 51, rx: 3.2, ry: 2.6, fill: C.iris }) +
        el("circle", { cx: 52 + dx, cy: 50.4, r: 0.8, fill: "#fff" }) +
        el("circle", { cx: 70 + dx, cy: 50.4, r: 0.8, fill: "#fff" }) +
        path("M45.5 48.6 Q51 47.6 56.5 48.8M63.5 48.8 Q69 47.6 74.5 48.6", { ...s, "stroke-width": 2.3 })
      )
    }
    case "sleepy":
      return (
        el("ellipse", { cx: 51, cy: 51.5, rx: 3.2, ry: 2.2, fill: C.iris }) +
        el("ellipse", { cx: 69, cy: 51.5, rx: 3.2, ry: 2.2, fill: C.iris }) +
        path("M46 49.5 Q51 48.5 56 49.5M64 49.5 Q69 48.5 74 49.5", s)
      )
    case "star":
      return [51, 69]
        .map((x) => el("ellipse", { cx: x, cy: 50, rx: 3.6, ry: 4.6, fill: C.iris }) + path(starPath(x, 50, 3.4), { fill: "#fff" }) + lash(x))
        .join("")
    case "heart":
      return path(heartPath(51, 49.5, 1.25), { fill: C.red }) + path(heartPath(69, 49.5, 1.25), { fill: C.red })
    case "teary":
      return [51, 69]
        .map(
          (x) =>
            el("ellipse", { cx: x + p.eyeX, cy: 50.5, rx: 4, ry: 5, fill: C.iris }) +
            el("circle", { cx: x + 1.4 + p.eyeX, cy: 48.5, r: 1.7, fill: "#fff" }) +
            el("circle", { cx: x - 1.4 + p.eyeX, cy: 52.5, r: 1, fill: "#fff" }) +
            path(`M${x - 4} 54.5 Q${x} 56.5 ${x + 4} 54.5`, stroke(C.tear, 1.4)) +
            lash(x),
        )
        .join("")
    case "wide":
      return [51, 69]
        .map((x) => el("ellipse", { cx: x, cy: 50, rx: 4, ry: 4.8, fill: "#fff", stroke: C.line, "stroke-width": 1.2 }) + el("circle", { cx: x + p.eyeX, cy: 50 + p.eyeY, r: 1.5, fill: C.line }))
        .join("")
    case "dot":
      return el("circle", { cx: 51, cy: 50, r: 1.5, fill: C.line }) + el("circle", { cx: 69, cy: 50, r: 1.5, fill: C.line })
    case "uwu":
      return path("M47 48.5 Q51 52.5 55 48.5M65 48.5 Q69 52.5 73 48.5", s)
    default:
      return openEye(51, p) + openEye(69, p)
  }
}

const BROWS: Record<BrowKind, string> = {
  normal: "M46.5 42.5 Q50.5 39.5 55 41M65 41 Q69.5 39.5 73.5 42.5",
  raised: "M46.5 42.5 Q50.5 39.5 55 41M65 39.5 Q69.5 37 73.5 40",
  worried: "M47 41.5 Q51 41.5 55 39M65 39 Q69 41.5 73 41.5",
  angry: "M47 40 Q51 40.5 55.5 43M64.5 43 Q69 40.5 73 40",
  smug: "M46.5 43 Q50.5 41.6 55 42.6M65 40 Q69.5 37.5 73.5 40",
  high: "M46.5 39 Q50.5 36 55 37.5M65 37.5 Q69.5 36 73.5 39",
  focused: "M46.5 41.6 L55 42.8M65 42.8 L73.5 41.6",
}

function mouth(kind: MouthKind, p: Pose): string {
  const line = stroke(C.lips, 1.8)
  switch (kind) {
    case "grin":
      return path("M55 60 Q60 66.5 65 60 Z", { fill: C.lips })
    case "laugh": {
      const o = 0.6 + p.mouthOpen * 0.4
      return path(`M54 59.5 Q60 ${n(59.5 + 10 * o)} 66 59.5 Z`, { fill: C.mouth }) + el("ellipse", { cx: 60, cy: 59.5 + 6.4 * o, rx: 3, ry: 1.6 * o, fill: C.tongue })
    }
    case "yawn":
      return el("ellipse", { cx: 60, cy: 62.5, rx: 2.4 + p.mouthOpen * 1.2, ry: 1 + p.mouthOpen * 4, fill: C.mouth })
    case "cat":
      return path("M55.5 61 Q57.75 63.8 60 61 Q62.25 63.8 64.5 61", line)
    case "o":
      return el("ellipse", { cx: 60, cy: 62, rx: 2, ry: 2.6, fill: C.mouth })
    case "small":
      return el("ellipse", { cx: 61, cy: 62, rx: 1.2, ry: 1.5, fill: C.mouth })
    case "pout":
      return path("M57.5 63 Q60 60.6 62.5 63", { ...line, "stroke-width": 2.2 })
    case "wavy":
      return path("M55.5 62 Q57.5 60.5 59.5 62 Q61.5 63.5 63.5 62 Q64.5 61.2 65 61", line)
    case "frown":
      return path("M56 63.5 Q60 59.8 64 63.5", line)
    case "flat":
      return path("M57 62 L63 62", { ...line, stroke: C.mouth, "stroke-width": 1.6 })
    case "smirk":
      return path("M56 62 Q60 63.2 64.5 60.4", line)
    case "w":
      return path("M55.5 61 Q57.75 63.6 60 61.2 Q62.25 63.6 64.5 61", line)
    case "nervous":
      return path("M55 60.5 L65 60.5 Q64 64.2 60 64.2 Q56 64.2 55 60.5 Z", { fill: "#fff", stroke: C.lips, "stroke-width": 1.2 }) + path("M55.6 62.3 L64.4 62.3", stroke(C.greyLight, 0.6))
    case "blep":
      return path("M56 61 Q60 63 64 61", line) + path("M58.8 62 Q58.8 66.4 60.8 66.4 Q62.8 66.4 62.8 62 Z", { fill: C.tongue, stroke: C.lips, "stroke-width": 0.6 })
    case "cry":
      return path("M54.5 63.8 Q57 59.5 60 61.6 Q63 59.5 65.5 63.8 Q60 66.2 54.5 63.8 Z", { fill: C.mouth })
    case "gulp":
      return path("M57 62 Q60 63.2 63 62", line) + el("ellipse", { cx: 44.2, cy: 58, rx: 2.6, ry: 4, fill: C.skin }) + el("ellipse", { cx: 75.8, cy: 58, rx: 2.6, ry: 4, fill: C.skin })
    default:
      return path("M55.5 61 Q60 58.8 64.5 61 Q60 65 55.5 61 Z", { fill: C.lips }) + el("ellipse", { cx: 61.5, cy: 62.4, rx: 1.5, ry: 0.7, fill: "#fff", opacity: 0.8 })
  }
}

function blush(level: number) {
  if (level <= 0.05) return ""
  const strong = level > 1.5
  const fill = strong ? C.blushStrong : C.blush
  const o = Math.min(1, level)
  let out = el("ellipse", { cx: 46.5, cy: 57, rx: strong ? 4 : 3.2, ry: strong ? 2 : 1.6, fill, opacity: o }) + el("ellipse", { cx: 73.5, cy: 57, rx: strong ? 4 : 3.2, ry: strong ? 2 : 1.6, fill, opacity: o })
  if (strong) out += path("M44.5 55.6 l-1.2 2.6M46.8 55.6 l-1.2 2.6M49 55.6 l-1.2 2.6M71 55.6 l1.2 2.6M73.2 55.6 l1.2 2.6M75.5 55.6 l1.2 2.6", stroke(C.lips, 0.7))
  return out
}

function ears(p: Pose, led: string) {
  const ear = (pts: string, inner: string, rot: number, ox: number) =>
    el("g", { transform: `rotate(${n(rot)} ${ox} 21)` }, el("polygon", { points: pts, fill: "#fff", stroke: C.headset, "stroke-width": 1.5 }) + el("polygon", { points: inner, fill: led }))
  return (
    path("M41 40 Q41 14 60 14 Q79 14 79 40", stroke(C.headset, 3)) +
    ear("43,24 44,5 56,17", "46,19 47,11 52,16", p.earL, 50) +
    ear("77,24 76,5 64,17", "74,19 73,11 68,16", -p.earR, 70)
  )
}

// ---------- arms ----------

/** Two-bone IK: elbow position for a hand at H, bending outward and down. */
export function elbow(shoulder: { x: number; y: number }, hand: { x: number; y: number }, left: boolean) {
  let dx = hand.x - shoulder.x
  let dy = hand.y - shoulder.y
  let d = Math.hypot(dx, dy)
  const max = SEGMENT * 2 - 0.5
  if (d > max) {
    dx *= max / d
    dy *= max / d
    d = max
  }
  if (d < 4) return { x: shoulder.x + (left ? -SEGMENT : SEGMENT) * 0.7, y: shoulder.y + SEGMENT * 0.7, hand: { x: shoulder.x + dx, y: shoulder.y + dy } }
  const h = Math.sqrt(Math.max(0, SEGMENT * SEGMENT - (d / 2) * (d / 2)))
  const mx = shoulder.x + dx / 2
  const my = shoulder.y + dy / 2
  const nx = -dy / d
  const ny = dx / d
  const a = { x: mx + nx * h, y: my + ny * h }
  const b = { x: mx - nx * h, y: my - ny * h }
  const score = (e: { x: number; y: number }) => (left ? -e.x : e.x) + 0.6 * e.y
  const e = score(a) >= score(b) ? a : b
  return { x: e.x, y: e.y, hand: { x: shoulder.x + dx, y: shoulder.y + dy } }
}

function hand(shape: HandShape) {
  const skin = { fill: C.skin, stroke: C.skinEdge, "stroke-width": 0.8 }
  const finger = (cx: number, cy: number, rx: number, ry: number, rot = 0) => el("ellipse", { cx, cy, rx, ry, transform: rot ? `rotate(${rot} ${cx} ${cy})` : undefined, ...skin })
  switch (shape) {
    case "open":
      return finger(-3.3, -4.4, 1.3, 2.7) + finger(-1.1, -5, 1.3, 2.9) + finger(1.1, -5, 1.3, 2.9) + finger(3.3, -4.4, 1.3, 2.6) + finger(-5, 1.6, 1.4, 2.4, -35) + el("ellipse", { cx: 0, cy: 0.8, rx: 4.6, ry: 4.8, ...skin })
    case "peace":
      return finger(-1.8, -5.6, 1.35, 4, -12) + finger(1.9, -5.6, 1.35, 4, 12) + el("circle", { cx: 0, cy: 1.4, r: 4.4, ...skin })
    case "thumb":
      return finger(0.4, -5.8, 1.7, 3.4) + el("circle", { cx: 0, cy: 1, r: 4.8, ...skin }) + path("M-3 0.2 L2.6 0.2M-3 2.4 L2.6 2.4", stroke(C.skinEdge, 0.6))
    case "point":
      return finger(1.2, -6.6, 1.4, 3.8) + el("circle", { cx: 0, cy: 1, r: 4.8, ...skin })
    case "paw":
      return (
        el("circle", { cx: 0, cy: 0, r: 5, ...skin }) +
        el("ellipse", { cx: 0, cy: 1.3, rx: 2.1, ry: 1.6, fill: C.tongue }) +
        el("circle", { cx: -2.5, cy: -2.2, r: 0.95, fill: C.tongue }) +
        el("circle", { cx: 0, cy: -3.1, r: 0.95, fill: C.tongue }) +
        el("circle", { cx: 2.5, cy: -2.2, r: 0.95, fill: C.tongue })
      )
    default:
      return el("circle", { cx: 0, cy: 0, r: 5, ...skin }) + el("ellipse", { cx: -3.6, cy: -1, rx: 1.8, ry: 2.5, ...skin })
  }
}

function arm(a: Arm, left: boolean) {
  const s = left ? SHOULDER_L : SHOULDER_R
  const e = elbow(s, a, left)
  const d = `M${n(s.x)} ${n(s.y)} L${n(e.x)} ${n(e.y)} L${n(e.hand.x)} ${n(e.hand.y)}`
  const flip = left ? 1 : -1
  return (
    path(d, stroke(C.jacketEdge, 8.6)) +
    path(d, stroke(C.jacket, 6.8)) +
    el("g", { transform: `translate(${n(e.hand.x)} ${n(e.hand.y)}) rotate(${n(a.rot)}) scale(${flip} 1)` }, hand(a.hand))
  )
}

// ---------- effects ----------

const HEAD_FX = new Set(["sweat", "tears", "snot", "splat", "lump", "anger"])

function confetti(p: number) {
  const colors = [C.red, C.amber, C.cyan, C.green, C.lips, C.purple]
  let out = ""
  for (let i = 0; i < 16; i++) {
    const x = 6 + ((i * 37) % 108)
    const y = -12 + ((i * 13) % 22) + p * (96 + (i % 3) * 10)
    const r = i * 40 + p * 360 * (i % 2 ? 1 : -1)
    out += el("rect", { x: -1.8, y: -1.1, width: 3.6, height: i % 2 ? 2.2 : 4.4, rx: 0.6, fill: colors[i % colors.length], transform: `translate(${n(x)} ${n(y)}) rotate(${n(r)})` })
  }
  return out
}

function fxShape(f: Fx): string {
  const p = f.p
  switch (f.k) {
    case "sweat":
      return path("M0 -4.5 Q-3 0.5 0 2.2 Q3 0.5 0 -4.5 Z", { fill: C.tear, stroke: C.tearEdge, "stroke-width": 0.6 })
    case "anger":
      return path("M-4.5 -1.2 Q-1.2 -1.2 -1.2 -4.5M1.2 -4.5 Q1.2 -1.2 4.5 -1.2M4.5 1.2 Q1.2 1.2 1.2 4.5M-1.2 4.5 Q-1.2 1.2 -4.5 1.2", stroke(f.c ?? C.red, 1.7))
    case "sparkle":
      return path(starPath(0, 0, 4.2), { fill: f.c ?? C.gold })
    case "heart":
      return path(heartPath(0, 0, 1.6), { fill: f.c ?? C.red })
    case "tears": {
      const len = 4 + p * 16
      return path(`M-1.3 0 L1.3 0 L1.8 ${n(len)} Q0 ${n(len + 2.4)} -1.8 ${n(len)} Z`, { fill: C.tear, opacity: 0.85 })
    }
    case "snot":
      return el("circle", { cx: 0, cy: 0, r: 3, fill: "#B5D4F4", stroke: C.tear, "stroke-width": 0.6 }) + el("circle", { cx: -1, cy: -1, r: 0.7, fill: "#fff" })
    case "z":
      return el("text", { x: 0, y: 0, "font-size": 9, "font-weight": "bold", fill: f.c ?? C.purple, "text-anchor": "middle" }, f.text ?? "z")
    case "note":
      return el("text", { x: 0, y: 0, "font-size": 12, fill: f.c ?? C.headset, "text-anchor": "middle" }, f.text ?? "♪")
    case "bulb":
      return (
        path("M-9 -8 L-6 -5.5M9 -8 L6 -5.5M0 -13 L0 -10M-10.5 0 L-7.5 0M10.5 0 L7.5 0", stroke(C.amber, 1.4)) +
        el("circle", { cx: 0, cy: 0, r: 5.5, fill: C.gold, stroke: "#BA7517", "stroke-width": 1 }) +
        el("rect", { x: -2.6, y: 5, width: 5.2, height: 3.2, rx: 1, fill: C.grey })
      )
    case "question":
      return el("text", { x: 0, y: 0, "font-size": 15, "font-weight": "bold", fill: f.c ?? C.amber, "text-anchor": "middle" }, "?")
    case "exclaim":
      return el("text", { x: 0, y: 0, "font-size": 15, "font-weight": "bold", fill: f.c ?? C.red, "text-anchor": "middle" }, "!")
    case "bubble": {
      const text = f.text ?? "..."
      const w = Math.max(18, text.length * 5.6 + 9)
      return (
        el("rect", { x: -w / 2, y: -8, width: w, height: 15, rx: 7.5, fill: "#fff", stroke: C.jacketEdge, "stroke-width": 1.1 }) +
        path(`M${n(-w / 2 + 5)} 6 L${n(-w / 2 + 1.5)} 12 L${n(-w / 2 + 10)} 6.4`, { fill: "#fff", stroke: C.jacketEdge, "stroke-width": 1.1, "stroke-linejoin": "round" }) +
        el("rect", { x: -w / 2 + 4.6, y: 5, width: 6, height: 1.6, fill: "#fff" }) +
        el("text", { x: 0, y: 3, "font-size": 8.6, "font-weight": "bold", fill: C.headset, "text-anchor": "middle" }, escapeText(text))
      )
    }
    case "confetti":
      return confetti(p)
    case "cloud": {
      let rain = ""
      for (let i = 0; i < 3; i++) {
        const y = ((p * 5 + i * 0.33) % 1) * 9
        rain += path(`M${-6 + i * 6} ${n(6 + y)} l-1.4 4`, stroke(C.tearEdge, 1.3))
      }
      const bolt = p > 0.45 && p < 0.58 ? path("M2 3 L-2.5 10 L1.5 10 L-2 17", stroke(C.amber, 1.8)) : ""
      return rain + bolt + el("ellipse", { cx: -6, cy: 2, rx: 7, ry: 5, fill: C.grey }) + el("ellipse", { cx: 1, cy: -1.5, rx: 8, ry: 6, fill: C.greyLight }) + el("ellipse", { cx: 7.5, cy: 2, rx: 6, ry: 4.5, fill: C.grey })
    }
    case "cup":
      return (
        el("rect", { x: -6, y: -6, width: 12, height: 12, rx: 2.4, fill: "#fff", stroke: C.headset, "stroke-width": 1.3 }) +
        el("rect", { x: -4.6, y: -4.6, width: 9.2, height: 2, rx: 0.8, fill: "#854F0B" }) +
        path("M6 -3 Q11 0 6 3.5", stroke(C.headset, 1.3)) +
        path("M-3 1.5 Q-1.5 0 0 1.5 Q1.5 3 3 1.5", stroke(C.lips, 0.9))
      )
    case "steam": {
      const c = f.c ?? C.greyLight
      let out = ""
      for (let i = 0; i < 3; i++) {
        const y = -((p * 3 + i / 3) % 1) * 10
        out += path(`M${-4 + i * 4} ${n(y)} q-1.6 -2.4 0 -4.8 q1.6 -2.4 0 -4.8`, { ...stroke(c, 1.2), opacity: n(1 - ((p * 3 + i / 3) % 1)) })
      }
      return out
    }
    case "keyboard": {
      let keys = ""
      for (let r = 0; r < 2; r++) for (let k = 0; k < 7; k++) keys += el("rect", { x: -17 + k * 5 + r * 1.5, y: -2.6 + r * 3.4, width: 3.4, height: 2.2, rx: 0.6, fill: C.cyan, opacity: (k + r + Math.floor(p * 20)) % 5 === 0 ? 0.95 : 0.45 })
      return el("polygon", { points: "-24,5 24,5 19,-5 -19,-5", fill: C.cyan, "fill-opacity": 0.16, stroke: C.cyan, "stroke-width": 1 }) + keys
    }
    case "panel": {
      const w1 = 6 + ((p * 4) % 1) * 16
      return (
        el("rect", { x: -14, y: -10, width: 28, height: 20, rx: 3, fill: C.cyan, "fill-opacity": 0.16, stroke: C.cyan, "stroke-width": 1.1 }) +
        el("rect", { x: -10, y: -5, width: w1, height: 2.4, rx: 1.2, fill: C.cyan }) +
        el("rect", { x: -10, y: 1, width: 18, height: 2.4, rx: 1.2, fill: C.cyan, opacity: 0.6 })
      )
    }
    case "phone":
      return el("rect", { x: -4.5, y: -7.5, width: 9, height: 15, rx: 2, fill: C.choker }) + el("rect", { x: -3.3, y: -5.8, width: 6.6, height: 10.4, rx: 1, fill: C.cyan, opacity: 0.55 })
    case "wifi": {
      const arcs = path("M-8 -2 Q0 -10 8 -2M-5 1 Q0 -4 5 1M-2 4 Q0 2 2 4", stroke(f.c ?? C.greyLight, 1.6))
      return f.text === "x" ? arcs + path("M4 3 L10 9M10 3 L4 9", stroke(C.red, 1.8)) : arcs
    }
    case "cat":
      return el(
        "g",
        { opacity: 0.95 },
        el("ellipse", { cx: 0, cy: 4, rx: 7, ry: 6, fill: C.cyan, "fill-opacity": 0.18, stroke: C.cyan, "stroke-width": 1.1 }) +
          el("circle", { cx: 0, cy: -5, r: 5.2, fill: C.cyan, "fill-opacity": 0.18, stroke: C.cyan, "stroke-width": 1.1 }) +
          el("polygon", { points: "-4.6,-8 -3.6,-13 -0.8,-9.6", fill: C.cyan, "fill-opacity": 0.3, stroke: C.cyan, "stroke-width": 1 }) +
          el("polygon", { points: "4.6,-8 3.6,-13 0.8,-9.6", fill: C.cyan, "fill-opacity": 0.3, stroke: C.cyan, "stroke-width": 1 }) +
          path("M-3 -5 q1 -1.4 2 0M1 -5 q1 -1.4 2 0", stroke(C.cyan, 0.9)) +
          path(`M6 7 Q${n(13 + Math.sin(p * 12) * 2)} 4 ${n(10 + Math.sin(p * 12) * 3)} -3`, stroke(C.cyan, 1.4)),
      )
    case "gum":
      return el("circle", { cx: 0, cy: 0, r: 7, fill: C.jacket, stroke: C.jacketEdge, "stroke-width": 0.8, "fill-opacity": 0.92 }) + el("ellipse", { cx: -2.4, cy: -2.6, rx: 1.6, ry: 1, fill: "#fff", opacity: 0.8 })
    case "splat":
      return path("M-8 -2 Q-7 -7 -2 -5.5 Q1 -9 4.5 -5.5 Q9 -6 8 -1 Q10 3.5 5.5 4.5 Q2 8 -2 5.5 Q-8 6 -8 -2 Z", { fill: C.jacket, stroke: C.jacketEdge, "stroke-width": 0.7 })
    case "lump":
      return el("ellipse", { cx: 0, cy: 0, rx: 3.6, ry: 2.6, fill: C.skin, stroke: C.skinEdge, "stroke-width": 0.8 }) + el("ellipse", { cx: -1, cy: -0.9, rx: 1, ry: 0.6, fill: "#fff", opacity: 0.7 })
    case "stars": {
      let out = ""
      for (let i = 0; i < 3; i++) {
        const a = (p * 720 + i * 120) * (Math.PI / 180)
        out += path(starPath(Math.cos(a) * 16, Math.sin(a) * 5, 3.2), { fill: [C.amber, C.cyan, C.lips][i] })
      }
      return out
    }
    case "speed":
      return path("M-12 -6 L-2 -6M-16 0 L-4 0M-12 6 L-2 6", stroke(f.c ?? C.greyLight, 1.4))
    case "umbrella":
      return (
        path("M0 0 L0 15 Q0 18 -3 17", stroke(C.headset, 1.4)) +
        path("M-17 0 Q-17 -13 0 -13 Q17 -13 17 0 Q12.75 -3 8.5 0 Q4.25 -3 0 0 Q-4.25 -3 -8.5 0 Q-12.75 -3 -17 0 Z", { fill: C.purple, stroke: "#534AB7", "stroke-width": 1 })
      )
    case "magnifier":
      return path("M4.5 4.5 L11 11", stroke(C.choker, 2.4)) + el("circle", { cx: 0, cy: 0, r: 6.5, fill: "#B5D4F4", "fill-opacity": 0.35, stroke: C.choker, "stroke-width": 1.8 })
    case "ring":
      return el("circle", { cx: 0, cy: 0, r: 57, fill: "none", stroke: C.cyan, "stroke-width": 2, "stroke-dasharray": "20 70", "stroke-linecap": "round", transform: `rotate(${n(p * 360 * 3)})` })
    case "hoop": {
      const sx = Math.sin(p * Math.PI * 8) * 6
      return el("ellipse", { cx: sx, cy: 0, rx: 30, ry: 6, fill: "none", stroke: C.magenta, "stroke-width": 2.6 })
    }
    case "glitch":
      return (
        el("rect", { x: -32, y: -18, width: 64, height: 3, fill: C.cyan, opacity: p < 0.3 ? 0.8 : 0 }) +
        el("rect", { x: -26, y: -2, width: 52, height: 2.5, fill: C.magenta, opacity: p > 0.25 && p < 0.55 ? 0.8 : 0 }) +
        el("rect", { x: -30, y: 12, width: 60, height: 2, fill: C.cyan, opacity: p > 0.45 && p < 0.7 ? 0.7 : 0 })
      )
    case "gear":
      return el("g", { transform: `rotate(${n(p * 720)})` }, el("circle", { cx: 0, cy: 0, r: 8, fill: "none", stroke: C.amber, "stroke-width": 3, "stroke-dasharray": "4 3.5" }) + el("circle", { cx: 0, cy: 0, r: 2.6, fill: C.amber }))
    case "puff":
      return el("circle", { cx: 0, cy: 0, r: 3.4, fill: "#fff", stroke: C.greyLight, "stroke-width": 0.8 }) + el("circle", { cx: 5, cy: -2.6, r: 4.4, fill: "#fff", stroke: C.greyLight, "stroke-width": 0.8 }) + el("circle", { cx: 4, cy: 3.4, r: 2.8, fill: "#fff", stroke: C.greyLight, "stroke-width": 0.8 })
    default:
      return ""
  }
}

function escapeText(text: string) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function placeFx(f: Fx, head: boolean) {
  if (f.o <= 0.01) return ""
  const x = head ? (f.x - HEAD_DX) / HEAD_SCALE : f.x
  const y = head ? (f.y - HEAD_DY) / HEAD_SCALE : f.y
  const s = head ? f.s / HEAD_SCALE : f.s
  return el("g", { transform: `translate(${n(x)} ${n(y)}) rotate(${n(f.r)}) scale(${n(s)})`, opacity: f.o < 0.99 ? f.o : undefined }, fxShape(f))
}

// ---------- the whole frame ----------

export function renderFrame(frame: Frame, mood: Mood): string {
  const p = frame.pose
  const led = p.led ?? MOOD_LED[mood]
  const head = `translate(${n(p.headX)} 0) rotate(${n(p.tilt)} ${NECK.x} ${NECK.y}) translate(${HEAD_DX} ${HEAD_DY}) scale(${HEAD_SCALE})`
  const body = `rotate(${n(p.sway)} 60 120) translate(0 ${n(p.bob)}) translate(60 120) scale(1 ${n(p.squash)}) translate(-60 -120)`
  const headFx = frame.fx.filter((f) => HEAD_FX.has(f.k))
  const sceneFx = frame.fx.filter((f) => !HEAD_FX.has(f.k))
  const behind = sceneFx.filter((f) => f.k === "cat" || f.k === "ring").map((f) => placeFx(f, false)).join("")
  const front = sceneFx.filter((f) => f.k !== "cat" && f.k !== "ring").map((f) => placeFx(f, false)).join("")

  const face =
    path("M44 44 Q44 66 60 71 Q76 66 76 44 Q76 26 60 26 Q44 26 44 44 Z", { fill: C.skin }) +
    path(BROWS[p.brows], stroke(C.line, 1.4)) +
    eyes(p.eyes, p) +
    blush(p.blush) +
    path("M60 53.5 L59.2 56.5 L61 56.5", stroke(C.nose, 1)) +
    mouth(p.mouth, p) +
    headFx.map((f) => placeFx(f, true)).join("") +
    path("M42 50 Q40 22 60 22 Q80 22 78 50 Q74 30 60 28 Q46 30 42 50 Z", { fill: C.hair }) +
    ears(p, led)

  const torso =
    path("M27 124 Q27 100 49 94 L71 94 Q93 100 93 124 Z", { fill: C.skin }) +
    path("M45 124 L46 108 Q60 103 74 108 L75 124 Z", { fill: C.top }) +
    path("M19 124 Q21 108 35 104 L43 124 Z M101 124 Q99 108 85 104 L77 124 Z", { fill: C.jacket, stroke: C.jacketEdge, "stroke-width": 1.5 }) +
    el("rect", { x: 53.4, y: 72, width: 13.2, height: 24, fill: C.skin }) +
    el("rect", { x: 52.4, y: 83, width: 15.2, height: 4, rx: 2, fill: C.choker }) +
    el("circle", { cx: 60, cy: 85, r: 1.6, fill: led })

  const character =
    el("g", { transform: head }, path("M34 104 Q24 60 34 34 Q46 18 62 20 Q86 22 88 50 Q92 80 84 104 Z", { fill: C.hair })) +
    torso +
    el("g", { transform: head }, face) +
    arm(p.l, true) +
    arm(p.r, false)

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">` +
    el("circle", { cx: 60, cy: 60, r: 56, fill: C.bg }) +
    behind +
    el("g", { transform: body }, character) +
    front +
    `</svg>`
  )
}
