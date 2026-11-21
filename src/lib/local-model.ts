// The local model on the computer (llama.cpp behind the launcher's /llm routes): pure parsing.
export type ModelState = "loaded" | "unloaded" | "loading" | "unloading" | "unknown"

export interface LocalModel {
  id: string
  state: ModelState
}

/** null when the launcher has no /llm route (older install) or no model server runs. */
export function parseLocalModels(status: number, body: unknown): LocalModel[] | null {
  if (status !== 200 || !body || typeof body !== "object") return null
  const b = body as { available?: unknown; models?: unknown }
  if (b.available !== true || !Array.isArray(b.models)) return null
  return b.models
    .filter((m): m is { id: string; state?: unknown } => !!m && typeof (m as { id?: unknown }).id === "string")
    .map((m) => ({
      id: m.id,
      state: m.state === "loaded" || m.state === "unloaded" || m.state === "loading" || m.state === "unloading"
        ? m.state : "unknown",
    }))
}

/** Short display name: "qwen36-free" stays, "org/Model-7B-Q4_K_M.gguf" -> "Model-7B-Q4_K_M". */
export function modelLabel(id: string): string {
  const last = id.split(/[\/]/).pop() || id
  return last.replace(/\.gguf$/i, "")
}

/** A successful launcher response means the request was accepted. Wait for the router's state. */
export async function waitForLocalModelState(
  read: () => Promise<LocalModel[] | null>,
  id: string,
  expected: "loaded" | "unloaded",
  signal: AbortSignal,
  { timeoutMs = expected === "unloaded" ? 30_000 : 120_000, intervalMs = 500 } = {},
): Promise<LocalModel[] | null> {
  const deadline = Date.now() + timeoutMs
  while (!signal.aborted) {
    const models = await read()
    if (signal.aborted) return null
    if (models?.some((model) => model.id === id && model.state === expected)) return models
    const remaining = deadline - Date.now()
    if (remaining <= 0) return null
    await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)))
  }
  return null
}
