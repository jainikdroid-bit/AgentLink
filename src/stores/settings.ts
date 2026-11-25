import { create } from "zustand"
import * as SecureStore from "expo-secure-store"
import { type Category, defaultPreferences } from "../lib/notifications"
import { clampPageSize, mergeStoredSettings } from "../lib/settings-merge"
import { setAppLocale } from "../lib/i18n/config"
import type { LocalePreference } from "../lib/i18n/locale-resolve"
import type { AvatarSize } from "../lib/avatar-mood"
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
  /** The floating 3D Cheri. */
  avatar: AvatarSettings
}

export interface AvatarSettings {
  enabled: boolean
  opacity: number
  size: AvatarSize
  /** Width in dp after a pinch; null = the size preset. */
  width: number | null
  /** Where the user dragged her (top-left, dp); null = bottom-right corner. */
  pos: { x: number; y: number } | null
}

const DEFAULTS: Settings = {
  pageSize: 25,
  notifications: { ...defaultPreferences },
  locale: "system",
  mascot: DEFAULT_MASCOT,
  showThinking: true,
  showActions: false,
  replyInMyLanguage: true,
  avatar: { enabled: false, opacity: 0.6, size: "s", width: null, pos: null },
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
  setAvatar: (patch: Partial<AvatarSettings>) => Promise<void>
}

function snapshot(get: () => SettingsState): Settings {
  const { pageSize, notifications, locale, mascot, showThinking, showActions, replyInMyLanguage, avatar } = get()
  return { pageSize, notifications, locale, mascot, showThinking, showActions, replyInMyLanguage, avatar }
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
      const merged = { ...mergeStoredSettings(DEFAULTS, parsed), mascot: resolveMascot(parsed.mascot), avatar: { ...DEFAULTS.avatar, ...(parsed.avatar ?? {}) } }
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

  setAvatar: async (patch) => {
    const avatar = { ...get().avatar, ...patch }
    set({ avatar })
    await persist({ ...snapshot(get), avatar })
  },

  setReplyInMyLanguage: async (replyInMyLanguage) => {
    set({ replyInMyLanguage })
    await persist({ ...snapshot(get), replyInMyLanguage })
  },
}))
