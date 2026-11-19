// Local model control for the launcher: is the llama.cpp server (router mode) up, which models does it
// know, which are loaded in memory, and load/unload one. The phone calls the launcher (password checked
// there); this module only talks to the model server on the computer itself.
//   GET  <base>/v1/models          -> { data: [{ id, status: { value: "loaded" | "unloaded" | "loading" } }] }
//   POST <base>/models/load|unload -> { success: true }
'use strict'

const DEFAULT_BASE = process.env.OPENCODE_CONNECT_LLM_URL || 'http://127.0.0.1:8080'
const STATUS_TIMEOUT_MS = 3000
const ACTION_TIMEOUT_MS = 120_000 // loading a big model from disk can take a minute

async function call(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

/** { available: false } when no model server answers; otherwise the models and their memory state. */
async function llmStatus({ fetchImpl = fetch, base = DEFAULT_BASE } = {}) {
  try {
    const { status, body } = await call(fetchImpl, `${base}/v1/models`, { method: 'GET' }, STATUS_TIMEOUT_MS)
    if (status !== 200 || !body || !Array.isArray(body.data)) return { available: false }
    const models = body.data
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({ id: m.id, state: m.status && typeof m.status.value === 'string' ? m.status.value : 'unknown' }))
    return { available: true, models }
  } catch {
    return { available: false }
  }
}

/** Loads or unloads one model. Only ids the server itself reports are accepted. */
async function llmAction(action, model, { fetchImpl = fetch, base = DEFAULT_BASE } = {}) {
  if (action !== 'load' && action !== 'unload') return { ok: false, error: 'unknown action' }
  const current = await llmStatus({ fetchImpl, base })
  if (!current.available) return { ok: false, error: 'no model server' }
  if (!current.models.some((m) => m.id === model)) return { ok: false, error: 'unknown model' }
  try {
    const { status, body } = await call(fetchImpl, `${base}/models/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }, ACTION_TIMEOUT_MS)
    if (status >= 200 && status < 300 && (!body || body.success !== false)) return { ok: true }
    return { ok: false, error: (body && (body.error && (body.error.message || body.error))) || `model server answered ${status}` }
  } catch (error) {
    return { ok: false, error: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || error) }
  }
}

module.exports = { llmStatus, llmAction, DEFAULT_BASE }
