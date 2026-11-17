import { memo, useCallback, useEffect, useRef, useState } from "react"
import { AppState, Pressable, View } from "react-native"
import { SvgXml } from "react-native-svg"
import { PET_SCENE, TAP_WINDOW_MS, enterScene, frameAt, nextDelayMs, pickScene, sceneLength, tapScene, type Playing } from "../../lib/cheri/director"
import { renderFrame } from "../../lib/cheri/render"
import type { Mood } from "../../lib/cheri/types"
import type { MascotProps } from "./types"

// Cheri, the cat-eared girl in a headset (the default mascot since 0.16). She is drawn frame by
// frame from src/lib/cheri: a pose (face, arms, hands, tilt) plus effects, at ~12 fps in a
// limited-animation style. Each mood has a base pose with small life (breathing, blinking,
// typing), and every few seconds she plays a skit (waving, burning her tongue on coffee,
// bubble gum popping on her face, searching for Wi-Fi...). Taps escalate from a giggle to
// "hmph", a long press pets her. Preview them all with `node scripts/cheri-lab.mjs`.

const FPS = 12
const CALM_FPS = 6

function useCheri(mood: Mood, calm: boolean) {
  const [xml, setXml] = useState(() => renderFrame(frameAt(mood, null, Date.now()), mood))
  const playing = useRef<Playing | null>(null)
  const last = useRef<string | null>(null)
  const nextAt = useRef(Date.now() + nextDelayMs(mood, Math.random))
  const previousMood = useRef(mood)
  const taps = useRef({ count: 0, at: 0 })
  const [active, setActive] = useState(AppState.currentState === "active")

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"))
    return () => sub.remove()
  }, [])

  const play = useCallback((id: string) => {
    playing.current = { id, start: Date.now() }
    last.current = id
  }, [])

  useEffect(() => {
    const entering = enterScene(previousMood.current, mood)
    previousMood.current = mood
    playing.current = null
    if (entering && !calm) play(entering)
    nextAt.current = Date.now() + nextDelayMs(mood, Math.random)
  }, [mood, calm, play])

  useEffect(() => {
    if (!active) return
    const tick = () => {
      const now = Date.now()
      const current = playing.current
      if (current && now - current.start >= sceneLength(current.id)) {
        playing.current = null
        nextAt.current = now + nextDelayMs(mood, Math.random)
      }
      if (!playing.current && !calm && now >= nextAt.current) {
        const id = pickScene(mood, Math.random, last.current)
        if (id) play(id)
      }
      const next = renderFrame(frameAt(mood, playing.current, now), mood)
      setXml((prev) => (prev === next ? prev : next))
    }
    tick()
    const timer = setInterval(tick, 1000 / (calm ? CALM_FPS : FPS))
    return () => clearInterval(timer)
  }, [mood, calm, active, play])

  const tap = useCallback(() => {
    const now = Date.now()
    const count = now - taps.current.at < TAP_WINDOW_MS ? taps.current.count + 1 : 1
    taps.current = { count, at: now }
    play(tapScene(count))
  }, [play])

  const pet = useCallback(() => {
    taps.current = { count: 0, at: 0 }
    play(PET_SCENE)
  }, [play])

  return { xml, tap, pet }
}

function CheriImpl({ state = "idle", size = 96, interactive = false, calm = false }: MascotProps) {
  const { xml, tap, pet } = useCheri(state, calm)
  const drawing = <SvgXml xml={xml} width={size} height={size} />
  if (interactive) {
    return (
      <Pressable onPress={tap} onLongPress={pet} delayLongPress={450} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cheri" style={{ width: size, height: size }}>
        {drawing}
      </Pressable>
    )
  }
  return <View style={{ width: size, height: size }}>{drawing}</View>
}

/** Memoised so a parent that re-renders every frame (the runner game) does not re-render Cheri. */
export const CheriMascot = memo(CheriImpl)
