import { useEffect, useRef, useState } from "react"
import { View, Text, StyleSheet, Animated, Easing } from "react-native"
import { useTranslation } from "react-i18next"
import { useEvents } from "../../stores/events"
import { useSessions } from "../../stores/sessions"
import { agentPhase, formatElapsed, type AgentPhase } from "../../lib/agent-phase"
import type { MascotState } from "../Mascot"
import { useAvatar } from "../../stores/avatar"

interface Props {
  sessionID: string
  isDark: boolean
}

// How the mascot acts for each thing the agent can be doing.
const MASCOT_STATE: Record<AgentPhase["kind"], MascotState> = {
  thinking: "thinking",
  tool: "working",
  writing: "writing",
  working: "loading",
}

const PHASE_COLOR: Record<AgentPhase["kind"], string> = {
  thinking: "#ffb800",
  tool: "#06b6d4",
  writing: "#34f5a5",
  working: "#22d3ee",
}

/** Three dots that rise and fade in turn: "the agent is busy" without a spinner. */
function BouncingDots({ color }: { color: string }) {
  const dots = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current
  useEffect(() => {
    const loops = dots.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 160),
          Animated.timing(value, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(Math.max(0, (2 - index) * 160)),
        ]),
      ),
    )
    loops.forEach((loop) => loop.start())
    return () => loops.forEach((loop) => loop.stop())
  }, [dots])

  return (
    <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {dots.map((value, index) => (
        <Animated.View
          key={index}
          style={[
            s.dot,
            {
              backgroundColor: color,
              opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -4] }) }],
            },
          ]}
        />
      ))}
    </View>
  )
}

export function StatusIndicator({ sessionID, isDark }: Props) {
  const { t } = useTranslation()
  const status = useEvents((st) => st.sessionStatus[sessionID])
  const text = useEvents((st) => st.statusText[sessionID])
  const optimistic = useSessions((st) => st.sending[sessionID])
  // Newest message of this session: "waiting" while the user's prompt is still the
  // last thing (the model has not produced anything yet), else the assistant's parts.
  const latest = useSessions((st) => {
    for (let i = st.messages.length - 1; i >= 0; i--) {
      const message = st.messages[i]
      if (message.sessionID !== sessionID) continue
      return message.role === "assistant" ? st.parts[message.id] : "waiting"
    }
    return undefined
  })

  // SSE status is the source of truth. The optimistic `sending` flag only
  // covers the gap between the user tapping send and SSE confirming busy.
  // Once SSE reports idle, the indicator hides regardless of the optimistic flag.
  const sseBusy = status && status.type !== "idle"
  const busy = !!(sseBusy || (optimistic && !status))

  // Elapsed time since this run started being busy.
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!busy) {
      setStartedAt(null)
      return
    }
    setStartedAt((current) => current ?? Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])

  // Slide/fade in when a run starts.
  const appear = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (busy) Animated.timing(appear, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
    else appear.setValue(0)
  }, [busy, appear])

  // Tell the floating 3D Cheri what the agent is doing (thinking -> bulb and hand on chin, tools -> typing...).
  const activityKind = busy ? (status?.type === "retry" ? "working" : latest === "waiting" ? "thinking" : agentPhase(latest).kind) : null
  useEffect(() => {
    useAvatar.getState().setActivity(activityKind ? MASCOT_STATE[activityKind] : null)
  }, [activityKind])
  useEffect(() => () => useAvatar.getState().setActivity(null), [])

  if (!busy) return null

  const phase: AgentPhase =
    status?.type === "retry" ? { kind: "working" } : latest === "waiting" ? { kind: "thinking" } : agentPhase(latest)
  const color = PHASE_COLOR[phase.kind]
  let label: string
  if (status?.type === "retry") label = t("chat.statusIndicator.retrying", { attempt: status.attempt })
  else if (phase.kind === "thinking") label = t("chat.statusIndicator.thinking")
  else if (phase.kind === "tool") label = t("chat.statusIndicator.tool", { tool: phase.tool })
  else if (phase.kind === "writing") label = t("chat.statusIndicator.writing")
  else label = text || t("chat.statusIndicator.working")

  return (
    <Animated.View
      style={[
        s.bar,
        isDark && s.barDark,
        { borderTopColor: color, opacity: appear, transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      testID="status-indicator"
    >
      <Text style={[s.text, isDark && s.textDark]} numberOfLines={1}>
        {label}
      </Text>
      <BouncingDots color={color} />
      <View style={s.spacer} />
      {startedAt ? <Text style={[s.elapsed, isDark && s.elapsedDark]}>{formatElapsed(now - startedAt)}</Text> : null}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#141926",
    borderTopWidth: 2,
  },
  barDark: { backgroundColor: "#0a1522" },
  text: { flexShrink: 1, fontSize: 14, color: "#4c1d95", fontWeight: "600" },
  textDark: { color: "#67e8f9" },
  dots: { flexDirection: "row", alignItems: "center", gap: 4, height: 14, marginTop: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  spacer: { flex: 1 },
  elapsed: { fontSize: 12, color: "#0891b2", fontVariant: ["tabular-nums"] },
  elapsedDark: { color: "#22d3ee" },
})
