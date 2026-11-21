import { useEffect, useMemo, useRef, useState } from "react"
import { View, Text, TextInput, TouchableOpacity, FlatList, ScrollView, StyleSheet, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Pressable } from "react-native"
import { Stack, router, useLocalSearchParams } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { cyber } from "../src/theme/cyber"
import { useConnections } from "../src/stores/connections"
import { useAcpChat } from "../src/lib/acp/useAcpChat"
import { loginHint, type ChatItem } from "../src/lib/acp/protocol"
import { Markdown } from "../src/components/markdown"
import { ReasoningBlock } from "../src/components/chat/ReasoningBlock"
import { ToolCallRow } from "../src/components/acp/ToolCallRow"
import { PlanCard } from "../src/components/acp/PlanCard"
import { PermissionCard } from "../src/components/acp/PermissionCard"
import { ActionsGroup } from "../src/components/chat/ActionsGroup"
import { groupConsecutive, type Grouped } from "../src/lib/tool-summary"
import { useSettings } from "../src/stores/settings"

// A chat with another coding agent on the computer (Claude Code, Codex, Gemini CLI, ...) over the Agent Client
// Protocol. Everything shown here is rebuilt from the agent's event stream, so closing the screen leaves the
// agent running and reopening it from the agents list picks the chat up again.
export default function AgentChatScreen() {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ agent: string; name?: string; cwd?: string; id?: string }>()
  const { activeConnection, clientBase } = useConnections()
  const target = useMemo(
    () =>
      activeConnection?.launcherPort
        ? { serverUrl: activeConnection.url, launcherPort: activeConnection.launcherPort, auth: clientBase?.auth, tunnel: !!activeConnection.tunnelTopic }
        : null,
    [activeConnection, clientBase],
  )
  const chat = useAcpChat(target, { agent: String(params.agent), cwd: params.cwd || undefined, existingId: params.id || undefined })
  const { state } = chat
  // The name from the list ("Claude Code") reads better than what some adapters report (their package name).
  const agentName = params.name || state.agentName || String(params.agent)
  const [modelMenu, setModelMenu] = useState(false)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const list = useRef<FlatList<Grouped<ChatItem>>>(null)
  const showActions = useSettings((st) => st.showActions)
  // Runs of tool calls fold into one "Actions (N)" line, like in the opencode chat.
  const rows = useMemo(() => groupConsecutive(state.items, (item) => item.type === "tool"), [state.items])
  const nearBottom = useRef(true)

  useEffect(() => {
    if (nearBottom.current) list.current?.scrollToEnd({ animated: true })
  }, [state.items, state.pendingPermissions.length])

  const ready = state.handshake === "done" && !state.exit
  const hint = loginHint(state)
  const lastItem = state.items.at(-1)

  const submit = async () => {
    const message = text.trim()
    if (!message || sending || !ready || state.busy) return
    setSending(true)
    try {
      await chat.send(message)
      setText("")
    } catch (error) {
      Alert.alert(agentName, t("acp.sendFailed", { error: error instanceof Error ? error.message : String(error) }))
    } finally {
      setSending(false)
    }
  }

  const confirmStop = () =>
    Alert.alert(t("acp.stopTitle"), t("acp.stopBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("acp.stopConfirm"), style: "destructive", onPress: () => void chat.stop().finally(() => router.back()) },
    ])

  const statusLine = (() => {
    if (chat.fatal) return { tone: "error" as const, text: chat.fatal }
    if (state.exit) return { tone: "error" as const, text: state.exit.code ? t("acp.endedCode", { code: state.exit.code }) : t("acp.ended"), detail: state.exit.stderr }
    if (hint) return { tone: "error" as const, text: t("acp.loginNeeded", { agent: agentName, method: hint }) }
    if (state.handshake === "failed") return { tone: "error" as const, text: t("acp.handshakeFailed", { error: state.error ?? "" }) }
    if (chat.link === "reconnecting") return { tone: "info" as const, text: t("acp.reconnecting") }
    if (!ready) return { tone: "info" as const, text: t("acp.connecting") }
    return null
  })()

  const renderRow = ({ item: row }: { item: Grouped<ChatItem> }) => {
    if (row.kind === "group") {
      return (
        <ActionsGroup names={row.items.map((i) => (i.type === "tool" ? i.call.kind ?? i.call.title : undefined))} testID="acp-actions">
          {row.items.map((i) => (i.type === "tool" ? <ToolCallRow key={i.id} call={i.call} defaultOpen={showActions} /> : null))}
        </ActionsGroup>
      )
    }
    return renderItem({ item: row.item })
  }

  const renderItem = ({ item }: { item: ChatItem }) => {
    switch (item.type) {
      case "user":
        return (
          <View style={s.userRow}>
            <View style={s.userBubble}><Text style={s.userText} selectable>{item.text}</Text></View>
          </View>
        )
      case "agent":
        return <View style={s.agentRow}><Markdown>{item.text}</Markdown></View>
      case "thought":
        return <ReasoningBlock text={item.text} isDark streaming={state.busy && lastItem?.id === item.id} />
      case "tool":
        return <ToolCallRow call={item.call} />
      case "plan":
        return <PlanCard entries={item.entries} />
      case "notice":
        return <Text style={[s.notice, item.tone === "error" && s.noticeError]}>{noticeText(item, t)}</Text>
    }
  }

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : undefined} testID="agent-chat">
      <Stack.Screen
        options={{
          title: agentName,
          headerRight: () => (
            <TouchableOpacity onPress={confirmStop} hitSlop={12} testID="acp-stop-agent">
              <Ionicons name="power-outline" size={22} color={cyber.red} />
            </TouchableOpacity>
          ),
        }}
      />
      {statusLine ? (
        <View style={[s.status, statusLine.tone === "error" && s.statusError]}>
          {statusLine.tone === "info" ? <ActivityIndicator size="small" color={cyber.cyan} /> : null}
          <View style={s.statusTextWrap}>
            <Text style={s.statusText}>{statusLine.text}</Text>
            {"detail" in statusLine && statusLine.detail ? <Text style={s.statusDetail} numberOfLines={6}>{statusLine.detail}</Text> : null}
          </View>
        </View>
      ) : null}
      {state.modelConfig || state.modelName ? (
        <Pressable style={s.modelButton} onPress={() => setModelMenu(true)} disabled={!state.modelConfig || !ready || Object.values(state.requests).includes("session/set_config_option")} accessibilityRole="button" accessibilityLabel={t("chat.modelPicker.title")}>
          <Ionicons name="hardware-chip-outline" size={16} color={cyber.cyan} />
          <Text style={s.modelText} numberOfLines={1}>{state.modelName || t("chat.modelPicker.title")}</Text>
          {state.modelConfig ? <Ionicons name="chevron-down" size={16} color={cyber.cyan} /> : null}
        </Pressable>
      ) : null}
      <Modal visible={modelMenu && !!state.modelConfig} transparent animationType="fade" onRequestClose={() => setModelMenu(false)}>
        <View style={s.modelBackdrop}>
          <View style={s.modelPanel}>
            <Text style={s.modelHeading}>{t("chat.modelPicker.title")}</Text>
            <FlatList data={state.modelConfig?.options ?? []} keyExtractor={(option) => option.value} renderItem={({ item }) => (
              <Pressable style={s.modelButton} onPress={() => {
                setModelMenu(false)
                if (item.value !== state.modelConfig?.current) void chat.setModel(item.value).catch(() => Alert.alert(t("common.error")))
              }} accessibilityRole="button" accessibilityState={{ selected: item.value === state.modelConfig?.current }}>
                <Text style={s.modelText}>{item.name}</Text>
                {item.value === state.modelConfig?.current ? <Ionicons name="checkmark" size={18} color={cyber.cyan} /> : null}
              </Pressable>
            )} />
            <Pressable style={s.modelButton} onPress={() => setModelMenu(false)} accessibilityRole="button">
              <Text style={s.modelText}>{t("common.close")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {state.modes.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.modes} contentContainerStyle={s.modesContent} keyboardShouldPersistTaps="handled">
          {state.modes.map((mode) => (
            <TouchableOpacity key={mode.id} style={[s.chip, state.modeId === mode.id && s.chipOn]} onPress={() => void chat.setMode(mode.id).catch(() => undefined)} testID={`acp-mode-${mode.id}`}>
              <Text style={[s.chipText, state.modeId === mode.id && s.chipTextOn]}>{mode.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}
      <FlatList
        ref={list}
        data={rows}
        keyExtractor={(row) => (row.kind === "group" ? row.id : row.item.id)}
        renderItem={renderRow}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent
          nearBottom.current = contentOffset.y + layoutMeasurement.height > contentSize.height - 120
        }}
        scrollEventThrottle={100}
        ListFooterComponent={state.busy && lastItem?.type !== "thought" ? <ActivityIndicator style={s.busy} color={cyber.cyan} /> : null}
      />
      {state.pendingPermissions.map((request) => (
        <PermissionCard key={String(request.requestId)} request={request} agent={agentName} onAnswer={(optionId) => void chat.answer(request.requestId, optionId).catch(() => undefined)} />
      ))}
      <View style={[s.inputRow, { paddingBottom: Math.max(10, insets.bottom) }]}>
        <TextInput
          style={s.input}
          value={text}
          onChangeText={setText}
          placeholder={t("acp.inputPlaceholder", { agent: agentName })}
          placeholderTextColor={cyber.muted}
          multiline
          editable={ready}
          testID="acp-input"
        />
        {state.busy ? (
          <TouchableOpacity style={[s.send, s.cancel]} onPress={() => void chat.cancel().catch(() => undefined)} testID="acp-cancel">
            <Ionicons name="stop" size={20} color={cyber.red} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[s.send, (!ready || !text.trim() || sending) && s.sendOff]} onPress={() => void submit()} disabled={!ready || !text.trim() || sending} testID="acp-send">
            {sending ? <ActivityIndicator size="small" color={cyber.bg} /> : <Ionicons name="arrow-up" size={20} color={cyber.bg} />}
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

function noticeText(item: Extract<ChatItem, { type: "notice" }>, t: (key: string, options?: Record<string, string>) => string): string {
  const code = item.text
  if (code === "gap") return t("acp.gap")
  if (code === "refusal") return t("acp.refusal")
  if (code === "safeMode") return t("acp.safeMode", item.params)
  if (code === "max_tokens" || code === "max_turn_requests") return t("acp.limit")
  return code
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: cyber.bg },
  status: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: cyber.surface, borderBottomWidth: 1, borderBottomColor: cyber.border },
  statusError: { backgroundColor: "#2a0f16" },
  statusTextWrap: { flex: 1, gap: 4 },
  statusText: { color: cyber.text, fontSize: 13 },
  statusDetail: { color: cyber.muted, fontSize: 11, fontFamily: cyber.mono },
  modelButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  modelText: { flex: 1, color: cyber.text, fontSize: 14 },
  modelBackdrop: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(0,0,0,0.65)" },
  modelPanel: { maxHeight: "75%", backgroundColor: cyber.surface, borderRadius: 16, paddingVertical: 8 },
  modelHeading: { color: cyber.text, fontSize: 17, fontWeight: "600", padding: 16 },
  modes: { flexGrow: 0, flexShrink: 0, borderBottomWidth: 1, borderBottomColor: cyber.border },
  modesContent: { alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface },
  chipOn: { borderColor: cyber.cyan, backgroundColor: "#0a2530" },
  chipText: { color: cyber.muted, fontSize: 13 },
  chipTextOn: { color: cyber.cyan, fontWeight: "600" },
  listContent: { padding: 14, gap: 6 },
  userRow: { alignItems: "flex-end", marginVertical: 4 },
  userBubble: { maxWidth: "85%", backgroundColor: cyber.surface2, borderRadius: 14, borderBottomRightRadius: 4, paddingHorizontal: 14, paddingVertical: 10 },
  userText: { color: cyber.text, fontSize: 15 },
  agentRow: { marginVertical: 4 },
  notice: { color: cyber.muted, fontSize: 12, textAlign: "center", marginVertical: 6 },
  noticeError: { color: cyber.red },
  busy: { marginVertical: 12 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: cyber.border, backgroundColor: cyber.bg },
  input: { flex: 1, maxHeight: 140, minHeight: 44, borderRadius: 22, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface, color: cyber.text, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: cyber.cyan, alignItems: "center", justifyContent: "center" },
  sendOff: { opacity: 0.35 },
  cancel: { backgroundColor: "#2a0f16", borderWidth: 1, borderColor: cyber.red },
})
