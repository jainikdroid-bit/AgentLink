import { useTheme } from "../../src/theme/useTheme"
import { Tabs } from "expo-router"
import { useColorScheme } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"

export default function TabLayout() {
  const palette = useTheme()
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: palette.cyan,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: { fontFamily: palette.mono, fontSize: 10, letterSpacing: 0.5 },
        tabBarStyle: { backgroundColor: palette.bg, borderTopColor: palette.borderGlow },
        headerStyle: { backgroundColor: palette.bg },
        headerTintColor: palette.cyan,
        headerTitleStyle: { color: palette.text, fontFamily: palette.mono, fontSize: 15 },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.sessionsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: t("nav.connectionsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="server-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav.settingsTab"),
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  )
}
