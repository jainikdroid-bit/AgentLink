import type { Mood } from "../../lib/cheri/types"

// Moods every mascot can show. Screens pick one; the chosen character draws it its own way.
export type MascotState = Mood

export interface MascotProps {
  state?: MascotState
  size?: number
  /** Let the user poke the mascot: taps escalate, a long press pets her (Cheri; RIG ignores it). */
  interactive?: boolean
  /** No spontaneous scenes: for tiny previews and the runner game. */
  calm?: boolean
}
