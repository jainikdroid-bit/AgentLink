import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TouchableOpacity, View } from "react-native"
import { useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { cyber } from "../theme/cyber"
import { useConnections } from "../stores/connections"
import { getLocalModels, setLocalModel, type LauncherTarget } from "../lib/launcher-api"
import { modelLabel, type LocalModel } from "../lib/local-model"

const REFRESH_MS = 15_000

/**
 * The local model on the computer (llama.cpp behind the launcher): is it in memory, and a button to load
 * it or free the memory. Hidden when the computer has no local model server or an older launcher.
 */
export function LocalModelBar() {
  const { t } = useTranslation()
  const { activeConnection, clientBase } = useConnections()
  const target = useMemo<LauncherTarget | null>(
    () =>
      activeConnection?.launcherPort
        ? { serverUrl: activeConnection.url, launcherPort: activeConnection.launcherPort, auth: clientBase?.auth, tunnel: !!activeConnection.tunnelTopic }
        : null,
    [activeConnection, clientBase],
  )
  const [models, setModels] = useState<LocalModel[] | null | undefined>(undefined)
  const [busy, setBusy] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!target) return setModels(null)
    setModels(await getLocalModels(target))
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
    if (!target) return
    const action = m.state === "loaded" ? "unload" : "load"
    setBusy(m.id)
    const result = await setLocalModel(target, action, m.id)
    setBusy(null)
    if (!result.ok) Alert.alert(t("localModel.failed"), result.error)
    void refresh()
  }

  if (!activeConnection) return null
  return (
    <View style={s.wrap} testID="local-model-bar">
      <Text style={s.heading}>{t("localModel.title")}</Text>
      {models === undefined ? <ActivityIndicator color={cyber.cyan} /> : null}
      {models?.length ? null : models === undefined ? null : <Text style={s.hint}>{t("localModel.unavailable")}</Text>}
      {models?.map((m) => {
        const loaded = m.state === "loaded"
        const working = busy === m.id || m.state === "loading"
        return (
          <View key={m.id} style={s.row}>
            <Ionicons name="hardware-chip-outline" size={16} color={loaded ? cyber.green : cyber.muted} />
            <View style={s.text}>
              <Text style={s.name} numberOfLines={1}>
                {modelLabel(m.id)}
              </Text>
              <Text style={[s.state, loaded && { color: cyber.green }]}>{t(`localModel.state.${working ? "loading" : m.state}`)}</Text>
            </View>
            {working ? (
              <ActivityIndicator size="small" color={cyber.cyan} />
            ) : (
              <TouchableOpacity style={[s.button, loaded && s.unload]} onPress={() => void toggle(m)} testID={`local-model-${loaded ? "unload" : "load"}`}>
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
  buttonText: { color: cyber.cyan, fontSize: 13, fontWeight: "600" },
})
