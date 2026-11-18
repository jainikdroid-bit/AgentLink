// Termux on this phone: a thin wrapper over the native TermuxRunner module (android/.../TermuxModule.kt).
// Absent on iOS, in tests and in old builds: every call then reports "unavailable" instead of throwing.
import { NativeModules, Platform } from "react-native"
import { clampTimeoutMs, shapeTermuxResult, type TermuxResult } from "./termux-pure"

interface TermuxNative {
  isInstalled(): Promise<boolean>
  hasPermission(): Promise<boolean>
  requestPermission(): Promise<boolean>
  run(command: string, cwd: string | null, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number; errCode: number; errmsg: string }>
}

const native: TermuxNative | undefined = Platform.OS === "android" ? (NativeModules.TermuxRunner as TermuxNative | undefined) : undefined

export type TermuxState = "unavailable" | "not-installed" | "no-permission" | "ready"

export async function termuxState(): Promise<TermuxState> {
  if (!native) return "unavailable"
  if (!(await native.isInstalled())) return "not-installed"
  return (await native.hasPermission()) ? "ready" : "no-permission"
}

export async function requestTermuxPermission(): Promise<boolean> {
  return native ? native.requestPermission() : false
}

export async function runInTermux(command: string, cwd: string, timeoutSec: string): Promise<TermuxResult> {
  if (!native) throw new Error("Termux is not available in this app build")
  const raw = await native.run(command, cwd || null, clampTimeoutMs(timeoutSec))
  return shapeTermuxResult(raw)
}
