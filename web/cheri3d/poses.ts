// Cheri 3D: bone poses (degrees, applied to three-vrm normalized humanoid bones) and per-mood/scene
// timelines. Pure data + math so it can be tuned in the browser lab and unit-tested.

export type Bone =
  | "hips"
  | "spine"
  | "chest"
  | "upperChest"
  | "neck"
  | "head"
  | "leftShoulder"
  | "rightShoulder"
  | "leftUpperArm"
  | "rightUpperArm"
  | "leftLowerArm"
  | "rightLowerArm"
  | "leftHand"
  | "rightHand"
  | "leftUpperLeg"
  | "rightUpperLeg"
  | "leftLowerLeg"
  | "rightLowerLeg"
  | "leftFoot"
  | "rightFoot"

/** Euler degrees [x, y, z] per bone. Missing bones stay at rest. */
export type BonePose = Partial<Record<Bone, [number, number, number]>>

export type Expression = "neutral" | "happy" | "angry" | "sad" | "relaxed" | "surprised"

export interface Pose {
  bones: BonePose
  /** 0..1 finger curl per hand (0 open, 1 fist). */
  curlL: number
  curlR: number
  /** Index and middle stay straight (peace sign) / only index (pointing). */
  shapeL?: "peace" | "point"
  shapeR?: "peace" | "point"
  face: Expression
  faceWeight: number
  /** Mouth open (aa) 0..1. */
  mouth: number
  /** Extra eyelid closing 0..1 (sleepy, wink handled by winkR). */
  lids: number
  winkR?: boolean
  /** Whole-body offset in metres (jump, bob). */
  lift: number
  /** Eye/head look target offset (-1..1). */
  lookX: number
  lookY: number
  /** Body turn in degrees (walking sideways); 0 = facing you. */
  turn: number
  /** Hand targets for arm IK (metres, relative to the head or chest bone; +x = her left, +y up, +z forward). */
  l: Target
  r: Target
}

export interface Target {
  x: number
  y: number
  z: number
  ref: "head" | "chest"
}

const T = (x: number, y: number, z: number, ref: Target["ref"] = "head"): Target => ({ x, y, z, ref })

export const REST: Pose = {
  bones: {},
  l: T(0.21, -0.4, 0.04, "chest"),
  r: T(-0.21, -0.4, 0.04, "chest"),
  curlL: 0.35,
  curlR: 0.35,
  face: "neutral",
  faceWeight: 0,
  mouth: 0,
  lids: 0,
  lift: 0,
  lookX: 0,
  lookY: 0,
  turn: 0,
}

// Hand placements for the IK (tuned in the lab). Left = the character's left (+x).
type Hands = { l?: Target; r?: Target; hand?: BonePose }
export const ARMS = {
  rest: {},
  typing: { l: T(0.12, -0.2, 0.22, "chest"), r: T(-0.12, -0.2, 0.22, "chest"), hand: { leftHand: [0, 0, 0], rightHand: [0, 0, 0] } },
  chinR: { r: T(-0.02, -0.12, 0.08), l: T(0.06, -0.06, 0.2, "chest") },
  waveR: { r: T(-0.24, -0.02, 0.1) },
  peaceR: { r: T(-0.12, -0.07, 0.13) },
  thumbR: { r: T(-0.17, 0.06, 0.26, "chest") },
  cheeks: { l: T(0.075, -0.06, 0.06), r: T(-0.075, -0.06, 0.06) },
  paws: { l: T(0.08, 0.1, 0.2, "chest"), r: T(-0.08, 0.1, 0.2, "chest") },
  facepalmR: { r: T(-0.02, 0.02, 0.1) },
  cupR: { r: T(-0.03, -0.1, 0.11) },
  crossed: { l: T(-0.07, -0.03, 0.14, "chest"), r: T(0.07, -0.05, 0.15, "chest") },
  cheer: { l: T(0.2, 0.12, 0.08), r: T(-0.2, 0.12, 0.08) },
  stretch: { l: T(0.12, 0.16, 0.04), r: T(-0.12, 0.16, 0.04) },
  clasp: { l: T(0.03, -0.16, 0.17, "chest"), r: T(-0.03, -0.16, 0.17, "chest") },
  phoneUpR: { r: T(-0.18, 0.06, 0.14) },
  rubEyes: { l: T(0.04, 0.02, 0.08), r: T(-0.04, 0.02, 0.08) },
  coverMouthR: { r: T(-0.01, -0.07, 0.1) },
  heartHands: { l: T(0.04, 0.08, 0.13), r: T(-0.04, 0.08, 0.13) },
  shrug: { l: T(0.3, -0.06, 0.12, "chest"), r: T(-0.3, -0.06, 0.12, "chest") },
} satisfies Record<string, Hands>

export type PropKind = "keyboard" | "bulb" | "cup" | "z" | "heart" | "sweat" | "confetti" | "cloud" | "question" | "exclaim" | "note" | "stars" | "panel" | "ring" | "phone" | "sparkle"

export interface PropCue {
  kind: PropKind
  /** ms window within the scene; omitted = whole scene. */
  from?: number
  to?: number
}

export interface Key {
  t: number
  pose: Partial<Pose>
}

export interface Scene {
  id: string
  ms: number
  keys: Key[]
  props?: PropCue[]
  /** Loops while the mood lasts (base activity) instead of playing once. */
  loop?: boolean
}

const k = (t: number, pose: Partial<Pose>): Key => ({ t, pose })
const arms = (a: Hands, extra: BonePose = {}): Partial<Pose> => ({ l: a.l ?? REST.l, r: a.r ?? REST.r, bones: { ...a.hand, ...extra } })

/** The looping base activity of each mood. */
export const BASE: Record<string, Scene> = {
  idle: {
    id: "idle",
    ms: 6000,
    loop: true,
    keys: [k(0, { ...arms(ARMS.rest), face: "relaxed", faceWeight: 0.3 }), k(3000, { ...arms(ARMS.rest, { head: [0, 8, 4] }), lookX: 0.3 }), k(6000, { ...arms(ARMS.rest) })],
  },
  thinking: {
    id: "thinking",
    ms: 4000,
    loop: true,
    keys: [
      k(0, { ...arms(ARMS.chinR, { head: [-8, -10, 8] }), lookX: 0.5, lookY: 0.6, mouth: 0, face: "neutral" }),
      k(2000, { ...arms(ARMS.chinR, { head: [-10, -14, 10] }), lookX: 0.7, lookY: 0.7 }),
      k(4000, { ...arms(ARMS.chinR, { head: [-8, -10, 8] }) }),
    ],
    props: [{ kind: "bulb" }],
  },
  working: {
    id: "working",
    ms: 600,
    loop: true,
    keys: [
      k(0, { ...arms(ARMS.typing, { head: [14, 0, 0], leftHand: [0, 0, 26], rightHand: [0, 0, -10] }), lookY: -0.6, curlL: 0.5, curlR: 0.5, face: "neutral" }),
      k(300, { ...arms(ARMS.typing, { head: [14, 0, 0], leftHand: [0, 0, 10], rightHand: [0, 0, -26] }) }),
      k(600, { ...arms(ARMS.typing, { head: [14, 0, 0], leftHand: [0, 0, 26], rightHand: [0, 0, -10] }) }),
    ],
    props: [{ kind: "keyboard" }],
  },
  writing: {
    id: "writing",
    ms: 700,
    loop: true,
    keys: [
      k(0, { ...arms(ARMS.typing, { head: [10, -12, 0], leftHand: [0, 0, 24], rightHand: [0, 0, -12] }), lookX: 0.5, lookY: -0.3 }),
      k(350, { ...arms(ARMS.typing, { head: [10, -12, 0], leftHand: [0, 0, 12], rightHand: [0, 0, -24] }) }),
      k(700, { ...arms(ARMS.typing, { head: [10, -12, 0], leftHand: [0, 0, 24], rightHand: [0, 0, -12] }) }),
    ],
    props: [{ kind: "keyboard" }, { kind: "panel" }],
  },
  loading: {
    id: "loading",
    ms: 2400,
    loop: true,
    keys: [k(0, { ...arms(ARMS.clasp, { spine: [0, 0, 4] }) }), k(1200, { ...arms(ARMS.clasp, { spine: [0, 0, -4] }) }), k(2400, { ...arms(ARMS.clasp, { spine: [0, 0, 4] }) })],
    props: [{ kind: "ring" }],
  },
  success: {
    id: "success",
    ms: 2000,
    loop: true,
    keys: [k(0, { ...arms(ARMS.peaceR, { head: [0, 0, -8] }), shapeR: "peace", curlR: 1, face: "happy", faceWeight: 1, winkR: true }), k(1000, { ...arms(ARMS.peaceR, { head: [0, 0, -12] }) }), k(2000, { ...arms(ARMS.peaceR, { head: [0, 0, -8] }) })],
    props: [{ kind: "sparkle" }],
  },
  error: {
    id: "error",
    ms: 3000,
    loop: true,
    keys: [k(0, { ...arms(ARMS.facepalmR, { head: [12, 0, 6] }), face: "sad", faceWeight: 0.9, curlR: 0 }), k(1500, { ...arms(ARMS.facepalmR, { head: [14, 4, 8] }) }), k(3000, { ...arms(ARMS.facepalmR, { head: [12, 0, 6] }) })],
    props: [{ kind: "cloud" }],
  },
  offline: {
    id: "offline",
    ms: 4000,
    loop: true,
    keys: [k(0, { ...arms(ARMS.rest, { head: [22, 0, 14], neck: [8, 0, 4] }), lids: 1, face: "relaxed", faceWeight: 0.6, mouth: 0.15 }), k(2000, { ...arms(ARMS.rest, { head: [26, 0, 16], neck: [10, 0, 5] }), mouth: 0.3 }), k(4000, { ...arms(ARMS.rest, { head: [22, 0, 14], neck: [8, 0, 4] }), mouth: 0.15 })],
    props: [{ kind: "z" }],
  },
}

// Legs (degrees on the normalized bones; -x swings a thigh forward, +x bends a knee back).
const STEP_A: BonePose = { leftUpperLeg: [-24, 0, 0], leftLowerLeg: [12, 0, 0], rightUpperLeg: [18, 0, 0], rightLowerLeg: [34, 0, 0], rightFoot: [-14, 0, 0] }
const STEP_B: BonePose = { rightUpperLeg: [-24, 0, 0], rightLowerLeg: [12, 0, 0], leftUpperLeg: [18, 0, 0], leftLowerLeg: [34, 0, 0], leftFoot: [-14, 0, 0] }
const SQUAT: BonePose = { hips: [8, 0, 0], spine: [18, 0, 0], leftUpperLeg: [-112, 0, -10], rightUpperLeg: [-112, 0, 10], leftLowerLeg: [140, 0, 0], rightLowerLeg: [140, 0, 0], leftFoot: [-30, 0, 0], rightFoot: [-30, 0, 0] }
const TUCK: BonePose = { leftUpperLeg: [-40, 0, 0], rightUpperLeg: [-40, 0, 0], leftLowerLeg: [80, 0, 0], rightLowerLeg: [80, 0, 0] }

/** Walking (looped while the app moves her window); `turn` is set by the runtime. */
export const WALK: Scene = {
  id: "walk",
  ms: 900,
  loop: true,
  keys: [
    k(0, { ...arms({ l: T(0.2, -0.38, 0.1, "chest"), r: T(-0.2, -0.38, -0.08, "chest") }, STEP_A), lift: 0, face: "happy", faceWeight: 0.5 }),
    k(225, { lift: 0.025 }),
    k(450, { ...arms({ l: T(0.2, -0.38, -0.08, "chest"), r: T(-0.2, -0.38, 0.1, "chest") }, STEP_B), lift: 0 }),
    k(675, { lift: 0.025 }),
    k(900, { ...arms({ l: T(0.2, -0.38, 0.1, "chest"), r: T(-0.2, -0.38, -0.08, "chest") }, STEP_A), lift: 0 }),
  ],
}

/** Short skits that interrupt the base activity now and then. */
export const SKITS: Record<string, Scene> = {
  squat: {
    id: "squat",
    ms: 6000,
    keys: [
      k(500, { ...arms({ l: T(0.12, -0.42, 0.24, "chest"), r: T(-0.12, -0.42, 0.24, "chest") }, SQUAT), lift: -0.36, lookY: -0.2 }),
      k(2200, { ...arms({ l: T(0.12, -0.42, 0.24, "chest"), r: T(-0.12, -0.42, 0.24, "chest") }, { ...SQUAT, head: [0, 25, 6] }), lookX: -0.8 }),
      k(3600, { ...arms({ l: T(0.12, -0.42, 0.24, "chest"), r: T(-0.12, -0.42, 0.24, "chest") }, { ...SQUAT, head: [0, -25, -6] }), lookX: 0.8, face: "happy", faceWeight: 0.6 }),
      k(5000, { ...arms({ l: T(0.12, -0.42, 0.24, "chest"), r: T(-0.12, -0.42, 0.24, "chest") }, SQUAT), lookX: 0 }),
    ],
    props: [{ kind: "note", from: 3000, to: 4800 }],
  },
  joyJump: {
    id: "joyJump",
    ms: 2400,
    keys: [
      k(150, { ...arms(ARMS.rest, { leftUpperLeg: [-20, 0, 0], rightUpperLeg: [-20, 0, 0], leftLowerLeg: [40, 0, 0], rightLowerLeg: [40, 0, 0] }), lift: -0.05 }),
      k(400, { ...arms(ARMS.cheer, TUCK), lift: 0.22, face: "happy", faceWeight: 1, mouth: 0.8, curlL: 1, curlR: 1 }),
      k(700, { ...arms(ARMS.cheer), lift: 0 }),
      k(950, { ...arms(ARMS.cheer, TUCK), lift: 0.2 }),
      k(1250, { ...arms(ARMS.cheer), lift: 0 }),
    ],
    props: [{ kind: "sparkle" }, { kind: "heart", from: 400, to: 2200 }],
  },
  wave: {
    id: "wave",
    ms: 2400,
    keys: [k(300, { ...arms(ARMS.waveR), curlR: 0, face: "happy", faceWeight: 1, mouth: 0.3 }), k(700, { ...arms({ r: T(-0.2, 0.03, 0.1) }) }), k(1100, { ...arms(ARMS.waveR) }), k(1500, { ...arms({ r: T(-0.2, 0.03, 0.1) }) }), k(1900, { ...arms(ARMS.waveR) })],
  },
  peace: {
    id: "peace",
    ms: 2200,
    keys: [k(300, { ...arms(ARMS.peaceR, { head: [0, 6, -10] }), shapeR: "peace", curlR: 1, winkR: true, face: "happy", faceWeight: 1 })],
    props: [{ kind: "sparkle", from: 300, to: 1900 }],
  },
  kawaii: {
    id: "kawaii",
    ms: 2600,
    keys: [k(300, { ...arms(ARMS.cheeks, { head: [0, 0, 10] }), curlL: 0, curlR: 0, face: "happy", faceWeight: 1 }), k(1100, { ...arms(ARMS.cheeks, { head: [0, 0, -10] }) }), k(1900, { ...arms(ARMS.cheeks, { head: [0, 0, 10] }) })],
    props: [{ kind: "heart", from: 400, to: 2300 }],
  },
  nya: {
    id: "nya",
    ms: 2200,
    keys: [k(250, { ...arms(ARMS.paws, { head: [0, 0, 8] }), curlL: 0.8, curlR: 0.8, face: "happy", faceWeight: 1, mouth: 0.4 }), k(900, { lift: 0.03 }), k(1300, { lift: 0 })],
    props: [{ kind: "note", from: 300, to: 1900 }],
  },
  stretch: {
    id: "stretch",
    ms: 3000,
    keys: [k(400, { ...arms(ARMS.stretch, { spine: [-8, 0, 0], head: [-10, 0, 0] }), curlL: 0, curlR: 0, lids: 1, mouth: 1, face: "relaxed", faceWeight: 1, lift: 0.02 }), k(1800, { ...arms(ARMS.stretch, { spine: [-10, 0, 0] }), mouth: 0.3 })],
  },
  coffee: {
    id: "coffee",
    ms: 3800,
    keys: [
      k(400, { ...arms(ARMS.cupR, { head: [-6, 0, 0] }), curlR: 0.9, lids: 0.6, face: "relaxed", faceWeight: 1 }),
      k(1400, { ...arms(ARMS.cupR, { head: [-2, 0, 0] }), face: "surprised", faceWeight: 1, mouth: 0.7, lids: 0, lift: 0.02 }),
      k(1700, { lift: 0 }),
      k(2600, { face: "happy", faceWeight: 0.7, mouth: 0.2 }),
    ],
    props: [{ kind: "cup", from: 300, to: 3400 }, { kind: "exclaim", from: 1400, to: 2200 }, { kind: "sweat", from: 2200, to: 3400 }],
  },
  lookAround: {
    id: "lookAround",
    ms: 3000,
    keys: [k(300, { lookX: -0.9, ...arms(ARMS.rest, { head: [0, 25, 0] }) }), k(1300, { lookX: 0.9, ...arms(ARMS.rest, { head: [0, -25, 0] }) }), k(2300, { lookX: 0, ...arms(ARMS.rest) })],
    props: [{ kind: "question", from: 500, to: 2600 }],
  },
  heartHands: {
    id: "heartHands",
    ms: 2400,
    keys: [k(300, { ...arms(ARMS.heartHands), curlL: 0.5, curlR: 0.5, face: "happy", faceWeight: 1 })],
    props: [{ kind: "heart", from: 300, to: 2200 }],
  },
  idea: {
    id: "idea",
    ms: 2200,
    keys: [k(300, { ...arms(ARMS.peaceR), shapeR: "point", curlR: 1, face: "surprised", faceWeight: 1, mouth: 0.4, lift: 0.02 }), k(700, { lift: 0, face: "happy" })],
    props: [{ kind: "bulb" }, { kind: "exclaim", from: 300, to: 1200 }],
  },
  coffeeChug: {
    id: "coffeeChug",
    ms: 3000,
    keys: [k(300, { ...arms(ARMS.cupR, { head: [-14, 0, 0] }), curlR: 0.9, lids: 1, face: "relaxed", faceWeight: 1 }), k(2200, { ...arms(ARMS.typing), lids: 0, face: "happy", faceWeight: 1 })],
    props: [{ kind: "cup", from: 200, to: 2200 }, { kind: "sparkle", from: 2200, to: 3000 }],
  },
  sweatTyping: {
    id: "sweatTyping",
    ms: 2400,
    keys: [k(0, { ...arms(ARMS.typing, { head: [14, 0, 0] }), face: "surprised", faceWeight: 0.6, lookY: -0.6 })],
    props: [{ kind: "keyboard" }, { kind: "sweat" }],
  },
  victory: {
    id: "victory",
    ms: 2600,
    keys: [k(150, { lift: -0.02, ...arms(ARMS.rest, { spine: [8, 0, 0] }) }), k(450, { lift: 0.22, ...arms(ARMS.cheer, TUCK), curlL: 1, curlR: 1, face: "happy", faceWeight: 1, mouth: 0.8 }), k(800, { lift: 0 }), k(2000, { ...arms(ARMS.cheer) })],
    props: [{ kind: "confetti" }],
  },
  thumbsUp: {
    id: "thumbsUp",
    ms: 2200,
    keys: [k(300, { ...arms(ARMS.thumbR, { head: [0, 0, -8] }), curlR: 1, winkR: true, face: "happy", faceWeight: 1 })],
    props: [{ kind: "sparkle", from: 300, to: 1900 }],
  },
  cry: {
    id: "cry",
    ms: 3000,
    keys: [k(300, { ...arms(ARMS.rubEyes, { head: [10, 0, 0] }), face: "sad", faceWeight: 1, curlL: 0.8, curlR: 0.8 }), k(1000, { ...arms(ARMS.rubEyes, { head: [12, 6, 4] }) }), k(1700, { ...arms(ARMS.rubEyes, { head: [10, -6, -4] }) })],
  },
  shrug: {
    id: "shrug",
    ms: 2200,
    keys: [k(300, { ...arms(ARMS.shrug, { head: [0, 0, 10] }), curlL: 0, curlR: 0, face: "sad", faceWeight: 0.6, mouth: 0.2 })],
    props: [{ kind: "sweat", from: 300, to: 2000 }],
  },
  searchWifi: {
    id: "searchWifi",
    ms: 3600,
    keys: [k(300, { ...arms(ARMS.phoneUpR, { head: [-14, -10, 0] }), lookX: 0.4, lookY: 0.8, curlR: 0.9 }), k(1300, { ...arms(ARMS.phoneUpR, { head: [-14, 10, 0], spine: [0, 0, 6] }) }), k(2300, { ...arms(ARMS.phoneUpR, { head: [-14, -10, 0], spine: [0, 0, -6] }), face: "sad", faceWeight: 0.8 })],
    props: [{ kind: "phone", from: 200, to: 3000 }, { kind: "question", from: 1200, to: 3000 }],
  },
  wakeUp: {
    id: "wakeUp",
    ms: 2600,
    keys: [k(0, { lids: 1, ...arms(ARMS.rest, { head: [24, 0, 14] }) }), k(1400, { lids: 0, face: "surprised", faceWeight: 1, ...arms(ARMS.rest), lift: 0.03 }), k(1700, { lift: 0 })],
    props: [{ kind: "exclaim", from: 1400, to: 2200 }, { kind: "sweat", from: 1700, to: 2500 }],
  },
  // taps
  giggle: {
    id: "giggle",
    ms: 1600,
    keys: [k(0, { face: "surprised", faceWeight: 1, lift: 0.02 }), k(250, { ...arms(ARMS.coverMouthR), face: "happy", faceWeight: 1, curlR: 0, lift: 0 }), k(700, { ...arms(ARMS.coverMouthR, { spine: [0, 0, 4] }) }), k(1100, { ...arms(ARMS.coverMouthR, { spine: [0, 0, -4] }) })],
    props: [{ kind: "note", from: 300, to: 1400 }],
  },
  shy: {
    id: "shy",
    ms: 2000,
    keys: [k(200, { ...arms(ARMS.cheeks, { head: [0, 20, 12] }), curlL: 0, curlR: 0, face: "happy", faceWeight: 0.8, lookX: -0.7 })],
    props: [{ kind: "heart", from: 300, to: 1700 }],
  },
  pout: {
    id: "pout",
    ms: 2200,
    keys: [k(150, { ...arms(ARMS.crossed, { head: [0, -22, -6] }), face: "angry", faceWeight: 1, curlL: 1, curlR: 1, lookX: 0.8 })],
    props: [{ kind: "exclaim", from: 200, to: 1800 }],
  },
  dizzy: {
    id: "dizzy",
    ms: 2600,
    keys: [k(0, { face: "surprised", faceWeight: 1 }), k(300, { ...arms(ARMS.rest, { head: [0, 0, 14], spine: [0, 0, 6] }), lids: 0.4 }), k(800, { ...arms(ARMS.rest, { head: [0, 0, -14], spine: [0, 0, -6] }) }), k(1300, { ...arms(ARMS.rest, { head: [0, 0, 12], spine: [0, 0, 5] }) }), k(1800, { ...arms(ARMS.rest, { head: [0, 0, -8] }) })],
    props: [{ kind: "stars" }],
  },
  pet: {
    id: "pet",
    ms: 2400,
    keys: [k(0, { lids: 1, face: "happy", faceWeight: 1, ...arms(ARMS.rest, { head: [0, 0, 10] }) }), k(800, { ...arms(ARMS.rest, { head: [0, 0, -6] }) }), k(1600, { ...arms(ARMS.rest, { head: [0, 0, 8] }) })],
    props: [{ kind: "heart" }, { kind: "note", from: 600, to: 2000 }],
  },
}

export const MOOD_SKITS: Record<string, string[]> = {
  idle: ["wave", "peace", "kawaii", "nya", "stretch", "coffee", "lookAround", "heartHands", "squat", "squat"],
  thinking: ["idea", "lookAround"],
  working: ["coffeeChug", "sweatTyping"],
  writing: ["coffeeChug", "sweatTyping"],
  loading: ["lookAround", "nya"],
  success: ["joyJump", "victory", "thumbsUp", "peace"],
  error: ["cry", "shrug"],
  offline: ["searchWifi", "wakeUp"],
}

export const ENTER_SKIT: Record<string, string> = { success: "joyJump", error: "shrug" }
export const TAP_ORDER = ["giggle", "shy", "heartHands", "pout", "pout", "dizzy"]

// ---------- sampling ----------

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function blend(a: Pose, b: Pose, t: number): Pose {
  const bones: BonePose = {}
  const names = new Set([...Object.keys(a.bones), ...Object.keys(b.bones)]) as Set<Bone>
  for (const n of names) {
    const x = a.bones[n] ?? [0, 0, 0]
    const y = b.bones[n] ?? [0, 0, 0]
    bones[n] = [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]
  }
  const pick = t < 0.5 ? a : b
  return {
    bones,
    curlL: lerp(a.curlL, b.curlL, t),
    curlR: lerp(a.curlR, b.curlR, t),
    shapeL: pick.shapeL,
    shapeR: pick.shapeR,
    face: pick.face,
    faceWeight: a.face === b.face ? lerp(a.faceWeight, b.faceWeight, t) : t < 0.5 ? a.faceWeight * (1 - 2 * t) : b.faceWeight * (2 * t - 1),
    mouth: lerp(a.mouth, b.mouth, t),
    lids: lerp(a.lids, b.lids, t),
    winkR: pick.winkR,
    lift: lerp(a.lift, b.lift, t),
    lookX: lerp(a.lookX, b.lookX, t),
    lookY: lerp(a.lookY, b.lookY, t),
    turn: lerp(a.turn, b.turn, t),
    l: lerpTarget(a.l, b.l, t),
    r: lerpTarget(a.r, b.r, t),
  }
}

/** Targets in different frames (head vs chest) switch frame halfway; the IK smoothing hides the jump. */
function lerpTarget(a: Target, b: Target, t: number): Target {
  if (a.ref !== b.ref) return t < 0.5 ? a : b
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t), ref: a.ref }
}

/** Pose of a scene at time t. Keys are cumulative; one-shot scenes ease back to `base` at the end. */
export function sample(scene: Scene, t: number, base: Pose): Pose {
  const frames: { t: number; pose: Pose }[] = []
  let current = scene.loop && scene.keys[0]?.t === 0 ? { ...base, ...scene.keys[0].pose } : base
  if (!(scene.loop && scene.keys[0]?.t === 0)) frames.push({ t: 0, pose: base })
  for (const key of scene.keys) {
    current = { ...current, ...key.pose }
    frames.push({ t: key.t, pose: current })
  }
  if (!scene.loop) frames.push({ t: scene.ms, pose: base })
  const time = scene.loop ? t % scene.ms : Math.min(t, scene.ms)
  for (let i = 1; i < frames.length; i++) {
    if (time <= frames[i].t) {
      const a = frames[i - 1]
      const b = frames[i]
      const span = b.t - a.t
      return span <= 0 ? b.pose : blend(a.pose, b.pose, ease((time - a.t) / span))
    }
  }
  return frames[frames.length - 1].pose
}

export function activeProps(scene: Scene, t: number): PropCue[] {
  const time = scene.loop ? t % scene.ms : t
  return (scene.props ?? []).filter((p) => time >= (p.from ?? 0) && time <= (p.to ?? scene.ms))
}
