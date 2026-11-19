// Multi-select state for the sessions list. Pure and immutable so it is easy to test.

export interface SelectionState {
  /** True while the list is in selection mode. */
  active: boolean
  /** Selected session ids in the order they were picked. */
  ids: readonly string[]
}

export const EMPTY_SELECTION: SelectionState = { active: false, ids: [] }

export type SelectionAction =
  | { type: "enter"; id: string }
  | { type: "toggle"; id: string }
  | { type: "selectAll"; ids: readonly string[] }
  | { type: "clear" }

/** Enter keeps the picked id; toggle leaves selection mode when the last one is unchecked. */
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "enter":
      return { active: true, ids: state.ids.includes(action.id) ? state.ids : [...state.ids, action.id] }
    case "toggle": {
      if (!state.active) return state
      const ids = state.ids.includes(action.id) ? state.ids.filter((i) => i !== action.id) : [...state.ids, action.id]
      return ids.length === 0 ? EMPTY_SELECTION : { active: true, ids }
    }
    case "selectAll": {
      const ids = Array.from(new Set(action.ids))
      return ids.length === 0 ? EMPTY_SELECTION : { active: true, ids }
    }
    case "clear":
      return EMPTY_SELECTION
  }
}

/** Drops ids that no longer exist (after a delete or refresh); leaves selection mode when none remain. */
export function pruneSelection(state: SelectionState, existing: readonly string[]): SelectionState {
  if (!state.active) return state
  const have = new Set(existing)
  const ids = state.ids.filter((i) => have.has(i))
  if (ids.length === state.ids.length) return state
  return ids.length === 0 ? EMPTY_SELECTION : { active: true, ids }
}
