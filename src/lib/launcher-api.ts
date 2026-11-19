// Talks to the launcher on the computer (tools/launcher.js). The launcher only starts, stops and reports the
// opencode server; it needs the same password as the server.
import { buildRequestHeaders } from "./headers"
import { interpretLauncherStatus, interpretStart, launcherUrl, type LauncherProbe, type StartOutcome } from "./launcher"
import { routeUrl } from "./tailnet"
import { parseLocalModels } from "./local-model"

export interface LauncherTarget {
  serverUrl: string
  launcherPort: number
  auth?: { username: string; password: string }
  /** tunnel mode: launcher lives under /__oc/launcher on the one public address */
  tunnel?: boolean
}

const START_TIMEOUT_MS = 45_000 // the launcher waits up to 30 s for the server to answer

export async function startServerFromPhone(target: LauncherTarget): Promise<StartOutcome> {
  const base = launcherUrl(target.serverUrl, target.launcherPort, target.tunnel)
  if (!base) return { kind: "failed", reason: "error", detail: "bad launcher address" }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), START_TIMEOUT_MS)
  try {
    const response = await fetch(await routeUrl(`${base}/start`), {
      method: "POST",
      headers: buildRequestHeaders({ auth: target.auth }),
      signal: controller.signal,
    })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* keep null */
    }
    return interpretStart(response.status, body)
  } catch (error) {
    return { kind: "failed", reason: "unreachable", detail: error instanceof Error ? error.message : String(error) }
  } finally {
    clearTimeout(timer)
  }
}

const STATUS_TIMEOUT_MS = 4_000

/** Cheap check of the launcher (GET /status): does the computer's launcher answer, and is the server behind it up? */
export async function probeLauncher(target: LauncherTarget): Promise<LauncherProbe> {
  const base = launcherUrl(target.serverUrl, target.launcherPort, target.tunnel)
  if (!base) return { kind: "unreachable" }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)
  try {
    const response = await fetch(await routeUrl(`${base}/status`), {
      headers: buildRequestHeaders({ auth: target.auth }),
      signal: controller.signal,
    })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* keep null */
    }
    return interpretLauncherStatus(response.status, body)
  } catch {
    return { kind: "unreachable" }
  } finally {
    clearTimeout(timer)
  }
}

const LLM_STATUS_TIMEOUT_MS = 5_000
const LLM_ACTION_TIMEOUT_MS = 130_000 // loading a big model from disk can take a minute or two

async function launcherJson(target: LauncherTarget, route: string, init: { method: "GET" | "POST"; body?: unknown }, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  const base = launcherUrl(target.serverUrl, target.launcherPort, target.tunnel)
  if (!base) return { status: 0, body: null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(await routeUrl(`${base}${route}`), {
      method: init.method,
      headers: { ...buildRequestHeaders({ auth: target.auth }), ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    })
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      /* keep null */
    }
    return { status: response.status, body }
  } catch {
    return { status: 0, body: null }
  } finally {
    clearTimeout(timer)
  }
}

/** Models of the local model server on the computer, or null (no model server / older launcher / unreachable). */
export async function getLocalModels(target: LauncherTarget) {
  const { status, body } = await launcherJson(target, "/llm", { method: "GET" }, LLM_STATUS_TIMEOUT_MS)
  return parseLocalModels(status, body)
}

/** Loads a model into, or unloads it from, the computer's memory. */
export async function setLocalModel(target: LauncherTarget, action: "load" | "unload", model: string): Promise<{ ok: boolean; error?: string }> {
  const { status, body } = await launcherJson(target, `/llm/${action}`, { method: "POST", body: { model } }, LLM_ACTION_TIMEOUT_MS)
  const b = (body ?? {}) as { ok?: boolean; error?: string }
  return status === 200 && b.ok ? { ok: true } : { ok: false, error: b.error || (status ? `HTTP ${status}` : "unreachable") }
}
