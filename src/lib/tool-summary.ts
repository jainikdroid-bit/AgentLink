// Counting and grouping the agent's actions (tool calls) so a long run folds into one line.

export interface ToolCount {
  name: string
  count: number
}

/** Tool names with how often each occurs, in order of first appearance. */
export function countTools(names: readonly (string | undefined)[]): ToolCount[] {
  const order: string[] = []
  const counts = new Map<string, number>()
  for (const raw of names) {
    const name = raw && raw.trim() ? raw.trim() : "tool"
    if (!counts.has(name)) order.push(name)
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  return order.map((name) => ({ name, count: counts.get(name) as number }))
}

/** "bash ×3, edit ×2, read" — at most `max` names, the rest as "+N". */
export function summarizeTools(names: readonly (string | undefined)[], max = 3): string {
  const counts = countTools(names)
  const shown = counts.slice(0, max).map((c) => (c.count > 1 ? `${c.name} ×${c.count}` : c.name))
  const rest = counts.length - max
  return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ")
}

export type Grouped<T> = { kind: "item"; item: T } | { kind: "group"; id: string; items: T[] }

/**
 * Folds runs of consecutive items that match `isTool` into one group. A run of a single tool
 * is also a group, so the chat looks the same however many actions the agent took.
 */
export function groupConsecutive<T extends { id: string }>(items: readonly T[], isTool: (item: T) => boolean): Grouped<T>[] {
  const out: Grouped<T>[] = []
  let run: T[] = []
  const flush = () => {
    if (run.length > 0) out.push({ kind: "group", id: `group:${run[0].id}`, items: run })
    run = []
  }
  for (const item of items) {
    if (isTool(item)) run = [...run, item]
    else {
      flush()
      out.push({ kind: "item", item })
    }
  }
  flush()
  return out
}
