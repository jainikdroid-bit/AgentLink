import { useRef, useState } from "react"
import { Alert, Linking } from "react-native"
import { useTranslation } from "react-i18next"
import { canInstallApps, deviceAbis, downloadVerifiedApk, installAppUpdate, installerAvailable, openInstallSettings } from "./termux-installer"
import { selectUpdateApk, type AvailableUpdate } from "./update-check-policy"

let updateInProgress = false
let attemptedVersion: string | undefined

export async function tryAutomaticUpdate(update: AvailableUpdate, canInstallNow: () => boolean) {
  if (!installerAvailable || updateInProgress || attemptedVersion === update.version || !canInstallNow()) return
  updateInProgress = true
  try {
    if (!(await canInstallApps())) return
    const apk = selectUpdateApk(update, await deviceAbis())
    if (!apk || !canInstallNow()) return
    attemptedVersion = update.version
    const path = await downloadVerifiedApk(apk.url, apk.sha256, apk.name)
    if (!canInstallNow()) {
      attemptedVersion = undefined
      return
    }
    await installAppUpdate(path)
  } catch {
    // The regular update banner still offers the manual installer after a failure.
  } finally {
    updateInProgress = false
  }
}

export function useAppUpdate() {
  const { t } = useTranslation()
  const active = useRef(false)
  const [busy, setBusy] = useState(false)
  async function openUpdate(update: AvailableUpdate) {
    if (active.current || updateInProgress) return
    active.current = true
    updateInProgress = true
    setBusy(true)
    try {
      const apk = installerAvailable ? selectUpdateApk(update, await deviceAbis()) : undefined
      if (!apk) {
        await Linking.openURL("https://github.com/jainikdroid-bit/AgentLink/releases/latest")
        return
      }
      if (!(await canInstallApps())) {
        Alert.alert(t("update.permission"), t("update.retry"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("update.settings"), onPress: () => { void openInstallSettings().catch(() => Alert.alert(t("update.failed"))) } },
        ])
        return
      }
      const path = await downloadVerifiedApk(apk.url, apk.sha256, apk.name)
      if (!(await installAppUpdate(path))) throw new Error("Android installer unavailable")
    } catch {
      Alert.alert(t("update.failed"))
    } finally {
      active.current = false
      updateInProgress = false
      setBusy(false)
    }
  }
  return { openUpdate, busy }
}
