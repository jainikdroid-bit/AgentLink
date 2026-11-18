// Pure logic of the "Set up Termux" wizard (no React Native imports, unit-tested): choosing the right APK from the
// GitHub release, reading its checksum file, and working out which wizard step the user is on.

export const TERMUX_RELEASE_API = "https://api.github.com/repos/termux/termux-app/releases/latest"
export const TERMUX_RELEASE_PAGE = "https://github.com/termux/termux-app/releases/latest"

export interface ReleaseAsset {
  name: string
  browser_download_url: string
  size?: number
}

export interface ReleaseInfo {
  tag_name?: string
  assets?: ReleaseAsset[]
}

/** The ABI part of "termux-app_v0.118.3+github-debug_arm64-v8a.apk", or null for other files. */
export function assetAbi(name: string): string | null {
  const m = /^termux-app_.+_([A-Za-z0-9-]+)\.apk$/.exec(name)
  return m ? m[1] : null
}

/** The first of the phone's ABIs (best first) that has an APK; the universal build when none does; null if no APK at all. */
export function pickAsset(assets: ReleaseAsset[], abis: string[]): ReleaseAsset | null {
  const byAbi = new Map<string, ReleaseAsset>()
  for (const a of assets) {
    const abi = assetAbi(a.name)
    if (abi && !byAbi.has(abi)) byAbi.set(abi, a)
  }
  for (const abi of abis) {
    const hit = byAbi.get(abi)
    if (hit) return hit
  }
  return byAbi.get("universal") ?? null
}

/** Lines "<sha256>  <filename>" (also "*filename" from binary mode) into filename -> lowercase sha256. */
export function parseSha256s(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line.trim())
    if (m) out.set(m[2], m[1].toLowerCase())
  }
  return out
}

/** The checksum file of the release (any asset named "...sha256sums"), if present. */
export function findChecksumAsset(assets: ReleaseAsset[]): ReleaseAsset | null {
  return assets.find((a) => /sha256sums?$/i.test(a.name)) ?? null
}

/** "v0.118.3" -> "0.118.3". */
export function versionLabel(tag: string | undefined): string {
  return (tag ?? "").replace(/^v/i, "")
}

export function formatSize(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return ""
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Whole percent for a progress bar; 0 when the total is unknown. */
export function progressPercent(received: number, total: number): number {
  if (!(total > 0) || !(received > 0)) return 0
  return Math.min(100, Math.floor((received / total) * 100))
}

export interface ReleasePlan {
  version: string
  asset: ReleaseAsset
  sizeBytes: number | undefined
  checksumUrl: string
}

/** Everything needed to start a download, or null when the release has no fitting APK or no checksum file. */
export function planRelease(release: ReleaseInfo, abis: string[]): ReleasePlan | null {
  const assets = release.assets ?? []
  const asset = pickAsset(assets, abis)
  const sums = findChecksumAsset(assets)
  if (!asset || !sums) return null
  return { version: versionLabel(release.tag_name), asset, sizeBytes: asset.size, checksumUrl: sums.browser_download_url }
}

export type WizardStepId = "install" | "open" | "allow" | "permission" | "test"
export const WIZARD_STEPS: WizardStepId[] = ["install", "open", "allow", "permission", "test"]
export type StepStatus = "done" | "current" | "todo"

export interface WizardInput {
  installed: boolean
  /** The user confirmed that Termux was opened and finished its first start. Unknown counts as not verified. */
  termuxOpenedOnce?: boolean | null
  /** The user confirmed that the allow-external-apps line was pasted in Termux. Unknown counts as not verified. */
  allowDone?: boolean | null
  permission: boolean
  lastTest: "ok" | "failed" | null
}

/** Status of each step. A passing test proves steps 2-4, so they are all done then. */
export function wizardStatuses(input: WizardInput): Record<WizardStepId, StepStatus> {
  const proven = input.installed && input.permission && input.lastTest === "ok"
  const done: Record<WizardStepId, boolean> = {
    install: input.installed,
    open: input.installed && (proven || input.termuxOpenedOnce === true),
    allow: input.installed && (proven || input.allowDone === true),
    permission: input.installed && input.permission,
    test: proven,
  }
  const statuses = {} as Record<WizardStepId, StepStatus>
  let currentTaken = false
  for (const id of WIZARD_STEPS) {
    if (done[id]) statuses[id] = "done"
    else if (!currentTaken) {
      statuses[id] = "current"
      currentTaken = true
    } else statuses[id] = "todo"
  }
  return statuses
}

/** The step the user should work on now, or "done" when everything passed. */
export function wizardStep(input: WizardInput): WizardStepId | "done" {
  const statuses = wizardStatuses(input)
  return WIZARD_STEPS.find((id) => statuses[id] === "current") ?? "done"
}

/** Which step to revisit after a failed test, judged from the error text or code; null when it is unclear. */
export function failureStep(error: { code?: string; message?: string } | string | null | undefined): WizardStepId | null {
  const code = typeof error === "object" && error ? (error.code ?? "") : ""
  const msg = (typeof error === "string" ? error : (error?.message ?? "")).toLowerCase()
  if (code === "not_installed") return "install"
  if (code === "no_permission" || msg.includes("permission denied") || msg.includes("may not run commands")) return "permission"
  if (msg.includes("allow-external-apps") || msg.includes("allow_external_apps") || msg.includes("external apps")) return "allow"
  if (code === "timeout" || msg.includes("did not answer")) return "open"
  return null
}
