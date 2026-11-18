// Device half of the "Set up Termux" wizard: a thin wrapper over the native TermuxInstaller module
// (android/.../TermuxInstaller.kt) plus the GitHub release lookup. Absent on iOS and in old builds.
import { DeviceEventEmitter, NativeModules, Platform } from "react-native"
import { TERMUX_RELEASE_API, findChecksumAsset, parseSha256s, planRelease, type ReleaseInfo, type ReleasePlan } from "./termux-install"

interface InstallerNative {
  deviceAbis(): Promise<string[]>
  launchTermux(): Promise<boolean>
  canInstallApps(): Promise<boolean>
  openInstallSettings(): Promise<boolean>
  downloadApk(url: string, sha256: string, fileName: string): Promise<string>
  cancelDownload(): Promise<boolean>
  installApk(path: string): Promise<boolean>
}

const native: InstallerNative | undefined = Platform.OS === "android" ? (NativeModules.TermuxInstaller as InstallerNative | undefined) : undefined

export const installerAvailable = !!native

const need = (): InstallerNative => {
  if (!native) throw new Error("Termux setup is not available in this app build")
  return native
}

export const deviceAbis = () => need().deviceAbis()
export const launchTermux = () => (native ? native.launchTermux() : Promise.resolve(false))
export const canInstallApps = () => need().canInstallApps()
export const openInstallSettings = () => need().openInstallSettings()
export const cancelDownload = () => (native ? native.cancelDownload() : Promise.resolve(false))
export const installApk = (path: string) => need().installApk(path)

export interface DownloadProgress {
  received: number
  total: number
}

/** Downloads the APK of the plan into the app cache (checksum verified natively) and returns its path. */
export async function downloadPlan(plan: ReleasePlan, onProgress: (p: DownloadProgress) => void): Promise<string> {
  const n = need()
  const sums = parseSha256s(await fetchText(plan.checksumUrl))
  const sha = sums.get(plan.asset.name)
  if (!sha) throw new Error("The release has no checksum for this file")
  const sub = DeviceEventEmitter.addListener("TermuxDownloadProgress", (e: DownloadProgress) => onProgress(e))
  try {
    return await n.downloadApk(plan.asset.browser_download_url, sha, plan.asset.name)
  } finally {
    sub.remove()
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

/** Latest Termux release on GitHub and the file that fits this phone; throws when GitHub cannot be reached. */
export async function loadReleasePlan(): Promise<ReleasePlan> {
  const res = await fetch(TERMUX_RELEASE_API, { headers: { Accept: "application/vnd.github+json" } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const release = (await res.json()) as ReleaseInfo
  const abis = native ? await native.deviceAbis() : []
  const plan = planRelease(release, abis)
  if (!plan || !findChecksumAsset(release.assets ?? [])) throw new Error("No fitting Termux file in the latest release")
  return plan
}
