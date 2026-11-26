import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from "react-native"
import { router, useFocusEffect } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import * as SecureStore from "expo-secure-store"
import { useTranslation } from "react-i18next"
import { useTheme, useThemedStyles } from "../src/theme/useTheme"
import { cyber } from "../src/theme/cyber"
import { useConnections } from "../src/stores/connections"
import { AcpApiError, listAgents, getHostHardware, type HostHardware, type AgentInfo, type RunningAgent } from "../src/lib/acp/api"

const FOLDER_KEY = "acp_last_folder"

// Other coding agents on the computer: the ones installed there (Claude Code, Codex, Gemini CLI, Cursor, ...),
// the ones already running, which can be reopened where they were left, and the supported ones not installed yet.
export default function AgentsScreen() {
  const palette = useTheme()
  const s = useThemedStyles(baseStyles)
  const { t } = useTranslation()
  const { activeConnection, clientBase } = useConnections()
  const target = useMemo(
    () =>
      activeConnection?.launcherPort
        ? { serverUrl: activeConnection.url, launcherPort: activeConnection.launcherPort, auth: clientBase?.auth, tunnel: !!activeConnection.tunnelTopic }
        : null,
    [activeConnection, clientBase],
  )
  const [agents, setAgents] = useState<AgentInfo[]>([])
  const [missing, setMissing] = useState<AgentInfo[]>([])
  const [hardware, setHardware] = useState<HostHardware | null>(null)
  const [running, setRunning] = useState<RunningAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [folder, setFolder] = useState("")

  const requestId = useRef(0)
  const inFlight = useRef<object|null>(null)
  useEffect(() => { setHardware(null); setAgents([]); setMissing([]); setRunning([]); setProblem(null) }, [target])
  const targetRef = useRef(target)
  targetRef.current = target
  const load = useCallback(async (silent = false) => {
    if (!target) { setAgents([]); setMissing([]); setRunning([]); setLoading(false); return }
    if (silent && inFlight.current) return
    const ticket = {}
    inFlight.current=ticket
    const id = ++requestId.current
    const current = () => id === requestId.current && targetRef.current === target
    if (!silent) { setLoading(true); setProblem(null) }
    try {
      void getHostHardware(target).then(value => { if (current()) setHardware(value) }).catch(() => { if (current()) setHardware(null) })
      const result = await listAgents(target)
      if (!current()) return
      setProblem(null)
      setAgents(result.agents.filter((a) => a.installed))
      setMissing(result.agents.filter((a) => !a.installed))
      setRunning(result.running.filter((r) => !r.exited))
    } catch (error) {
      if (!current()) return
      setAgents([]); setRunning([]); setMissing([])
      setProblem(error instanceof AcpApiError && error.outdated ? t("acp.outdated") : t("acp.unreachable"))
    } finally {
      if (inFlight.current===ticket) inFlight.current=null
      if (current()) setLoading(false)
    }
  }, [target, t])

  // Every time the screen comes back to the front (from a chat, say): the running list may have changed.
  useFocusEffect(
    useCallback(() => {
      void load()
      const timer = setInterval(() => void load(true), 15_000)
      return () => { clearInterval(timer); requestId.current++ }
    }, [load]),
  )
  useEffect(() => {
    let alive=true
    setFolder(activeConnection?.directory || "")
    if(activeConnection?.id)void SecureStore.getItemAsync(FOLDER_KEY+"_"+activeConnection.id).then(saved=>{if(alive&&saved)setFolder(saved)}).catch(()=>undefined)
    return()=>{alive=false}
  }, [activeConnection?.id])

  const open = (agent: AgentInfo) => {
    if (loading || !target || !activeConnection?.id) return
    const cwd = folder.trim()
    void SecureStore.setItemAsync(FOLDER_KEY+"_"+activeConnection.id, cwd).catch(() => undefined)
    router.push({ pathname: "/agent-chat", params: { agent: agent.id, name: agent.name, cwd, connectionId: activeConnection?.id || "" } })
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" testID="agents-screen">
      <TouchableOpacity style={s.card} onPress={() => router.push("/workspace")}>
        <Ionicons name="git-branch-outline" size={24} color={palette.cyan}/><Text style={s.cardTitle}>AgentLink Workspace</Text>
      </TouchableOpacity>
      <Text style={s.body}>{t("acp.intro")}</Text>
      {hardware && <View style={s.card}>
        <Ionicons name="hardware-chip-outline" size={24} color={palette.cyan} />
        <View style={s.cardText}>
          <Text style={s.cardTitle}>{hardware.cpu.model || hardware.arch} · {hardware.platform}</Text>
          <Text style={s.cardSub}>CPU {hardware.cpu.percent === null ? "—" : `${hardware.cpu.percent.toFixed(1)}%`} · {hardware.cpu.logicalCores}×</Text>
          <Text style={s.cardSub}>RAM {((hardware.memory.totalBytes - hardware.memory.availableBytes) / 1024 ** 3).toFixed(1)} / {(hardware.memory.totalBytes / 1024 ** 3).toFixed(1)} GiB</Text>
          {hardware.storage && <Text style={s.cardSub}>SSD/HDD {((hardware.storage.totalBytes - hardware.storage.availableBytes) / 1024 ** 3).toFixed(1)} / {(hardware.storage.totalBytes / 1024 ** 3).toFixed(1)} GiB</Text>}
          {hardware.gpu?.length ? hardware.gpu.map((g,i)=><Text key={i} style={s.cardSub}>{g.name} · GPU {g.percent??"—"}% · VRAM {g.memoryUsedMiB??"—"}/{g.memoryTotalMiB??"—"} MiB · {g.temperatureC??"—"} °C</Text>) : <Text style={s.cardSub}>GPU — · °C —</Text>}
          <Text style={s.cardSub}>{new Date(hardware.at).toLocaleTimeString()}</Text>
        </View>
      </View>}

      {running.length > 0 ? (
        <>
          <Text style={s.section}>{t("acp.running")}</Text>
          {running.map((r) => (
            <TouchableOpacity key={r.id} disabled={loading||!target} style={s.card} onPress={() => router.push({ pathname: "/agent-chat", params: { agent: r.agent, name: r.name, cwd: r.cwd, id: r.id, connectionId: activeConnection?.id || "" } })} testID="acp-running">
              <Ionicons name="pulse-outline" size={20} color={palette.green} />
              <View style={s.cardText}>
                <Text style={s.cardTitle}>{r.name}</Text>
                <Text style={s.cardSub} numberOfLines={1}>{r.cwd}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={palette.muted} />
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      <Text style={s.section}>{t("acp.folderLabel")}</Text>
      <TextInput style={s.input} value={folder} onChangeText={setFolder} placeholder={t("acp.folderHint")} placeholderTextColor={palette.muted} autoCapitalize="none" autoCorrect={false} testID="acp-folder" />

      <View style={s.sectionRow}>
        <Text style={s.section}>{t("acp.installed")}</Text>
        {loading ? <ActivityIndicator size="small" color={palette.cyan} /> : (
          <TouchableOpacity onPress={() => void load()} testID="acp-refresh"><Text style={s.link}>{t("acp.refresh")}</Text></TouchableOpacity>
        )}
      </View>
      {problem ? <Text style={s.problem}>{problem}</Text> : null}
      {!problem && !loading && agents.length === 0 ? <Text style={s.body}>{t("acp.none")}</Text> : null}
      {agents.map((agent) => (
        <TouchableOpacity key={agent.id} style={s.card} onPress={() => open(agent)} testID={`acp-agent-${agent.id}`}>
          <Ionicons name="sparkles-outline" size={20} color={palette.cyan} />
          <View style={s.cardText}><Text style={s.cardTitle}>{agent.name}</Text></View>
          <Text style={s.start}>{t("acp.start")}</Text>
        </TouchableOpacity>
      ))}

      {missing.length > 0 && !problem ? (
        <>
          <Text style={s.section}>{t("acp.notInstalled")}</Text>
          <Text style={s.body}>{t("acp.notInstalledHint")}</Text>
          <View style={s.chips}>
            {missing.map((agent) => (
              <View key={agent.id} style={s.chip} testID={`acp-missing-${agent.id}`}>
                <Text style={s.chipText}>{agent.name}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </ScrollView>
  )
}

const baseStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: cyber.bg },
  content: { padding: 20, gap: 10 },
  body: { color: cyber.muted, fontSize: 14, lineHeight: 20 },
  problem: { color: cyber.red, fontSize: 14, lineHeight: 20 },
  section: { color: cyber.text, fontSize: 13, fontWeight: "600", marginTop: 10 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
  link: { color: cyber.cyan, fontSize: 14 },
  input: { height: 48, borderRadius: 10, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface, color: cyber.text, paddingHorizontal: 14, fontSize: 15 },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: cyber.border, backgroundColor: cyber.surface },
  cardText: { flex: 1, gap: 2 },
  cardTitle: { color: cyber.text, fontSize: 15, fontWeight: "600" },
  cardSub: { color: cyber.muted, fontSize: 12, fontFamily: cyber.mono },
  start: { color: cyber.cyan, fontSize: 14, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: cyber.border },
  chipText: { color: cyber.muted, fontSize: 13 },
})
