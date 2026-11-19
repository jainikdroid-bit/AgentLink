import { useCallback, useEffect, useRef, useState } from "react"
import { Animated, Modal, NativeEventEmitter, NativeModules, PixelRatio, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native"
import { WebView, type WebViewMessageEvent } from "react-native-webview"
import { router } from "expo-router"
import { useTranslation } from "react-i18next"
import { cyber } from "../theme/cyber"
import { useSettings } from "../stores/settings"
import { useAvatar } from "../stores/avatar"
import { useOverallStatus } from "../lib/useOverallStatus"
import { AVATAR_OPACITIES, AVATAR_SIZES, avatarMood, clampPosition, pinchWidth, type AvatarSize } from "../lib/avatar-mood"

const SOURCE = { uri: "file:///android_asset/cheri3d/index.html" }
const CELEBRATE_MS = 6000

// The floating 3D Cheri (three.js + VRM in a transparent WebView, see web/cheri3d). She floats over every
// screen, can be dragged, reacts to what the agent does, and a long press opens her menu.
export function FloatingCheri() {
  const avatar = useSettings((s) => s.avatar)
  const setAvatar = useSettings((s) => s.setAvatar)
  const activity = useAvatar((s) => s.activity)
  const { info } = useOverallStatus()
  const { width: sw, height: sh } = useWindowDimensions()
  const [liveWidth, setLiveWidth] = useState<number | null>(null)
  const pinchStart = useRef(0)
  const w = liveWidth ?? avatar.width ?? AVATAR_SIZES[avatar.size]
  const h = Math.round((w * 4) / 3)

  const [celebrating, setCelebrating] = useState(false)
  const wasBusy = useRef(false)
  const busy = info.status === "online-busy" || !!activity
  useEffect(() => {
    const finished = wasBusy.current && !busy
    wasBusy.current = busy
    if (!finished) return
    setCelebrating(true)
    const timer = setTimeout(() => setCelebrating(false), CELEBRATE_MS)
    return () => clearTimeout(timer)
  }, [busy])
  const mood = avatarMood(info.status, activity, celebrating)

  const web = useRef<WebView>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (ready) web.current?.injectJavaScript(`window.cheri && cheri.setMood(${JSON.stringify(mood)}); true;`)
  }, [mood, ready])

  // Default: bottom-left, above the tab bar, clear of the "+" button on the right.
  const home = () => clampPosition(avatar.pos?.x ?? 4, avatar.pos?.y ?? sh - h - 150, w, h, sw, sh)
  const current = useRef(home())
  const pos = useRef(new Animated.ValueXY(current.current)).current
  useEffect(() => {
    current.current = home()
    pos.setValue(current.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h, sw, sh, avatar.pos])

  const [menu, setMenu] = useState(false)
  const box = useRef<View>(null)
  // Tell Android where she is: taps there pass through, a hold picks her up (CheriTouch.kt).
  const publishRect = useCallback(() => {
    const native = NativeModules.CheriTouch as { setRect?: (x: number, y: number, w: number, h: number, on: boolean) => void } | undefined
    if (!native?.setRect) return
    const r = PixelRatio.get()
    box.current?.measureInWindow((x, y, ww, hh) => native.setRect?.(x * r, y * r, ww * r, hh * r, true))
  }, [])
  useEffect(() => {
    const timer = setTimeout(publishRect, 50)
    return () => clearTimeout(timer)
  }, [publishRect, w, h, sw, sh, avatar.pos, avatar.enabled])
  useEffect(() => () => (NativeModules.CheriTouch as { setRect?: (...a: unknown[]) => void } | undefined)?.setRect?.(0, 0, 0, 0, false), [])

  type Msg = { type?: string; dx?: number; dy?: number; message?: string; scale?: number }
  const handle = (msg: Msg) => {
    if (msg.type === "ready") setReady(true)
    else if (msg.type === "error") console.warn("[cheri3d]", msg.message)
    else if (msg.type === "drag") {
      current.current = clampPosition(current.current.x + (msg.dx ?? 0), current.current.y + (msg.dy ?? 0), w, h, sw, sh)
      pos.setValue(current.current)
    } else if (msg.type === "dragEnd" || msg.type === "drop") {
      void setAvatar({ pos: current.current })
      publishRect()
    } else if (msg.type === "pickUp") web.current?.injectJavaScript("window.cheri && cheri.play('giggle'); true;")
    else if (msg.type === "menu") setMenu(true)
    else if (msg.type === "pinchStart") pinchStart.current = w
    else if (msg.type === "pinch") setLiveWidth(pinchWidth(pinchStart.current || w, msg.scale ?? 1))
    else if (msg.type === "pinchEnd") {
      const next = pinchWidth(pinchStart.current || w, msg.scale ?? 1)
      setLiveWidth(null)
      void setAvatar({ width: next })
    }
  }
  const handleRef = useRef(handle)
  handleRef.current = handle
  const onMessage = (e: WebViewMessageEvent) => {
    try {
      handleRef.current(JSON.parse(e.nativeEvent.data) as Msg)
    } catch {
      // not ours
    }
  }
  useEffect(() => {
    if (!NativeModules.CheriTouch) return
    const sub = new NativeEventEmitter(NativeModules.CheriTouch).addListener("CheriTouch", (m: Msg) => handleRef.current(m))
    return () => sub.remove()
  }, [])

  if (Platform.OS !== "android" || !avatar.enabled) return null
  return (
    <>
      <Animated.View ref={box} pointerEvents="none" onLayout={publishRect} style={[s.window, { width: w, height: h, opacity: avatar.opacity, transform: pos.getTranslateTransform() }]} testID="floating-cheri">
        <WebView
          ref={web}
          source={SOURCE}
          originWhitelist={["*"]}
          allowFileAccess
          allowFileAccessFromFileURLs
          allowUniversalAccessFromFileURLs
          javaScriptEnabled
          scrollEnabled={false}
          overScrollMode="never"
          androidLayerType="hardware"
          onMessage={onMessage}
          style={s.transparent}
          containerStyle={s.transparent}
        />
      </Animated.View>
      <AvatarMenu visible={menu} onClose={() => setMenu(false)} />
    </>
  )
}

/** Long press on Cheri: hide her, make her more see-through, resize, put her back, or open Settings. */
function AvatarMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const avatar = useSettings((s) => s.avatar)
  const setAvatar = useSettings((s) => s.setAvatar)
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => undefined}>
          <Text style={s.title}>{t("avatar.menuTitle")}</Text>
          <AvatarControls />
          <TouchableOpacity style={s.row} onPress={() => void setAvatar({ pos: null })} testID="avatar-reset">
            <Text style={s.link}>{t("avatar.reset")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              onClose()
              router.push("/(tabs)/settings")
            }}
          >
            <Text style={s.link}>{t("avatar.openSettings")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.row}
            onPress={() => {
              onClose()
              void setAvatar({ enabled: !avatar.enabled })
            }}
            testID="avatar-hide"
          >
            <Text style={[s.link, { color: cyber.red }]}>{t("avatar.hide")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.row} onPress={onClose}>
            <Text style={s.muted}>{t("common.close")}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

/** Transparency and size chips, shared by the long-press menu and Settings. */
export function AvatarControls() {
  const { t } = useTranslation()
  const avatar = useSettings((s) => s.avatar)
  const setAvatar = useSettings((s) => s.setAvatar)
  const sizes: AvatarSize[] = ["s", "m", "l"]
  return (
    <View style={s.controls}>
      <Text style={s.label}>{t("avatar.opacity")}</Text>
      <View style={s.chips}>
        {AVATAR_OPACITIES.map((o) => (
          <TouchableOpacity key={o} style={[s.chip, avatar.opacity === o && s.chipOn]} onPress={() => void setAvatar({ opacity: o })}>
            <Text style={[s.chipText, avatar.opacity === o && s.chipTextOn]}>{Math.round(o * 100)}%</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>{t("avatar.size")}</Text>
      <View style={s.chips}>
        {sizes.map((size) => (
          <TouchableOpacity key={size} style={[s.chip, !avatar.width && avatar.size === size && s.chipOn]} onPress={() => void setAvatar({ size, width: null })}>
            <Text style={[s.chipText, !avatar.width && avatar.size === size && s.chipTextOn]}>{t(`avatar.sizes.${size}`)}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  window: { position: "absolute", left: 0, top: 0, zIndex: 50, elevation: 50 },
  transparent: { backgroundColor: "transparent", flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: cyber.surface, borderRadius: 14, borderWidth: 1, borderColor: cyber.border, padding: 16, gap: 4 },
  title: { color: cyber.text, fontSize: 16, fontWeight: "600", marginBottom: 6 },
  row: { paddingVertical: 10 },
  link: { color: cyber.cyan, fontSize: 15 },
  muted: { color: cyber.muted, fontSize: 15 },
  controls: { gap: 6 },
  label: { color: cyber.muted, fontSize: 13, marginTop: 6 },
  chips: { flexDirection: "row", gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: cyber.border },
  chipOn: { borderColor: cyber.cyan, backgroundColor: "rgba(34,211,238,0.12)" },
  chipText: { color: cyber.muted, fontSize: 13 },
  chipTextOn: { color: cyber.cyan },
})
