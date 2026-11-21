export const CHERI_CAMERA_FOV = 24
export const CHERI_CAMERA_DISTANCE = 4.2
export const WALK_MILLISECONDS = 1080
export const WALK_TURN_MS = 260
export const WALK_SPEED = 0.42 // model metres per second at screen scale
export const WALK_STANCE = 0.62

/** CSS/React Native units per second at the model's centre. */
export function walkScreenSpeed(height: number) {
  const viewHeight = 2 * CHERI_CAMERA_DISTANCE * Math.tan(CHERI_CAMERA_FOV * Math.PI / 360)
  return WALK_SPEED * height / viewHeight
}

export function stepOffset(time: number, side: 0 | 1) {
  const cycle = time * 1000 / WALK_MILLISECONDS + side * 0.5
  const phase = cycle - Math.floor(cycle)
  const stanceSeconds = WALK_STANCE * WALK_MILLISECONDS / 1000
  const halfStride = WALK_SPEED * stanceSeconds / 2
  if (phase < WALK_STANCE) {
    return { forward: halfStride - WALK_SPEED * phase * WALK_MILLISECONDS / 1000, lift: 0, pitch: 0 }
  }

  const swing = (phase - WALK_STANCE) / (1 - WALK_STANCE)
  const ease = swing * swing * (3 - 2 * swing)
  const height = Math.sin(Math.PI * swing) ** 2
  // Match the stance velocity at both contacts so a foot never snaps forwards.
  const tangent = -WALK_SPEED * (1 - WALK_STANCE) * WALK_MILLISECONDS / 1000
  const forward = halfStride * (2 * ease - 1) + tangent * swing * (1 - swing) * (1 - 2 * swing)
  return { forward, lift: 0.052 * height, pitch: 0.22 * height * Math.cos(Math.PI * swing) }
}
