import { memo, useEffect, useRef, useState } from "react"
import { Animated, Pressable, View } from "react-native"
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from "react-native-svg"
import { useLoop } from "./useLoop"
import type { MascotProps, MascotState } from "./types"

type CompanionKind = "byte" | "orbit"
type Props = MascotProps & { kind: CompanionKind }

const STATUS_COLOR: Record<MascotState, string> = {
  idle: "#9ce9ff", thinking: "#ffcc78", working: "#8ce9fc", writing: "#87e6c4",
  loading: "#c8b5ff", success: "#6af0a8", error: "#ff7588", offline: "#9ca3af",
}

// Original vector characters; no external art, model downloads or changes to Cheri.
function CompanionImpl({ kind, state = "idle", size = 96, interactive = false, calm = false }: Props) {
  const [poked, setPoked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current !== null) clearTimeout(timer.current) }, [])
  const fox = kind === "byte"
  const mood = state
  const accent = STATUS_COLOR[mood]
  const base = fox ? "#ef9c57" : "#9b98e9"
  const light = fox ? "#ffdeae" : "#d8d5ff"
  const dark = fox ? "#653744" : "#33315c"
  const bob = useLoop(mood === "working" ? 370 : mood === "success" ? 300 : 1250, true, !calm && mood !== "offline")
  const motion = useLoop(700, true, !calm && (mood === "thinking" || mood === "loading" || mood === "writing" || mood === "working"))
  const amplitude = mood === "working" || mood === "success" ? -5 : -2
  const y = bob.interpolate({ inputRange: [0, 1], outputRange: [0, amplitude] })
  const scale = poked ? 1.05 : 1
  const happy = mood === "success" || poked
  const sleeping = mood === "offline"
  const poke = () => {
    if (!interactive || calm) return
    setPoked(true)
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = setTimeout(() => { setPoked(false); timer.current = null }, 850)
  }
  const drawing = (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY: y }, { scale }] }}>
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Ellipse cx={60} cy={111} rx={36} ry={5} fill="#10131f" opacity={0.5} />
        {fox ? (
          <G>
            <Path d="M78 99 Q112 99 105 68 Q98 79 86 75 Q93 95 74 96Z" fill={base} stroke={dark} strokeWidth={3} strokeLinejoin="round" />
            <Path d="M105 68 Q109 83 100 92 L91 83Z" fill={light} />
            <Ellipse cx={59} cy={88} rx={25} ry={21} fill={base} stroke={dark} strokeWidth={3} />
            <Ellipse cx={60} cy={93} rx={13} ry={13} fill={light} />
            <Path d="M28 47 L19 15 Q22 8 48 36 L72 36 Q99 8 101 16 L92 48Z" fill={base} stroke={dark} strokeWidth={3} strokeLinejoin="round" />
            <Path d="M28 35 L25 23 L40 37Z M80 37 L95 23 L92 35Z" fill="#eeb4b6" />
            <Path d="M22 57 Q22 34 60 34 Q98 34 98 57 Q100 72 79 79 Q60 92 41 79 Q20 72 22 57Z" fill={base} stroke={dark} strokeWidth={3} />
            <Path d="M25 60 Q37 52 49 64 L60 75 L71 64 Q83 52 95 60 Q91 79 60 83 Q29 79 25 60Z" fill={light} />
            <Path d="M56 68 Q60 64 64 68 L60 72Z" fill={dark} />
          </G>
        ) : (
          <G>
            <Path d="M23 69 Q10 51 24 40 L32 58 M97 69 Q110 51 96 40 L88 58" fill={base} stroke={dark} strokeWidth={3} strokeLinejoin="round" />
            <Path d="M35 76 Q36 100 48 99 L60 89 L72 99 Q84 100 85 76Z" fill={base} stroke={dark} strokeWidth={3} />
            <Ellipse cx={60} cy={60} rx={36} ry={36} fill={light} stroke={dark} strokeWidth={3} />
            <Rect x={30} y={43} width={60} height={35} rx={17} fill="#201f3c" stroke={base} strokeWidth={3} />
            <Path d="M57 24 L60 15 L63 24" stroke={dark} strokeWidth={3} fill="none" strokeLinecap="round" />
            <Circle cx={60} cy={13} r={4.5} fill={accent} stroke={dark} strokeWidth={1.5} />
            <Path d="M40 100 L35 106 M60 100 L60 109 M80 100 L85 106" stroke={accent} strokeWidth={3} strokeLinecap="round" opacity={0.85} />
          </G>
        )}
        <G stroke={fox ? dark : accent} fill="none" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          {mood === "error" ? (
            <Path d="M41 53 L48 60 M48 53 L41 60 M72 53 L79 60 M79 53 L72 60" />
          ) : sleeping || happy ? (
            <Path d={happy ? "M40 59 Q45 50 50 59 M70 59 Q75 50 80 59" : "M40 57 Q45 61 50 57 M70 57 Q75 61 80 57"} />
          ) : (
            <G fill={fox ? dark : accent} stroke="none">
              <Ellipse cx={mood === "thinking" ? 47 : 45} cy={mood === "thinking" ? 53 : 56} rx={3.5} ry={mood === "working" ? 4 : 5} />
              <Ellipse cx={mood === "thinking" ? 77 : 75} cy={mood === "thinking" ? 53 : 56} rx={3.5} ry={mood === "working" ? 4 : 5} />
            </G>
          )}
          <Path d={mood === "error" ? "M55 73 Q60 68 65 73" : sleeping ? "M56 72 L64 72" : happy ? "M54 71 Q60 80 66 71" : "M56 72 Q60 75 64 72"} />
        </G>
        {mood === "thinking" && <G fill={accent}><Circle cx={96} cy={24} r={3} /><Circle cx={103} cy={16} r={4} /><Circle cx={110} cy={7} r={5} /></G>}
        {mood === "working" && <G stroke={accent} strokeWidth={3} strokeLinecap="round"><Path d="M9 79 L14 72 M9 65 L17 65 M11 52 L16 58" /><Path d="M105 79 L112 84 M105 91 L114 91" /></G>}
        {mood === "writing" && <G><Rect x={30} y={88} width={60} height={23} rx={5} fill="#252b40" stroke={accent} strokeWidth={2} /><Path d="M38 94 H82 M38 100 H76 M44 106 H76" stroke={accent} strokeWidth={2} strokeDasharray="3 3" /></G>}
        {mood === "loading" && <Circle cx={60} cy={60} r={49} stroke={accent} strokeWidth={2.5} strokeDasharray="9 11" fill="none" opacity={0.85} />}
        {happy && <G stroke={STATUS_COLOR.success} strokeWidth={2.5} strokeLinecap="round"><Path d="M11 25 H23 M17 19 V31 M99 24 H111 M105 18 V30" /><Path d="M96 91 L100 95 L109 85" fill="none" /></G>}
        {mood === "error" && <G><Circle cx={105} cy={23} r={10} fill={accent} /><Path d="M105 17 V24 M105 28 V29" stroke="#351a26" strokeWidth={3} strokeLinecap="round" /></G>}
        {sleeping && <Path d="M92 14 H105 L92 26 H105 M106 4 H114 L106 12 H114" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />}
      </Svg>
      {mood === "loading" || mood === "working" || mood === "writing" || mood === "thinking" ? (
        <Animated.View pointerEvents="none" style={{ position: "absolute", width: size * 0.055, height: size * 0.055, borderRadius: size * 0.04, backgroundColor: accent, top: size * 0.08, left: size * 0.08, opacity: motion.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }) }} />
      ) : null}
    </Animated.View>
  )
  return interactive && !calm
    ? <Pressable onPress={poke} onLongPress={poke} accessibilityRole="button" accessibilityLabel={fox ? "Byte" : "Orbit"} testID={`companion-${kind}`}>{drawing}</Pressable>
    : <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{drawing}</View>
}

export const CompanionMascot = memo(CompanionImpl)
