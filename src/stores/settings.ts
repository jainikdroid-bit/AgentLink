import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { type Category, defaultPreferences } from "../lib/notifications"
import { clampPageSize, mergeStoredSettings } from "../lib/settings-merge"
import { setAppLocale } from "../lib/i18n/config"
import type { LocalePreference } from "../lib/i18n/locale-resolve"
import { DEFAULT_MASCOT, type MascotKind, resolveMascot } from "../lib/mascot-choice"

const SETTINGS_KEY = "opencode_settings"

interface Settings {
  pageSize: number
  notifications: Record<Category, boolean>
  locale: LocalePreference
  mascot: MascotKind
  /** Show the agent's reasoning open instead of folded. */
  showThinking: boolean
  /** Show the agent's actions (commands, edits) open instead of folded. */
  showActions: boolean
  /** Ask the agent to think and reply in the app's language. */
  replyInMyLanguage: boolean
}

const DEFAULTS: Settings = {
  pageSize: 25,
  notifications: { ...defaultPreferences },
  locale: "system",
  mascot: DEFAULT_MASCOT,
  showThinking: true,
  showActions: false,
  replyInMyLanguage: true,
}

interface SettingsState extends Settings {
  loaded: boolean
  load: () => Promise<void>
  setPageSize: (size: number) => Promise<void>
  setNotification: (category: Category, enabled: boolean) => Promise<void>
  setLocale: (locale: LocalePreference) => Promise<void>
  setMascot: (mascot: MascotKind) => Promise<void>
  setShowThinking: (value: boolean) => Promise<void>
  setShowActions: (value: boolean) => Promise<void>
  setReplyInMyLanguage: (value: boolean) => Promise<void>
}

function snapshot(get: () => SettingsState): Settings {
  const { pageSize, notifications, locale, mascot, showThinking, showActions, replyInMyLanguage } = get()
  return { pageSize, notifications, locale, mascot, showThinking, showActions, replyInMyLanguage }
}

async function persist(settings: Settings) {
  await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(settings))
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...DEFAULTS,
  loaded: false,

  load: async () => {
    const raw = await SecureStore.getItemAsync(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>
      // Merge stored settings with defaults so new fields/categories get their default
      const merged = { ...mergeStoredSettings(DEFAULTS, parsed), mascot: resolveMascot(parsed.mascot) }
      set({ ...merged, loaded: true })
      setAppLocale(merged.locale)
      return
    }
    set({ loaded: true })
  },

  setPageSize: async (size) => {
    const clamped = clampPageSize(size)
    set({ pageSize: clamped })
    await persist({ ...snapshot(get), pageSize: clamped })
  },

  setNotification: async (category, enabled) => {
    const notifications = { ...get().notifications, [category]: enabled }
    set({ notifications })
    await persist({ ...snapshot(get), notifications })
  },

  setLocale: async (locale) => {
    set({ locale })
    setAppLocale(locale) // applies immediately
    await persist({ ...snapshot(get), locale })
  },

  setMascot: async (mascot) => {
    set({ mascot })
    await persist({ ...snapshot(get), mascot })
  },

  setShowThinking: async (showThinking) => {
    set({ showThinking })
    await persist({ ...snapshot(get), showThinking })
  },

  setShowActions: async (showActions) => {
    set({ showActions })
    await persist({ ...snapshot(get), showActions })
  },

  setReplyInMyLanguage: async (replyInMyLanguage) => {
    set({ replyInMyLanguage })
    await persist({ ...snapshot(get), replyInMyLanguage })
  },
}))
