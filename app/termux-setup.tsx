import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, AppState, ActivityIndicator } from "react-native"
import { router, useFocusEffect } from "expo-router"
import AsyncStorage from "@react-native-async-storage/async-storage"
import * as Clipboard from "expo-clipboard"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { cyber } from "../src/theme/cyber"
import { requestTermuxPermission, runInTermux, termuxState, type TermuxState } from "../src/lib/termux"
import { ALLOW_EXTERNAL_APPS } from "../src/lib/termux-pure"
import {
  TERMUX_RELEASE_PAGE,
  WIZARD_STEPS,
  failureStep,
  formatSize,
  progressPercent,
  wizardStatuses,
  type ReleasePlan,
  type StepStatus,
  type WizardStepId,
} from "../src/lib/termux-install"
import {
  canInstallApps,
  cancelDownload,
  downloadPlan,
  installApk,
  installerAvailable,
  launchTermux,
  loadReleasePlan,
  openInstallSettings,
  type DownloadProgress,
} from "../src/lib/termux-installer"

const FLAGS_KEY = "oc_termux_setup"
const TEST_COMMAND = 'echo "AgentLink OK" && uname -m'
const TEST_TIMEOUT_SEC = "20"

interface Flags {
  opened: boolean
  allowed: boolean
}

type Test = { kind: "idle" } | { kind: "running" } | { kind: "ok"; output: string } | { kind: "failed"; error: string; revisit: WizardStepId | null }

const errorText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

// "Set up Termux" wizard: install Termux from its GitHub release, open it once, allow other apps to run commands,
// give this app the permission, then run a test command. Every step re-checks its state when the screen gets focus
// and when the app comes back from Android's installer / Termux.
export default function TermuxSetupScreen() {
  const { t } = useTranslation()
  const [state, setState] = useState<TermuxState | null>(null)
  const [flags, setFlags] = useState<Flags>({ opened: false, allowed: false })
  const [plan, setPlan] = useState<ReleasePlan | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [progress, setProgress] = useState<DownloadProgress | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [needsInstallPermission, setNeedsInstallPermission] = useState(false)
  const [copied, setCopied] = useState(false)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [test, setTest] = useState<Test>({ kind: "idle" })
  const downloading = useRef(false)

  const installed = state === "no-permission" || state === "ready"
  const permission = state === "ready"

  const refresh = useCallback(() => {
    termuxState().then(setState).catch(() => setState("unavailable"))
  }, [])

  const saveFlags = useCallback((next: Flags) => {
    setFlags(next)
    void AsyncStorage.setItem(FLAGS_KEY, JSON.stringify(next)).catch(() => {})
  }, [])

  useEffect(() => {
    AsyncStorage.getItem(FLAGS_KEY)
      .then((raw) => {
        if (!raw) return
        const parsed = JSON.parse(raw) as Partial<Flags>
        setFlags({ opened: parsed.opened === true, allowed: parsed.allowed === true })
      })
      .catch(() => {})
  }, [])

  useFocusEffect(refresh)
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return
      refresh()
      if (needsInstallPermission) {
        canInstallApps()
          .then((ok) => ok && setNeedsInstallPermission(false))
          .catch(() => {})
      }
    })
    return () => sub.remove()
  }, [refresh, needsInstallPermission])

  const lookUp = useCallback(() => {
    setLoadingPlan(true)
    setPlanError(null)
    loadReleasePlan()
      .then(setPlan)
      .catch((e) => setPlanError(errorText(e)))
      .finally(() => setLoadingPlan(false))
  }, [])

  useEffect(() => {
    if (state === "not-installed" && installerAvailable && !plan && !loadingPlan && !planError) lookUp()
  }, [state, plan, loadingPlan, planError, lookUp])

  useEffect(() => () => void cancelDownload().catch(() => {}), [])

  const download = async () => {
    if (!plan || downloading.current) return
    setInstallError(null)
    try {
      if (!(await canInstallApps())) {
        setNeedsInstallPermission(true)
        return
      }
      downloading.current = true
      setProgress({ received: 0, total: plan.sizeBytes ?? 0 })
      const path = await downloadPlan(plan, setProgress)
      setProgress(null)
      await installApk(path)
    } catch (e) {
      setProgress(null)
      const code = (e as { code?: string }).code
      if (code !== "cancelled") setInstallError(code === "checksum" ? t("termuxSetup.install.checksum") : t("termuxSetup.install.failed", { error: errorText(e) }))
    } finally {
      downloading.current = false
    }
  }

  const copyAllow = async () => {
    await Clipboard.setStringAsync(ALLOW_EXTERNAL_APPS)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const grant = async () => {
    const ok = await requestTermuxPermission().catch(() => false)
    setPermissionDenied(!ok)
    refresh()
  }

  const runTest = async () => {
    setTest({ kind: "running" })
    try {
      const r = await runInTermux(TEST_COMMAND, "", TEST_TIMEOUT_SEC)
      if (r.error) return setTest({ kind: "failed", error: r.error, revisit: failureStep(r.error) })
      if (r.exitCode !== 0 || !r.stdout.includes("AgentLink OK")) {
        const detail = (r.stderr || r.stdout).trim() || `exit ${r.exitCode}`
        return setTest({ kind: "failed", error: detail, revisit: failureStep(detail) })
      }
      setTest({ kind: "ok", output: r.stdout.trim().replace(/\s+/g, " ") })
    } catch (e) {
      const err = e as { code?: string; message?: string }
      setTest({ kind: "failed", error: errorText(e), revisit: failureStep(err) })
    } finally {
      refresh()
    }
  }

  const lastTest = test.kind === "ok" ? "ok" : test.kind === "failed" ? "failed" : null
  const statuses = wizardStatuses({ installed, termuxOpenedOnce: flags.opened, allowDone: flags.allowed, permission, lastTest })
  const allDone = statuses.test === "done"
  const percent = progress ? progressPercent(progress.received, progress.total) : 0
  const stepNumber = (id: WizardStepId) => WIZARD_STEPS.indexOf(id) + 1

  const body = (id: WizardStepId): ReactNode => {
    switch (id) {
      case "install":
        if (installed) return <Text style={s.ok}>{t("termuxSetup.install.done")}</Text>
        return (
          <>
            <Text style={s.text}>{t("termuxSetup.install.body")}</Text>
            {!installerAvailable ? <Text style={s.warn}>{t("termuxSetup.unavailable")}</Text> : null}
            {loadingPlan ? <ActivityIndicator color={cyber.cyan} style={s.spinner} /> : null}
            {planError ? <Text style={s.warn}>{t("termuxSetup.install.loadFailed", { error: planError })}</Text> : null}
            {plan ? (
              <Text style={s.text}>{t("termuxSetup.install.version", { version: plan.version, size: formatSize(plan.sizeBytes) })}</Text>
            ) : null}
            {needsInstallPermission ? (
              <>
                <Text style={s.warn}>{t("termuxSetup.install.needPermission")}</Text>
                <Btn id="termux-install-settings" label={t("termuxSetup.install.openSettings")} onPress={() => void openInstallSettings().catch(() => {})} />
              </>
            ) : null}
            {progress ? (
              <>
                <View style={s.bar}>
                  <View style={[s.barFill, { width: `${percent}%` }]} />
                </View>
                <Text style={s.hint}>{t("termuxSetup.install.downloading", { percent })}</Text>
                <Btn id="termux-install-cancel" secondary label={t("termuxSetup.install.cancel")} onPress={() => void cancelDownload().catch(() => {})} />
              </>
            ) : plan ? (
              <Btn id="termux-install-download" label={t("termuxSetup.install.download")} onPress={() => void download()} />
            ) : planError ? (
              <Btn id="termux-install-retry" label={t("termuxSetup.install.retry")} onPress={lookUp} />
            ) : null}
            {installError ? <Text style={s.warn}>{installError}</Text> : null}
            <Text style={s.hint}>{t("termuxSetup.install.signatureNote")}</Text>
            <TouchableOpacity onPress={() => void Linking.openURL(TERMUX_RELEASE_PAGE)} testID="termux-release-page">
              <Text style={s.link}>{t("termuxSetup.install.releasePage")}</Text>
            </TouchableOpacity>
          </>
        )
      case "open":
        return (
          <>
            <Text style={s.text}>{t("termuxSetup.open.body")}</Text>
            <Btn id="termux-open" label={t("termuxSetup.open.button")} onPress={() => void launchTermux().catch(() => {})} disabled={!installed} />
            {statuses.open !== "done" ? (
              <Btn id="termux-open-done" secondary label={t("termuxSetup.open.confirm")} onPress={() => saveFlags({ ...flags, opened: true })} disabled={!installed} />
            ) : (
              <Text style={s.ok}>{t("termuxSetup.open.done")}</Text>
            )}
          </>
        )
      case "allow":
        return (
          <>
            <Text style={s.text}>{t("termuxSetup.allow.body")}</Text>
            <Text style={s.code} selectable>{ALLOW_EXTERNAL_APPS}</Text>
            <Btn id="termux-allow-copy" label={copied ? t("termuxSetup.allow.copied") : t("termuxSetup.allow.copy")} onPress={() => void copyAllow()} />
            <Btn id="termux-allow-open" secondary label={t("termuxSetup.open.button")} onPress={() => void launchTermux().catch(() => {})} disabled={!installed} />
            {statuses.allow !== "done" ? (
              <Btn id="termux-allow-done" secondary label={t("termuxSetup.allow.confirm")} onPress={() => saveFlags({ ...flags, allowed: true })} disabled={!installed} />
            ) : (
              <Text style={s.ok}>{t("termuxSetup.allow.done")}</Text>
            )}
          </>
        )
      case "permission":
        return (
          <>
            <Text style={s.text}>{t("termuxSetup.permission.body")}</Text>
            {permission ? (
              <Text style={s.ok}>{t("termuxSetup.permission.done")}</Text>
            ) : (
              <Btn id="termux-grant" label={t("termuxSetup.permission.button")} onPress={() => void grant()} disabled={!installed} />
            )}
            {permissionDenied && !permission ? <Text style={s.warn}>{t("termuxSetup.permission.denied")}</Text> : null}
          </>
        )
      case "test":
        return (
          <>
            <Text style={s.text}>{t("termuxSetup.test.body")}</Text>
            <Btn
              id="termux-test"
              label={test.kind === "running" ? t("termuxSetup.test.running") : t("termuxSetup.test.button")}
              onPress={() => void runTest()}
              disabled={!permission || test.kind === "running"}
            />
            {test.kind === "running" ? <ActivityIndicator color={cyber.cyan} style={s.spinner} /> : null}
            {test.kind === "ok" ? <Text style={s.ok}>{t("termuxSetup.test.ok", { output: test.output })}</Text> : null}
            {test.kind === "failed" ? (
              <>
                <Text style={s.warn}>{t("termuxSetup.test.failed", { error: test.error })}</Text>
                <Text style={s.hint}>
                  {test.revisit ? t("termuxSetup.test.revisit", { n: stepNumber(test.revisit), name: t(`termuxSetup.${test.revisit}.title`) }) : t("termuxSetup.test.generic")}
                </Text>
              </>
            ) : null}
          </>
        )
    }
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} testID="termux-setup-screen">
      <Text style={s.intro}>{t("termuxSetup.intro")}</Text>
      {WIZARD_STEPS.map((id) => (
        <StepCard key={id} n={stepNumber(id)} title={t(`termuxSetup.${id}.title`)} status={statuses[id]}>
          {body(id)}
        </StepCard>
      ))}
      <View style={[s.card, allDone && s.cardDone]}>
        <Text style={s.cardTitle}>{t("termuxSetup.finish.title")}</Text>
        <Text style={s.text}>{t("termuxSetup.finish.body")}</Text>
        <Btn id="termux-to-settings" secondary label={t("termuxSetup.finish.settings")} onPress={() => router.navigate("/settings")} />
      </View>
    </ScrollView>
  )
}

function Btn({ label, onPress, id, secondary, disabled }: { label: string; onPress: () => void; id: string; secondary?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity style={[s.btn, secondary && s.btnSecondary, disabled && s.btnDisabled]} onPress={onPress} disabled={disabled} testID={id}>
      <Text style={[s.btnText, secondary && s.btnTextSecondary]}>{label}</Text>
    </TouchableOpacity>
  )
}

function StepCard({ n, title, status, children }: { n: number; title: string; status: StepStatus; children: ReactNode }) {
  const icon = status === "done" ? "checkmark-circle" : status === "current" ? "radio-button-on" : "ellipse-outline"
  const color = status === "done" ? cyber.green : status === "current" ? cyber.cyan : cyber.border
  return (
    <View style={[s.card, status === "current" && s.cardCurrent, status === "todo" && s.cardTodo]}>
      <View style={s.cardHead}>
        <Ionicons name={icon} size={22} color={color} />
        <Text style={[s.cardTitle, status === "todo" && s.muted]}>{`${n}. ${title}`}</Text>
      </View>
      {status === "todo" ? null : <View style={s.cardBody}>{children}</View>}
    </View>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: cyber.bg },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  intro: { color: cyber.muted, fontSize: 14, lineHeight: 20 },
  card: { backgroundColor: cyber.surface, borderRadius: 10, borderWidth: 1, borderColor: cyber.border, padding: 14, gap: 10 },
  cardCurrent: { borderColor: cyber.cyan },
  cardDone: { borderColor: cyber.green },
  cardTodo: { opacity: 0.6 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { color: cyber.text, fontSize: 16, fontWeight: "700", flexShrink: 1 },
  cardBody: { gap: 10 },
  muted: { color: cyber.muted },
  text: { color: cyber.text, fontSize: 14, lineHeight: 20 },
  hint: { color: cyber.muted, fontSize: 12, lineHeight: 17 },
  ok: { color: cyber.green, fontSize: 14, lineHeight: 20 },
  warn: { color: cyber.amber, fontSize: 13, lineHeight: 19 },
  link: { color: cyber.cyan, fontSize: 13, fontWeight: "600" },
  spinner: { alignSelf: "flex-start" },
  code: { color: cyber.green, fontSize: 11, fontFamily: cyber.mono, backgroundColor: cyber.surface2, padding: 8, borderRadius: 6 },
  btn: { backgroundColor: cyber.cyan, borderRadius: 8, height: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: cyber.cyan },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: cyber.bg, fontWeight: "700", fontSize: 14 },
  btnTextSecondary: { color: cyber.cyan },
  bar: { height: 8, borderRadius: 4, backgroundColor: cyber.surface2, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: cyber.cyan },
})
