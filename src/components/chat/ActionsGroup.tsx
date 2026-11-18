import { useState, type ReactNode } from "react"
import { Pressable, StyleSheet, Text, View } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { summarizeTools } from "../../lib/tool-summary"
import { useSettings } from "../../stores/settings"
import { cyber } from "../../theme/cyber"

/**
 * The agent's actions (commands, edits, reads...) of one reply folded into a single line:
 * "Actions (5) · bash ×3, edit ×2". Open by default only when the user asked for it in
 * Settings → Chat; each action inside can still be opened on its own.
 */
export function ActionsGroup({ names, children, testID }: { names: readonly (string | undefined)[]; children: ReactNode; testID?: string }) {
  const { t } = useTranslation()
  const showActions = useSettings((s) => s.showActions)
  const [open, setOpen] = useState(showActions)
  return (
    <View style={s.wrap} testID={testID}>
      <Pressable style={s.header} onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} testID={testID ? `${testID}-toggle` : undefined}>
        <Ionicons name="terminal-outline" size={15} color={cyber.muted} />
        <Text style={s.title}>{t("chat.actions.title", { count: names.length })}</Text>
        <Text style={s.summary} numberOfLines={1}>
          {summarizeTools(names)}
        </Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={cyber.muted} />
      </Pressable>
      {open ? <View style={s.body}>{children}</View> : null}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginTop: 6, borderRadius: 10, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingVertical: 8 },
  title: { color: cyber.text, fontSize: 13, fontWeight: "600" },
  summary: { flex: 1, color: cyber.muted, fontSize: 12, fontFamily: cyber.mono },
  body: { paddingHorizontal: 6, paddingBottom: 6, gap: 4 },
})
