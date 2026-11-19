// The local model on the computer (llama.cpp behind the launcher's /llm routes): pure parsing.
export type ModelState = "loaded" | "unloaded" | "loading" | "unknown"

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
    .map((m) => ({ id: m.id, state: m.state === "loaded" || m.state === "unloaded" || m.state === "loading" ? m.state : "unknown" }))
}

/** Short display name: "qwen36-free" stays, "org/Model-7B-Q4_K_M.gguf" -> "Model-7B-Q4_K_M". */
export function modelLabel(id: string): string {
  const last = id.split(/[\/]/).pop() || id
  return last.replace(/\.gguf$/i, "")
}
