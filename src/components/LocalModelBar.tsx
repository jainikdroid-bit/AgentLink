import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { cyber } from "../theme/cyber"
import { useConnections } from "../stores/connections"
import { getLocalModels, setLocalModel, type LauncherTarget } from "../lib/launcher-api"
import { modelLabel, waitForLocalModelState, type LocalModel } from "../lib/local-model"

const REFRESH_MS = 15_000

/**
 * The local model on the computer (llama.cpp behind the launcher): is it in memory, and a button to load
 * it or free the memory. Hidden when the computer has no local model server or an older launcher.
 */
export function LocalModelBar() {
  const { t } = useTranslation()
  const activeConnection = useConnections((state) => state.activeConnection)
  const serverUrl = activeConnection?.url
  const launcherPort = activeConnection?.launcherPort
  const tunnel = !!activeConnection?.tunnelTopic
  const username = useConnections((state) => state.clientBase?.auth?.username)
  const password = useConnections((state) => state.clientBase?.auth?.password)
  const target = useMemo<LauncherTarget | null>(
    () =>
      serverUrl && launcherPort
        ? { serverUrl, launcherPort, auth: username !== undefined && password !== undefined ? { username, password } : undefined, tunnel }
        : null,
    [serverUrl, launcherPort, tunnel, username, password],
  )
  const [models, setModels] = useState<LocalModel[] | null | undefined>(undefined)
  const [busy, setBusy] = useState<{ id: string; action: "load" | "unload" } | null>(null)
  const active = useRef<AbortController | null>(null)
  const refreshVersion = useRef(0)

  useEffect(() => {
    setModels(target ? undefined : null)
    setBusy(null)
    return () => {
      refreshVersion.current += 1
      active.current?.abort()
      active.current = null
    }
  }, [target])

  const refresh = useCallback(async () => {
    if (!target || active.current) return
    const version = ++refreshVersion.current
    const snapshot = await getLocalModels(target)
    if (version === refreshVersion.current) setModels(snapshot)
  }, [target])

  useFocusEffect(
    useCallback(() => {
      void refresh()
      const timer = setInterval(() => void refresh(), REFRESH_MS)
      return () => clearInterval(timer)
    }, [refresh]),
  )
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s === "active" && void refresh())
    return () => sub.remove()
  }, [refresh])

  const toggle = async (m: LocalModel) => {
    if (!target || active.current) return
    const operation = new AbortController()
    active.current = operation
    refreshVersion.current += 1
    const action = m.state === "loaded" ? "unload" : "load"
    setBusy({ id: m.id, action })
    let confirmed = false
    try {
      const result = await setLocalModel(target, action, m.id)
      if (operation.signal.aborted) return
      if (!result.ok) {
        Alert.alert(t("localModel.failed"), result.error)
        return
      }
      const expected = action === "unload" ? "unloaded" : "loaded"
      const snapshot = await waitForLocalModelState(() => getLocalModels(target), m.id, expected, operation.signal)
      if (operation.signal.aborted) return
      if (!snapshot) {
        Alert.alert(t("localModel.failed"), t("localModel.unconfirmed"))
        return
      }
      confirmed = true
      setModels(snapshot)
    } finally {
      if (active.current === operation) {
        active.current = null
        setBusy(null)
        if (!confirmed) void refresh()
      }
    }
  }

  if (!activeConnection) return null
  return (
    <View style={s.wrap} testID="local-model-bar">
      <Text style={s.heading}>{t("localModel.title")}</Text>
      {models === undefined ? <ActivityIndicator color={cyber.cyan} /> : null}
      {models?.length ? null : models === undefined ? null : <Text style={s.hint}>{t("localModel.unavailable")}</Text>}
      {models?.map((m) => {
        const action = busy?.id === m.id ? busy.action : null
        const state = action === "unload" ? "unloading" : action === "load" ? "loading" : m.state
        const loaded = state === "loaded"
        const working = state === "loading" || state === "unloading"
        return (
          <View key={m.id} style={s.row}>
            <Ionicons name="hardware-chip-outline" size={16} color={loaded ? cyber.green : cyber.muted} />
            <View style={s.text}>
              <Text style={s.name} numberOfLines={1}>
                {modelLabel(m.id)}
              </Text>
              <Text accessibilityLiveRegion="polite" style={[s.state, loaded && { color: cyber.green }]}>{t(`localModel.state.${state}`)}</Text>
            </View>
            {working ? (
              <ActivityIndicator size="small" color={cyber.cyan} />
            ) : (
              <TouchableOpacity style={[s.button, loaded && s.unload, busy && s.disabled]} disabled={!!busy} onPress={() => void toggle(m)} testID={`local-model-${loaded ? "unload" : "load"}`}>
                <Text style={[s.buttonText, loaded && { color: cyber.amber }]}>{t(loaded ? "localModel.unload" : "localModel.load")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface },
  heading: { color: cyber.text, fontWeight: "600", paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  hint: { color: cyber.muted, fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  text: { flex: 1 },
  name: { color: cyber.text, fontSize: 14, fontWeight: "600" },
  state: { color: cyber.muted, fontSize: 12 },
  button: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: cyber.cyan },
  unload: { borderColor: cyber.amber },
  disabled: { opacity: 0.5 },
  buttonText: { color: cyber.cyan, fontSize: 13, fontWeight: "600" },
})
