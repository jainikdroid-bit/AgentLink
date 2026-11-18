import { useState } from "react"
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ActivityIndicator } from "react-native"
import { router } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { cyber } from "../theme/cyber"
import { useConnections } from "../stores/connections"
import { useEvents } from "../stores/events"
import { useHealth } from "../stores/health"
import { useOverallStatus } from "../lib/useOverallStatus"
import type { LinkState, StatusTone, SuggestedAction } from "../lib/connection-health"
import { StartServerBar } from "./StartServerBar"

const TONE_COLOR: Record<StatusTone, string> = {
  ok: cyber.green,
  busy: cyber.cyan,
  warn: cyber.amber,
  error: cyber.red,
  neutral: cyber.muted,
}

const LINK_ICON: Record<LinkState, { name: "checkmark-circle" | "close-circle" | "help-circle-outline"; color: string }> = {
  ok: { name: "checkmark-circle", color: cyber.green },
  fail: { name: "close-circle", color: cyber.red },
  unknown: { name: "help-circle-outline", color: cyber.muted },
}

interface Props {
  /** Busy state of this one session; without it, any running session counts. */
  sessionId?: string
  /** Busy state given by the caller (other agents have no server-side session). */
  busy?: boolean
  /** Dot only, no title: for tight headers. */
  compact?: boolean
}

/** Coloured dot + short title for the overall state; tap for the explanation, the chain and what to do about it. */
export function ConnectionStatusChip({ sessionId, busy, compact = false }: Props) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { info } = useOverallStatus({ sessionId, busy })
  const color = TONE_COLOR[info.tone]
  return (
    <>
      <TouchableOpacity
        style={[s.chip, { borderColor: color }]}
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t(info.titleKey)}
        testID="connection-status-chip"
      >
        <View style={[s.dot, { backgroundColor: color }]} testID="connection-status-dot" />
        {compact ? null : <Text style={[s.chipText, { color }]} numberOfLines={1}>{t(info.titleKey)}</Text>}
      </TouchableOpacity>
      {open ? <StatusSheet sessionId={sessionId} busy={busy} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function StatusSheet({ sessionId, busy, onClose }: Props & { onClose: () => void }) {
  const { t } = useTranslation()
  const { info, links, checkedAt, checking } = useOverallStatus({ sessionId, busy })
  const activeConnection = useConnections((c) => c.activeConnection)
  const clientBase = useConnections((c) => c.clientBase)
  const color = TONE_COLOR[info.tone]

  const retry = () => {
    useEvents.getState().reconnectNow()
    void useHealth.getState().check()
  }
  const go = (path: string) => {
    onClose()
    router.push(path as never)
  }
  const act = (action: SuggestedAction) => {
    if (action === "retry") retry()
    else if (action === "fix-password" && activeConnection) go(`/connection/${activeConnection.id}`)
    else if (action === "open-connections") go("/(tabs)/connections")
  }
  const actionLabel: Record<Exclude<SuggestedAction, null | "start-server">, string> = {
    retry: t("status.action.retry"),
    "fix-password": t("status.action.fixPassword"),
    "open-connections": t("status.action.openConnections"),
  }
  const chain: { key: keyof typeof links; label: string }[] = [
    { key: "phone", label: t("status.chain.phone") },
    { key: "computer", label: t("status.chain.computer") },
    { key: "server", label: t("status.chain.server") },
    { key: "agent", label: t("status.chain.agent") },
  ]

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => undefined} testID="connection-status-sheet">
          <View style={s.titleRow}>
            <View style={[s.dot, { backgroundColor: color }]} />
            <Text style={s.title}>{t(info.titleKey)}</Text>
            {checking ? <ActivityIndicator size="small" color={cyber.cyan} /> : null}
          </View>
          <Text style={s.body}>{t(info.explanationKey)}</Text>

          <View style={s.chain}>
            {chain.map((link) => (
              <View key={link.key} style={s.chainRow}>
                <Ionicons name={LINK_ICON[links[link.key]].name} size={18} color={LINK_ICON[links[link.key]].color} />
                <Text style={s.chainLabel}>{link.label}</Text>
                <Text style={s.chainState}>{t(`status.link.${links[link.key]}`)}</Text>
              </View>
            ))}
          </View>

          <Text style={s.checked}>
            {checkedAt ? t("status.checkedAt", { time: new Date(checkedAt).toLocaleTimeString() }) : t("status.notChecked")}
          </Text>

          {info.action === "start-server" && activeConnection?.launcherPort ? (
            <StartServerBar
              target={{ serverUrl: activeConnection.url, launcherPort: activeConnection.launcherPort, auth: clientBase?.auth, tunnel: !!activeConnection.tunnelTopic }}
              onStarted={() => {
                retry()
                onClose()
              }}
            />
          ) : info.action ? (
            <TouchableOpacity style={s.action} onPress={() => act(info.action)} testID="connection-status-action">
              <Text style={s.actionText}>{actionLabel[info.action as keyof typeof actionLabel]}</Text>
            </TouchableOpacity>
          ) : null}

          <View style={s.footerRow}>
            {info.action !== "retry" && info.status !== "no-connection" ? (
              <TouchableOpacity onPress={retry} hitSlop={8} testID="connection-status-recheck">
                <Text style={s.link}>{t("status.action.checkNow")}</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Text style={s.link}>{t("common.close")}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const s = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, flexShrink: 1 },
  chipText: { fontSize: 12, fontWeight: "600", flexShrink: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  sheet: { backgroundColor: cyber.surface, borderRadius: 14, borderWidth: 1, borderColor: cyber.borderGlow, padding: 16, gap: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: cyber.text, fontSize: 17, fontWeight: "700" },
  body: { color: cyber.muted, fontSize: 14, lineHeight: 20 },
  chain: { backgroundColor: cyber.surface2, borderRadius: 10, padding: 12, gap: 10 },
  chainRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  chainLabel: { flex: 1, color: cyber.text, fontSize: 14 },
  chainState: { color: cyber.muted, fontSize: 12 },
  checked: { color: cyber.muted, fontSize: 12 },
  action: { backgroundColor: cyber.cyan, borderRadius: 10, height: 44, alignItems: "center", justifyContent: "center" },
  actionText: { color: cyber.bg, fontWeight: "700", fontSize: 14 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  link: { color: cyber.cyan, fontSize: 14 },
})
