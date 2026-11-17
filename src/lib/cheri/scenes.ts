// Cheri's scenes: short keyframed skits. Each key is a partial pose merged onto the previous one;
// the director eases between keys and returns to the mood's pose at the end. Fx tracks fade in
// and out on their own. Coordinates are on the 120x120 canvas (eyes ~ (50,56) and (70,56),
// mouth ~ (60,69), top of the head ~ (60,24)).
import type { Arm, FxKind, HandShape, Pose } from "./types.ts"

export interface Key {
  t: number
  pose: Partial<Pose>
}

export interface FxTrack {
  k: FxKind
  t0: number
  t1: number
  x: number
  y: number
  /** End position/scale/rotation (default: same as start). */
  x2?: number
  y2?: number
  s?: number
  s2?: number
  r?: number
  r2?: number
  text?: string
  c?: string
  /** Fade time in ms at both ends (default 140). */
  fade?: number
}

export interface Scene {
  id: string
  ms: number
  keys: Key[]
  fx?: FxTrack[]
}

const A = (x: number, y: number, hand: HandShape = "fist", rot = 0): Arm => ({ x, y, hand, rot })

export const REST_L = A(29, 132)
export const REST_R = A(91, 132)
const CHEEK_L = A(43, 67, "open", 25)
const CHEEK_R = A(77, 67, "open", -25)
const CHIN = A(65, 83, "fist", 0)
const COVER_MOUTH = A(62, 73, "open", -20)
const FACEPALM = A(63, 57, "open", -10)
const PEACE = A(88, 64, "peace", -12)
const THUMB = A(95, 82, "thumb", 0)
const PAW_L = A(45, 80, "paw")
const PAW_R = A(75, 80, "paw")
const WAVE_A = A(99, 68, "open", -22)
const WAVE_B = A(101, 66, "open", 18)
const POINT_UP = A(93, 64, "point", -5)
const SHRUG_L = A(20, 98, "open", -70)
const SHRUG_R = A(100, 98, "open", 70)
const FIST_L = A(42, 75)
const FIST_R = A(78, 75)
export const TYPE_L = A(47, 104)
export const TYPE_R = A(73, 104)
const CUP = A(66, 81)
const PHONE_UP = A(98, 60)
const PHONE_LOOK = A(72, 93)
const RUB_L = A(51, 61)
const RUB_R = A(69, 61)
const HEART_L = A(55, 73, "open", 35)
const HEART_R = A(65, 73, "open", -35)
const CROSS_L = A(71, 104)
const CROSS_R = A(49, 104)
const STOP = A(89, 70, "open", -5)
const HIPS_L = A(33, 107)
const HIPS_R = A(87, 107)
const STRETCH_L = A(25, 60, "open", -20)
const STRETCH_R = A(95, 60, "open", 20)
const PET_A = A(97, 97, "open", -10)
const PET_B = A(101, 95, "open", 12)
const FAN_A = A(47, 75, "open", 35)
const FAN_B = A(50, 72, "open", -5)
const HOLD_R = A(90, 82)
const LENS = A(81, 68)

const steps = (from: number, every: number, poses: Partial<Pose>[]): Key[] => poses.map((pose, i) => ({ t: from + i * every, pose }))

// ---------------- idle ----------------

const idle: Scene[] = [
  {
    id: "wave",
    ms: 2300,
    keys: [
      { t: 250, pose: { r: WAVE_A, eyes: "happy", mouth: "grin", tilt: -4, blush: 1.2 } },
      ...steps(550, 300, [{ r: WAVE_B }, { r: WAVE_A }, { r: WAVE_B }, { r: WAVE_A }]),
      { t: 1950, pose: { r: REST_R, eyes: "open", mouth: "smile", tilt: 0 } },
    ],
    fx: [{ k: "bubble", t0: 300, t1: 1850, x: 95, y: 32, text: "hi~" }],
  },
  {
    id: "peaceWink",
    ms: 2000,
    keys: [
      { t: 250, pose: { r: PEACE, eyes: "wink", mouth: "grin", tilt: 7, headX: 1 } },
      { t: 1600, pose: { r: REST_R, eyes: "open", mouth: "smile", tilt: 0, headX: 0 } },
    ],
    fx: [
      { k: "sparkle", t0: 350, t1: 1400, x: 98, y: 50, s: 0.6, s2: 1.1, r: 0, r2: 90 },
      { k: "sparkle", t0: 500, t1: 1500, x: 80, y: 38, s: 0.5, s2: 0.8, c: "#22d3ee" },
    ],
  },
  {
    id: "kawaii",
    ms: 2600,
    keys: [
      { t: 250, pose: { l: CHEEK_L, r: CHEEK_R, eyes: "happy", mouth: "w", blush: 2 } },
      ...steps(550, 350, [{ tilt: -7, sway: -2 }, { tilt: 7, sway: 2 }, { tilt: -7, sway: -2 }, { tilt: 5, sway: 1 }]),
      { t: 2150, pose: { l: REST_L, r: REST_R, eyes: "open", mouth: "smile", blush: 1, tilt: 0, sway: 0 } },
    ],
    fx: [
      { k: "heart", t0: 500, t1: 1700, x: 60, y: 22, y2: 8, s: 0.8, c: "#ED93B1" },
      { k: "heart", t0: 900, t1: 2000, x: 30, y: 40, y2: 26, s: 0.6 },
      { k: "heart", t0: 1200, t1: 2200, x: 92, y: 40, y2: 26, s: 0.6, c: "#D4537E" },
    ],
  },
  {
    id: "nya",
    ms: 2200,
    keys: [
      { t: 200, pose: { l: PAW_L, r: PAW_R, eyes: "happy", mouth: "cat", blush: 1.6, earL: 10, earR: 10 } },
      ...steps(500, 260, [{ bob: -2, earL: -8 }, { bob: 0, earL: 10 }, { bob: -2, earR: -8 }, { bob: 0, earR: 10 }]),
      { t: 1800, pose: { l: REST_L, r: REST_R, eyes: "open", mouth: "smile", blush: 1, earL: 0, earR: 0 } },
    ],
    fx: [{ k: "bubble", t0: 300, t1: 1750, x: 96, y: 30, text: "nya~" }],
  },
  {
    id: "stretchYawn",
    ms: 3400,
    keys: [
      { t: 350, pose: { l: STRETCH_L, r: STRETCH_R, eyes: "closed", mouth: "yawn", mouthOpen: 0.2, squash: 1.04, bob: -2 } },
      { t: 1100, pose: { mouthOpen: 1, tilt: -4 } },
      { t: 1700, pose: { mouthOpen: 0.1, l: REST_L, r: RUB_R, squash: 1, bob: 0, tilt: 3 } },
      ...steps(1950, 220, [{ r: A(71, 59) }, { r: RUB_R }, { r: A(71, 59) }]),
      { t: 2700, pose: { r: REST_R, eyes: "sleepy", mouth: "smile", tilt: 0 } },
    ],
    fx: [
      { k: "tears", t0: 1100, t1: 1900, x: 74, y: 59, s: 0.5 },
      { k: "z", t0: 2400, t1: 3300, x: 88, y: 34, y2: 22, text: "~" },
    ],
  },
  {
    id: "coffeeBurn",
    ms: 4000,
    keys: [
      { t: 300, pose: { r: CUP, eyes: "happy", mouth: "small", blush: 1.3 } },
      { t: 900, pose: { tilt: -3 } },
      { t: 1250, pose: { eyes: "wide", mouth: "blep", brows: "high", earL: 18, earR: 18, bob: -3, r: HOLD_R } },
      ...steps(1450, 200, [{ l: FAN_A, bob: 0 }, { l: FAN_B }, { l: FAN_A }, { l: FAN_B }, { l: FAN_A }]),
      { t: 2550, pose: { eyes: "squeeze", mouth: "nervous", brows: "worried", blush: 2, l: REST_L, earL: 0, earR: 0 } },
      { t: 3300, pose: { r: REST_R, eyes: "open", mouth: "smile", brows: "normal", blush: 1 } },
    ],
    fx: [
      { k: "cup", t0: 250, t1: 1300, x: 72, y: 77 },
      { k: "cup", t0: 1300, t1: 3300, x: 96, y: 78 },
      { k: "steam", t0: 300, t1: 1250, x: 72, y: 70 },
      { k: "steam", t0: 1250, t1: 2500, x: 60, y: 66, c: "#E24B4A" },
      { k: "bubble", t0: 1300, t1: 2500, x: 94, y: 30, text: "hot!!" },
      { k: "sweat", t0: 2500, t1: 3300, x: 79, y: 44, y2: 52 },
    ],
  },
  {
    id: "gumPop",
    ms: 3600,
    keys: [
      { t: 200, pose: { mouth: "small", eyes: "open", eyeX: -1, eyeY: 1.2 } },
      { t: 1600, pose: { eyes: "wide", eyeX: 0, eyeY: 0, brows: "high", bob: -2, earL: 15, earR: 15 } },
      { t: 1800, pose: { eyes: "squeeze", mouth: "pout", brows: "worried", bob: 0, earL: -12, earR: -12, blush: 1.8 } },
      { t: 2900, pose: { eyes: "dot", mouth: "flat", brows: "normal", earL: 0, earR: 0 } },
    ],
    fx: [
      { k: "gum", t0: 250, t1: 1650, x: 61, y: 70, s: 0.15, s2: 1.15, fade: 60 },
      { k: "splat", t0: 1650, t1: 3400, x: 60, y: 66, s: 1.1, fade: 60 },
      { k: "puff", t0: 1600, t1: 2000, x: 74, y: 60, s: 0.8, s2: 1.2 },
    ],
  },
  {
    id: "sneezes",
    ms: 3600,
    keys: [
      { t: 200, pose: { eyes: "squeeze", mouth: "small", tilt: -6, brows: "worried" } },
      { t: 800, pose: { tilt: -9, bob: -1 } },
      { t: 950, pose: { eyes: "closed", mouth: "o", tilt: 8, headX: 2, bob: 1, earL: 25, earR: 25 } },
      { t: 1250, pose: { eyes: "squeeze", mouth: "small", tilt: -6, headX: 0, earL: 0, earR: 0 } },
      { t: 1700, pose: { tilt: -9 } },
      { t: 1850, pose: { eyes: "closed", mouth: "o", tilt: 9, headX: 3, bob: 2, earL: 30, earR: 30 } },
      { t: 2250, pose: { eyes: "happy", mouth: "nervous", tilt: 0, headX: 0, bob: 0, earL: 0, earR: 0, blush: 1.8, brows: "normal" } },
    ],
    fx: [
      { k: "exclaim", t0: 300, t1: 900, x: 92, y: 36 },
      { k: "puff", t0: 950, t1: 1500, x: 72, y: 70, x2: 86, y2: 72, s: 0.6, s2: 1.3 },
      { k: "puff", t0: 1850, t1: 2500, x: 74, y: 71, x2: 90, y2: 74, s: 0.8, s2: 1.6 },
      { k: "sparkle", t0: 2300, t1: 3300, x: 90, y: 40, s: 0.7 },
    ],
  },
  {
    id: "innocent",
    ms: 3800,
    keys: [
      { t: 200, pose: { eyes: "side", eyeX: -4, brows: "worried" } },
      { t: 800, pose: { eyeX: 0 } },
      { t: 1300, pose: { eyes: "side", eyeX: 0, brows: "normal" } },
      { t: 1700, pose: { eyes: "closed", mouth: "small", tilt: 5, l: A(40, 128), r: A(80, 128) } },
      ...steps(2000, 300, [{ tilt: -4 }, { tilt: 5 }, { tilt: -4 }]),
      { t: 3100, pose: { eyes: "open", mouth: "smile", tilt: 0, l: REST_L, r: REST_R } },
    ],
    fx: [
      { k: "sweat", t0: 300, t1: 1500, x: 79, y: 44, y2: 50 },
      { k: "note", t0: 1800, t1: 2800, x: 74, y: 72, x2: 88, y2: 58 },
      { k: "note", t0: 2200, t1: 3200, x: 76, y: 70, x2: 96, y2: 52, text: "♫", c: "#378ADD" },
    ],
  },
  {
    id: "holoCat",
    ms: 4200,
    keys: [
      { t: 400, pose: { eyes: "star", mouth: "grin", eyeX: 2, tilt: 5 } },
      { t: 900, pose: { r: PET_A, eyes: "happy", mouth: "cat", blush: 1.6 } },
      ...steps(1150, 260, [{ r: PET_B }, { r: PET_A }, { r: PET_B }, { r: PET_A }, { r: PET_B }, { r: PET_A }]),
      { t: 3000, pose: { r: REST_R, eyes: "uwu", mouth: "w", tilt: 0 } },
      { t: 3800, pose: { eyes: "open", mouth: "smile", blush: 1 } },
    ],
    fx: [
      { k: "cat", t0: 200, t1: 3800, x: 100, y: 96, s: 1.3, fade: 300 },
      { k: "heart", t0: 1500, t1: 2500, x: 104, y: 88, y2: 74, s: 0.5, c: "#22d3ee" },
      { k: "heart", t0: 2100, t1: 3100, x: 98, y: 86, y2: 70, s: 0.6, c: "#22d3ee" },
      { k: "note", t0: 2400, t1: 3400, x: 110, y: 92, y2: 80, text: "~", c: "#22d3ee" },
    ],
  },
  {
    id: "dance",
    ms: 3600,
    keys: [
      { t: 150, pose: { eyes: "happy", mouth: "grin", l: STRETCH_L, r: REST_R, sway: -6, bob: -2 } },
      ...steps(450, 300, [
        { l: REST_L, r: STRETCH_R, sway: 6, bob: 0, tilt: -5 },
        { l: STRETCH_L, r: REST_R, sway: -6, bob: -2, tilt: 5 },
        { l: REST_L, r: STRETCH_R, sway: 6, bob: 0, tilt: -5 },
        { l: STRETCH_L, r: REST_R, sway: -6, bob: -2, tilt: 5 },
        { l: PAW_L, r: PAW_R, sway: 0, bob: -3, tilt: 0, mouth: "cat" },
        { l: REST_L, r: STRETCH_R, sway: 6, bob: 0, tilt: -5, mouth: "grin" },
        { l: STRETCH_L, r: REST_R, sway: -6, bob: -2, tilt: 5 },
        { l: REST_L, r: REST_R, sway: 0, bob: 0, tilt: 0 },
      ]),
    ],
    fx: [
      { k: "note", t0: 300, t1: 1500, x: 98, y: 50, x2: 104, y2: 30 },
      { k: "note", t0: 1100, t1: 2300, x: 20, y: 50, x2: 14, y2: 30, text: "♫", c: "#378ADD" },
      { k: "note", t0: 2000, t1: 3200, x: 100, y: 46, x2: 108, y2: 26 },
    ],
  },
  {
    id: "dozeOff",
    ms: 4600,
    keys: [
      { t: 300, pose: { eyes: "sleepy" } },
      { t: 1100, pose: { eyes: "closed", tilt: 9, bob: 2, earL: -15, earR: -15 } },
      { t: 2400, pose: { tilt: 13, bob: 3, mouth: "small" } },
      { t: 2600, pose: { eyes: "wide", tilt: 0, bob: -3, brows: "high", earL: 25, earR: 25, mouth: "o" } },
      { t: 3000, pose: { eyes: "side", eyeX: 0, bob: 0, earL: 0, earR: 0, brows: "worried", mouth: "nervous", blush: 2 } },
      { t: 3900, pose: { eyes: "open", mouth: "smile", brows: "normal", blush: 1 } },
    ],
    fx: [
      { k: "z", t0: 1100, t1: 2500, x: 86, y: 40, x2: 94, y2: 24 },
      { k: "z", t0: 1500, t1: 2550, x: 92, y: 36, x2: 100, y2: 18, s: 1.3 },
      { k: "snot", t0: 1300, t1: 2600, x: 64, y: 64, s: 0.6, s2: 1.4, fade: 60 },
      { k: "exclaim", t0: 2600, t1: 3100, x: 92, y: 34, s: 1.2 },
      { k: "sweat", t0: 3000, t1: 3900, x: 79, y: 44, y2: 52 },
    ],
  },
  {
    id: "smug",
    ms: 2600,
    keys: [
      { t: 250, pose: { eyes: "smug", brows: "smug", mouth: "smirk", tilt: -6, l: HIPS_L, r: HIPS_R, bob: -1 } },
      { t: 2100, pose: { eyes: "open", brows: "normal", mouth: "smile", tilt: 0, l: REST_L, r: REST_R, bob: 0 } },
    ],
    fx: [
      { k: "sparkle", t0: 500, t1: 1500, x: 86, y: 30, s: 0.8, r: 0, r2: 45 },
      { k: "sparkle", t0: 900, t1: 1900, x: 30, y: 44, s: 0.6, c: "#22d3ee" },
    ],
  },
  {
    id: "phoneGiggle",
    ms: 3600,
    keys: [
      { t: 300, pose: { r: PHONE_LOOK, eyes: "open", eyeY: 2.2, eyeX: 1, tilt: 4 } },
      { t: 1300, pose: { eyes: "happy", mouth: "grin" } },
      { t: 1600, pose: { l: A(58, 74, "open", -15), blush: 1.8 } },
      ...steps(1800, 180, [{ bob: -1.5 }, { bob: 0 }, { bob: -1.5 }, { bob: 0 }]),
      { t: 2900, pose: { l: REST_L, r: REST_R, eyes: "open", eyeX: 0, eyeY: 0, mouth: "smile", tilt: 0, blush: 1 } },
    ],
    fx: [
      { k: "phone", t0: 250, t1: 2900, x: 73, y: 86 },
      { k: "note", t0: 1700, t1: 2700, x: 86, y: 52, y2: 40, text: "♪" },
    ],
  },
  {
    id: "heartHands",
    ms: 2600,
    keys: [
      { t: 250, pose: { l: HEART_L, r: HEART_R, eyes: "happy", mouth: "grin", blush: 1.8 } },
      { t: 2100, pose: { l: REST_L, r: REST_R, eyes: "open", mouth: "smile", blush: 1 } },
    ],
    fx: [
      { k: "heart", t0: 400, t1: 2000, x: 60, y: 26, y2: 12, s: 1, s2: 1.8 },
      { k: "sparkle", t0: 700, t1: 1700, x: 44, y: 18, s: 0.5 },
      { k: "sparkle", t0: 900, t1: 1900, x: 78, y: 16, s: 0.5, c: "#22d3ee" },
    ],
  },
  {
    id: "blep",
    ms: 1900,
    keys: [
      { t: 200, pose: { eyes: "wink", mouth: "blep", tilt: -6, r: PEACE } },
      { t: 1500, pose: { eyes: "open", mouth: "smile", tilt: 0, r: REST_R } },
    ],
    fx: [{ k: "sparkle", t0: 300, t1: 1300, x: 92, y: 44, s: 0.7 }],
  },
  {
    id: "glitch",
    ms: 1300,
    keys: [
      ...steps(0, 110, [{ headX: 3, eyes: "dot" }, { headX: -3 }, { headX: 2, led: "#e879f9" }, { headX: -2 }, { headX: 1, led: "#22d3ee" }, { headX: 0, led: null }]),
      { t: 900, pose: { eyes: "squeeze", mouth: "nervous" } },
    ],
    fx: [{ k: "glitch", t0: 0, t1: 800, x: 60, y: 60, fade: 20 }],
  },
]

// ---------------- thinking ----------------

const thinking: Scene[] = [
  {
    id: "idea",
    ms: 2600,
    keys: [
      { t: 400, pose: { eyes: "star", mouth: "grin", r: POINT_UP, brows: "high", earL: 15, earR: 15, bob: -2 } },
      { t: 2100, pose: { eyes: "open", mouth: "smirk", brows: "raised", earL: 0, earR: 0, bob: 0 } },
    ],
    fx: [{ k: "bulb", t0: 350, t1: 2000, x: 96, y: 34, s: 0.4, s2: 1.1 }],
  },
  {
    id: "magnify",
    ms: 3000,
    keys: [
      { t: 300, pose: { r: LENS, eyes: "open", eyeX: 1, tilt: 4, brows: "raised" } },
      ...steps(800, 400, [{ eyeX: -1.5, tilt: -2 }, { eyeX: 1.5, tilt: 4 }, { eyeX: 0 }]),
    ],
    fx: [{ k: "magnifier", t0: 250, t1: 2600, x: 73, y: 58 }],
  },
  {
    id: "puzzled",
    ms: 2600,
    keys: [
      { t: 250, pose: { l: CHEEK_L, tilt: 11, eyes: "dot", mouth: "wavy", brows: "worried" } },
      { t: 2100, pose: { l: REST_L, tilt: 0 } },
    ],
    fx: [
      { k: "question", t0: 300, t1: 1500, x: 92, y: 36, s: 0.8, s2: 1.1 },
      { k: "question", t0: 800, t1: 2000, x: 102, y: 26, s: 0.6, r: 20 },
    ],
  },
]

// ---------------- working / writing ----------------

const working: Scene[] = [
  {
    id: "frenzy",
    ms: 2600,
    keys: [
      { t: 150, pose: { eyes: "squeeze", brows: "focused", mouth: "nervous" } },
      ...steps(250, 110, Array.from({ length: 18 }, (_, i) => ({ l: A(47, i % 2 ? 101 : 106), r: A(73, i % 2 ? 106 : 101), bob: i % 2 ? -1 : 0 }))),
      { t: 2300, pose: { eyes: "open", mouth: "smile", brows: "focused" } },
    ],
    fx: [
      { k: "keyboard", t0: 0, t1: 2600, x: 60, y: 105, fade: 0 },
      { k: "speed", t0: 300, t1: 2200, x: 26, y: 100 },
      { k: "sweat", t0: 600, t1: 1800, x: 79, y: 42, y2: 52 },
      { k: "sweat", t0: 1100, t1: 2300, x: 42, y: 44, y2: 54 },
    ],
  },
  {
    id: "ganbaru",
    ms: 2400,
    keys: [
      { t: 200, pose: { l: FIST_L, r: FIST_R, eyes: "star", brows: "angry", mouth: "grin", squash: 0.96 } },
      ...steps(450, 220, [{ bob: -4, squash: 1.03 }, { bob: 0, squash: 0.97 }, { bob: -4, squash: 1.03 }, { bob: 0, squash: 1 }]),
      { t: 1900, pose: { l: TYPE_L, r: TYPE_R, eyes: "open", brows: "focused", mouth: "smile" } },
    ],
    fx: [
      { k: "bubble", t0: 300, t1: 1700, x: 96, y: 30, text: "go!" },
      { k: "sparkle", t0: 500, t1: 1500, x: 26, y: 40, s: 0.7 },
    ],
  },
  {
    id: "coffeeChug",
    ms: 3000,
    keys: [
      { t: 300, pose: { r: CUP, l: TYPE_L, eyes: "closed", mouth: "gulp", tilt: -6 } },
      ...steps(700, 260, [{ bob: -1 }, { bob: 0 }, { bob: -1 }, { bob: 0 }]),
      { t: 1900, pose: { r: TYPE_R, eyes: "star", mouth: "grin", tilt: 0, earL: 20, earR: 20 } },
      { t: 2600, pose: { eyes: "open", mouth: "smile", earL: 0, earR: 0 } },
    ],
    fx: [
      { k: "cup", t0: 250, t1: 1900, x: 72, y: 77 },
      { k: "sparkle", t0: 1900, t1: 2700, x: 88, y: 40, s: 0.8 },
      { k: "sparkle", t0: 2000, t1: 2800, x: 30, y: 42, s: 0.6, c: "#22d3ee" },
    ],
  },
]

// ---------------- loading ----------------

const loading: Scene[] = [
  {
    id: "hulaHoop",
    ms: 3200,
    keys: [
      { t: 200, pose: { eyes: "happy", mouth: "grin", l: STRETCH_L, r: STRETCH_R } },
      ...steps(450, 200, Array.from({ length: 12 }, (_, i) => ({ sway: i % 2 ? 5 : -5, bob: i % 2 ? 0 : -1 }))),
      { t: 2900, pose: { sway: 0, bob: 0, l: REST_L, r: REST_R } },
    ],
    fx: [{ k: "hoop", t0: 200, t1: 3000, x: 60, y: 104 }],
  },
  {
    id: "impatient",
    ms: 2600,
    keys: [
      { t: 200, pose: { eyes: "side", eyeX: -1, mouth: "flat", l: CROSS_L, r: CROSS_R } },
      ...steps(500, 180, Array.from({ length: 9 }, (_, i) => ({ bob: i % 2 ? 0 : -1.2 }))),
      { t: 2300, pose: { l: REST_L, r: REST_R, eyes: "open", mouth: "smile" } },
    ],
    fx: [{ k: "anger", t0: 900, t1: 2000, x: 82, y: 36, s: 0.7, c: "#EF9F27" }],
  },
]

// ---------------- success ----------------

const success: Scene[] = [
  {
    id: "victory",
    ms: 2600,
    keys: [
      { t: 150, pose: { squash: 0.9, bob: 2, eyes: "closed", mouth: "grin" } },
      { t: 380, pose: { squash: 1.06, bob: -10, l: FIST_L, r: A(95, 54, "fist"), eyes: "happy", mouth: "laugh", mouthOpen: 1, earL: 20, earR: 20 } },
      { t: 700, pose: { squash: 0.95, bob: 1 } },
      { t: 900, pose: { squash: 1, bob: 0, earL: 0, earR: 0 } },
      { t: 2200, pose: { l: REST_L, r: REST_R, mouth: "grin" } },
    ],
    fx: [
      { k: "confetti", t0: 300, t1: 2500, x: 0, y: 0, fade: 200 },
      { k: "bubble", t0: 450, t1: 2000, x: 24, y: 30, text: "yay!" },
    ],
  },
  {
    id: "thumbsUp",
    ms: 2200,
    keys: [
      { t: 250, pose: { r: THUMB, eyes: "wink", mouth: "grin", tilt: 5 } },
      { t: 1800, pose: { r: REST_R, eyes: "happy", tilt: 0 } },
    ],
    fx: [{ k: "sparkle", t0: 350, t1: 1500, x: 100, y: 70, s: 0.6, s2: 1.1, r2: 90 }],
  },
  {
    id: "proud",
    ms: 2400,
    keys: [
      { t: 250, pose: { l: HIPS_L, r: HIPS_R, eyes: "smug", brows: "smug", mouth: "smirk", bob: -2, squash: 1.03 } },
      { t: 2000, pose: { l: REST_L, r: REST_R, eyes: "happy", brows: "normal", mouth: "grin", bob: 0, squash: 1 } },
    ],
    fx: [{ k: "sparkle", t0: 400, t1: 1600, x: 90, y: 34, s: 0.9 }, { k: "sparkle", t0: 700, t1: 1800, x: 28, y: 46, s: 0.6, c: "#22d3ee" }],
  },
]

// ---------------- error ----------------

const error: Scene[] = [
  {
    id: "facepalm",
    ms: 2800,
    keys: [
      { t: 300, pose: { r: FACEPALM, eyes: "closed", mouth: "wavy", tilt: 6, bob: 1, earL: -20, earR: -20 } },
      { t: 2300, pose: { r: REST_R, eyes: "open", tilt: 0, bob: 0, earL: 0, earR: 0 } },
    ],
    fx: [{ k: "puff", t0: 900, t1: 1700, x: 74, y: 72, x2: 84, y2: 76, s: 0.6, s2: 1 }],
  },
  {
    id: "oops",
    ms: 2400,
    keys: [
      { t: 250, pose: { l: SHRUG_L, r: SHRUG_R, eyes: "squeeze", mouth: "blep", tilt: -6, brows: "worried" } },
      { t: 1900, pose: { l: REST_L, r: REST_R, eyes: "open", tilt: 0 } },
    ],
    fx: [
      { k: "bubble", t0: 300, t1: 1800, x: 96, y: 30, text: "oops" },
      { k: "sweat", t0: 400, t1: 1600, x: 79, y: 42, y2: 50 },
    ],
  },
  {
    id: "cry",
    ms: 3200,
    keys: [
      { t: 200, pose: { eyes: "teary", mouth: "wavy", brows: "worried", earL: -15, earR: -15 } },
      { t: 900, pose: { eyes: "squeeze", mouth: "cry", l: RUB_L, r: RUB_R } },
      ...steps(1100, 220, [{ l: A(49, 62), r: A(71, 62) }, { l: RUB_L, r: RUB_R }, { l: A(49, 62), r: A(71, 62) }, { l: RUB_L, r: RUB_R }]),
      { t: 2200, pose: { l: REST_L, r: REST_R, eyes: "teary", mouth: "pout" } },
    ],
    fx: [
      { k: "tears", t0: 800, t1: 2400, x: 47, y: 60 },
      { k: "tears", t0: 800, t1: 2400, x: 73, y: 60 },
    ],
  },
  {
    id: "umbrella",
    ms: 4000,
    keys: [
      { t: 300, pose: { eyes: "dot", mouth: "flat", eyeY: -2 } },
      { t: 1300, pose: { r: HOLD_R, eyes: "smug", brows: "smug", mouth: "smirk" } },
      { t: 3400, pose: { r: REST_R, eyes: "open", brows: "normal", mouth: "smile" } },
    ],
    fx: [
      { k: "cloud", t0: 0, t1: 3600, x: 60, y: 6, fade: 300 },
      { k: "umbrella", t0: 1200, t1: 3500, x: 91, y: 66, r: -12, fade: 200 },
    ],
  },
  {
    id: "bonk",
    ms: 2800,
    keys: [
      { t: 0, pose: { squash: 0.92, bob: 3, eyes: "squeeze", mouth: "o" } },
      { t: 250, pose: { squash: 1, bob: 0, eyes: "spiral", mouth: "wavy", tilt: -5 } },
      ...steps(500, 300, [{ tilt: 5 }, { tilt: -5 }, { tilt: 4 }, { tilt: -3 }]),
      { t: 2200, pose: { eyes: "open", tilt: 0, mouth: "nervous" } },
    ],
    fx: [
      { k: "lump", t0: 100, t1: 2600, x: 68, y: 28, s: 1.2 },
      { k: "stars", t0: 200, t1: 2200, x: 60, y: 18 },
    ],
  },
  {
    id: "stomp",
    ms: 2400,
    keys: [
      { t: 200, pose: { l: CROSS_L, r: CROSS_R, eyes: "squeeze", brows: "angry", mouth: "pout", blush: 1.8 } },
      ...steps(400, 200, [{ bob: -3 }, { bob: 1 }, { bob: -3 }, { bob: 1 }, { bob: 0 }]),
      { t: 2000, pose: { l: REST_L, r: REST_R, eyes: "open", brows: "worried", mouth: "pout" } },
    ],
    fx: [{ k: "anger", t0: 300, t1: 1900, x: 82, y: 34, s: 1, s2: 1.2 }],
  },
]

// ---------------- offline ----------------

const offline: Scene[] = [
  {
    id: "searchWifi",
    ms: 4400,
    keys: [
      { t: 300, pose: { r: PHONE_UP, eyes: "open", eyeX: 2, eyeY: -2, brows: "worried", earL: 0, earR: 0, tilt: 4 } },
      ...steps(800, 450, [{ r: A(92, 58), sway: -3, eyeX: 0 }, { r: PHONE_UP, sway: 3, eyeX: 2 }, { r: A(92, 58), sway: -3, eyeX: 0 }, { r: PHONE_UP, sway: 0, eyeX: 2 }]),
      { t: 2900, pose: { eyes: "teary", mouth: "wavy", r: REST_R, earL: -30, earR: -30, tilt: 8, eyeX: 0, eyeY: 0 } },
    ],
    fx: [
      { k: "phone", t0: 250, t1: 2900, x: 98, y: 52, x2: 98, y2: 52 },
      { k: "wifi", t0: 600, t1: 2800, x: 98, y: 38, text: "x" },
      { k: "sweat", t0: 1200, t1: 2400, x: 79, y: 44, y2: 52 },
    ],
  },
  {
    id: "rubEyes",
    ms: 2600,
    keys: [
      { t: 200, pose: { l: RUB_L, r: RUB_R, eyes: "closed", mouth: "yawn", mouthOpen: 0.7 } },
      ...steps(500, 220, [{ l: A(49, 62), r: A(71, 62), mouthOpen: 1 }, { l: RUB_L, r: RUB_R }, { l: A(49, 62), r: A(71, 62), mouthOpen: 0.3 }]),
      { t: 1600, pose: { l: REST_L, r: REST_R, eyes: "sleepy", mouth: "small", mouthOpen: 0 } },
    ],
    fx: [{ k: "z", t0: 1500, t1: 2500, x: 88, y: 36, y2: 22, text: "~" }],
  },
  {
    id: "hello",
    ms: 2800,
    keys: [
      { t: 200, pose: { eyes: "open", eyeX: -3, earL: 10, earR: 10, brows: "worried" } },
      { t: 900, pose: { eyeX: 3 } },
      { t: 1500, pose: { eyeX: 0, eyes: "teary", mouth: "pout" } },
    ],
    fx: [{ k: "bubble", t0: 300, t1: 2200, x: 96, y: 30, text: "...?" }],
  },
]

// ---------------- taps ----------------

export const TAP_SCENES: Scene[] = [
  {
    id: "tapGiggle",
    ms: 1700,
    keys: [
      { t: 0, pose: { eyes: "wide", brows: "high", earL: 20, earR: 20, bob: -2 } },
      { t: 300, pose: { eyes: "happy", brows: "normal", mouth: "grin", l: COVER_MOUTH, blush: 1.6, earL: 0, earR: 0, bob: 0 } },
      ...steps(500, 160, [{ bob: -1.2, tilt: 3 }, { bob: 0, tilt: -3 }, { bob: -1.2, tilt: 3 }, { bob: 0, tilt: 0 }]),
    ],
    fx: [{ k: "exclaim", t0: 0, t1: 350, x: 90, y: 36 }, { k: "note", t0: 400, t1: 1500, x: 86, y: 48, y2: 36 }],
  },
  {
    id: "tapShy",
    ms: 2000,
    keys: [{ t: 200, pose: { l: CHEEK_L, r: CHEEK_R, eyes: "side", eyeX: -3, mouth: "w", blush: 2, tilt: -8 } }],
    fx: [{ k: "heart", t0: 300, t1: 1600, x: 90, y: 40, y2: 28, s: 0.7, c: "#ED93B1" }],
  },
  {
    id: "tapHearts",
    ms: 2200,
    keys: [{ t: 200, pose: { l: HEART_L, r: HEART_R, eyes: "heart", mouth: "grin", blush: 2 } }],
    fx: [
      { k: "heart", t0: 250, t1: 1800, x: 60, y: 26, y2: 10, s: 1.2, s2: 1.8 },
      { k: "heart", t0: 500, t1: 1900, x: 34, y: 40, y2: 26, s: 0.7, c: "#ED93B1" },
      { k: "heart", t0: 700, t1: 2000, x: 88, y: 40, y2: 24, s: 0.8, c: "#D4537E" },
    ],
  },
  {
    id: "tapPout",
    ms: 2200,
    keys: [
      { t: 150, pose: { l: CROSS_L, r: CROSS_R, eyes: "squeeze", brows: "angry", mouth: "pout", blush: 1.8, headX: -2, tilt: -8 } },
      { t: 1200, pose: { eyes: "side", eyeX: 3 } },
    ],
    fx: [{ k: "anger", t0: 200, t1: 1900, x: 82, y: 34, s: 1, s2: 1.25 }, { k: "bubble", t0: 300, t1: 1700, x: 24, y: 30, text: "hmph" }],
  },
  {
    id: "tapStop",
    ms: 2000,
    keys: [{ t: 120, pose: { r: STOP, eyes: "smug", brows: "angry", mouth: "flat", tilt: 4 } }],
    fx: [{ k: "bubble", t0: 200, t1: 1600, x: 24, y: 30, text: "stop!" }],
  },
  {
    id: "tapDizzy",
    ms: 2800,
    keys: [
      { t: 0, pose: { eyes: "spiral", mouth: "wavy", brows: "worried" } },
      ...steps(250, 260, [{ tilt: -7, sway: -3 }, { tilt: 7, sway: 3 }, { tilt: -6, sway: -2 }, { tilt: 6, sway: 2 }, { tilt: -3, sway: 0 }]),
    ],
    fx: [{ k: "stars", t0: 100, t1: 2600, x: 60, y: 16 }],
  },
  {
    id: "tapIgnore",
    ms: 2600,
    keys: [{ t: 150, pose: { headX: 4, tilt: 10, eyes: "closed", mouth: "pout", brows: "angry", l: CROSS_L, r: CROSS_R } }],
    fx: [{ k: "bubble", t0: 250, t1: 2200, x: 24, y: 30, text: "..." }, { k: "anger", t0: 400, t1: 2200, x: 84, y: 30, s: 0.8 }],
  },
  {
    id: "pet",
    ms: 2600,
    keys: [
      { t: 0, pose: { eyes: "uwu", mouth: "w", blush: 2, earL: -18, earR: -18, tilt: 6 } },
      ...steps(400, 300, [{ tilt: -4 }, { tilt: 6 }, { tilt: -4 }, { tilt: 4 }]),
    ],
    fx: [
      { k: "heart", t0: 200, t1: 1600, x: 60, y: 20, y2: 6, s: 1, c: "#ED93B1" },
      { k: "note", t0: 600, t1: 2000, x: 90, y: 44, y2: 30, text: "~" },
      { k: "heart", t0: 900, t1: 2300, x: 32, y: 40, y2: 26, s: 0.7 },
    ],
  },
]

/** Scenes that play by themselves, per mood. */
export const MOOD_SCENES = { idle, thinking, working, writing: working, loading, success, error, offline } as const

/** Scenes played the moment the mood changes to success or error. */
export const ENTER_SCENES = { success: "victory", error: "facepalm" } as const

export const ALL_SCENES: Scene[] = [...idle, ...thinking, ...working, ...loading, ...success, ...error, ...offline, ...TAP_SCENES]
export const SCENE_BY_ID: Record<string, Scene> = Object.fromEntries(ALL_SCENES.map((s) => [s.id, s]))
