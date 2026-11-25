import { useMemo } from "react"
import { useSettings } from "../stores/settings"
import { PALETTES, themeStyles, type ThemeId } from "./palettes"

export function useTheme() {
  const id = useSettings(s => s.theme)
  return PALETTES[id]
}

export function useThemedStyles<T extends object>(base: T): T {
  const id: ThemeId = useSettings(s => s.theme)
  return useMemo(() => themeStyles(base, id), [base, id])
}
