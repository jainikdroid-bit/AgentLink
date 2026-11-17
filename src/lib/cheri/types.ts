// Cheri's pose model: everything the renderer needs for one frame. Scenes are timelines of
// partial poses (keyframes) plus effect tracks; the director samples them into a Pose.

export type Mood = "idle" | "thinking" | "working" | "writing" | "loading" | "success" | "error" | "offline"

export type EyeKind =
  | "open" // round anime eyes (blink applies)
  | "happy" // ^ ^
  | "wink" // left open, right ^
  | "closed" // calm closed lids
  | "squeeze" // > <
  | "spiral" // dizzy @ @
  | "smug" // half-lidded, looking at you
  | "sleepy" // heavy lids
  | "star" // sparkling star eyes
  | "heart" // heart eyes
  | "teary" // huge wet eyes
  | "wide" // shocked, tiny pupils
  | "dot" // deadpan • •
  | "uwu" // soft closed curves
  | "side" // side-eye, lids half down

export type BrowKind = "normal" | "raised" | "worried" | "angry" | "smug" | "high" | "focused"

export type MouthKind =
  | "smile"
  | "grin" // open happy
  | "laugh" // wide open with tongue
  | "yawn" // tall o, size from mouthOpen
  | "cat" // :3
  | "o"
  | "small" // tiny o (whistle, surprise)
  | "pout"
  | "wavy"
  | "frown"
  | "flat"
  | "smirk"
  | "w" // uwu
  | "nervous" // teeth grin ^_^;
  | "blep" // tongue out
  | "cry" // wide wobbly crying mouth
  | "gulp" // closed, cheeks full

export type HandShape = "fist" | "open" | "peace" | "thumb" | "point" | "paw"

export interface Arm {
  /** Hand centre on the 120x120 canvas. */
  x: number
  y: number
  hand: HandShape
  /** Hand rotation in degrees (0 = fingers up). */
  rot: number
}

export interface Pose {
  /** Whole body vertical offset (negative = up). */
  bob: number
  /** Whole body rotation in degrees about the bottom centre. */
  sway: number
  /** Vertical squash/stretch (1 = normal). */
  squash: number
  /** Head tilt in degrees about the neck, and sideways shift. */
  tilt: number
  headX: number
  eyes: EyeKind
  /** Iris offset for open/teary/wide eyes. */
  eyeX: number
  eyeY: number
  /** 0 = open, 1 = shut (applies to open-type eyes). */
  blink: number
  brows: BrowKind
  mouth: MouthKind
  /** Yawn/laugh opening, 0..1. */
  mouthOpen: number
  /** 0 none, 1 rosy, 2 very red with shy lines. */
  blush: number
  /** Ear rotation in degrees (negative = flatten outward/down). */
  earL: number
  earR: number
  /** Ear LED colour; null = the mood's colour. */
  led: string | null
  l: Arm
  r: Arm
}

export type FxKind =
  | "sweat"
  | "anger"
  | "sparkle"
  | "heart"
  | "tears"
  | "snot"
  | "z"
  | "note"
  | "bulb"
  | "question"
  | "exclaim"
  | "bubble" // speech bubble with text
  | "confetti"
  | "cloud" // rain cloud, p drives the rain
  | "cup"
  | "steam" // hot steam / heat lines
  | "keyboard"
  | "panel" // hologram text panel
  | "phone"
  | "wifi" // no-signal arcs
  | "cat" // hologram cat
  | "gum"
  | "splat" // popped gum on the face
  | "lump" // bump on the head
  | "stars" // dizzy stars orbiting, p drives the orbit
  | "speed" // speed lines
  | "umbrella"
  | "magnifier"
  | "ring" // loading ring around her, p drives the spin
  | "hoop" // hula hoop, p drives the swing
  | "glitch"
  | "gear" // spinning gear, p drives it
  | "puff" // sneeze / sigh cloud

export interface Fx {
  k: FxKind
  x: number
  y: number
  /** Scale. */
  s: number
  /** Opacity. */
  o: number
  /** Rotation in degrees. */
  r: number
  /** Local progress 0..1 for fx that animate themselves (cloud rain, stars orbit, confetti fall). */
  p: number
  text?: string
  /** Colour override. */
  c?: string
}

export interface Frame {
  pose: Pose
  fx: Fx[]
}
