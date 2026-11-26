import { cyber } from "./cyber.ts"

export const THEME_IDS = ["cyber", "aurora", "nebula", "ember"] as const
export type ThemeId = (typeof THEME_IDS)[number]
export type ThemePalette = { [K in keyof typeof cyber]: string }

const base: ThemePalette = { ...cyber }
// Keep warning, success and error meanings independent from appearance.
export const PALETTES: Record<ThemeId, ThemePalette> = {
  cyber: base,
  aurora: { ...base, bg: "#071310", surface: "#10221D", surface2: "#18332B", border: "#2B493E", borderGlow: "#285B4B", text: "#E6F6ED", muted: "#A0BCAF", cyan: "#75EBC2", cyanDim: "#247D65", magenta: "#B8E986" },
  nebula: { ...base, bg: "#100C1D", surface: "#1B142D", surface2: "#291F40", border: "#423455", borderGlow: "#53437B", text: "#F0EAFE", muted: "#B7ABCF", cyan: "#BEA5FF", cyanDim: "#7652B5", magenta: "#F4A6DC" },
  ember: { ...base, bg: "#17110D", surface: "#251B15", surface2: "#38271C", border: "#513A2A", borderGlow: "#754B2C", text: "#FFF0DF", muted: "#C8B2A1", cyan: "#FFC080", cyanDim: "#985421", magenta: "#F1A28D" },
}

export function resolveTheme(value: unknown): ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value) ? value as ThemeId : "cyber"
}

// The existing app uses both cyber tokens and their literal hex equivalents.
// Only neutral and accent colors are mapped. Semantic status colors, syntax
// highlighting, illustrations and native avatar assets remain untouched.
const COLOR_KEYS = ["bg", "surface", "surface2", "border", "borderGlow", "text", "muted", "cyan", "cyanDim", "magenta"] as const
const LEGACY: Record<string, (typeof COLOR_KEYS)[number]> = {
  "#1d2433": "border", "#262f45": "border", "#0d1017": "surface", "#0a0d14": "bg",
  "#0c1a26": "surface2", "#0a1522": "surface2", "#0f2a36": "surface2", "#0a2530": "surface2",
  "#67e8f9": "cyan", "#06b6d4": "cyan",
}

export function themeColor(color: string, theme: ThemeId): string {
  if (theme === "cyber") return color
  const normalized = color.toLowerCase()
  const key = COLOR_KEYS.find(k => base[k].toLowerCase() === normalized) ?? LEGACY[normalized]
  return key ? PALETTES[theme][key] : color
}

// React Native styles in this project are flat named objects. Clone only the
// top two levels; leave shadows, transforms, numeric IDs and other values intact.
export function themeStyles<T extends object>(styles: T, theme: ThemeId): T {
  if (theme === "cyber") return styles
  return Object.fromEntries(Object.entries(styles).map(([name, style]) => {
    if (!style || typeof style !== "object" || Array.isArray(style)) return [name, style]
    return [name, Object.fromEntries(Object.entries(style).map(([key, value]) =>
      [key, typeof value === "string" && (key === "color" || key.endsWith("Color")) ? themeColor(value, theme) : value]
    ))]
  })) as T
}
