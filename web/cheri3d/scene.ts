// Cheri 3D runtime: a VRM model rendered with three.js on a transparent canvas, inside the app's WebView
// (and in the desktop lab). The app drives it with window.cheri.setMood(...); taps, long presses and
// drags go back through window.ReactNativeWebView.postMessage.
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm"
import { BASE, ENTER_SKIT, MOOD_SKITS, REST, SKITS, TAP_ORDER, activeProps, sample, type Bone, type Pose, type PropKind, type Scene } from "./poses"

declare global {
  interface Window {
    cheri: { setMood(m: string): void; play(id: string): void; tap(): void; pet(): void; debug: Record<string, unknown> }
    ReactNativeWebView?: { postMessage(s: string): void }
  }
}

const post = (msg: Record<string, unknown>) => window.ReactNativeWebView?.postMessage(JSON.stringify(msg))
const DEG = Math.PI / 180

const canvas = document.getElementById("c") as HTMLCanvasElement
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
renderer.setClearColor(0x000000, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 20)
camera.position.set(0, 1.33, 1.95)
camera.lookAt(0, 1.25, 0)
scene.add(new THREE.AmbientLight(0xffffff, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 1.8)
sun.position.set(0.6, 1.6, 1.4)
scene.add(sun)

function resize() {
  const w = window.innerWidth
  const h = window.innerHeight
  renderer.setSize(w, h, false)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
}
window.addEventListener("resize", resize)
resize()

// ---------- props (emoji sprites + a few meshes) ----------

function emojiSprite(text: string, size = 0.12): THREE.Sprite {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const g = c.getContext("2d") as CanvasRenderingContext2D
  g.font = "100px 'Noto Color Emoji','Apple Color Emoji','Segoe UI Emoji',sans-serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText(text, 64, 70)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }))
  s.scale.set(size, size, size)
  s.renderOrder = 10
  return s
}

function holoPanel(w: number, h: number, lines: boolean): THREE.Mesh {
  const c = document.createElement("canvas")
  c.width = 256
  c.height = Math.round((256 * h) / w)
  const g = c.getContext("2d") as CanvasRenderingContext2D
  g.fillStyle = "rgba(34,211,238,0.18)"
  g.fillRect(0, 0, c.width, c.height)
  g.strokeStyle = "rgba(34,211,238,0.9)"
  g.lineWidth = 4
  g.strokeRect(2, 2, c.width - 4, c.height - 4)
  g.fillStyle = "rgba(34,211,238,0.7)"
  if (lines) for (let i = 0; i < 4; i++) g.fillRect(16, 16 + i * 18, 60 + ((i * 53) % 150), 8)
  else for (let r = 0; r < 3; r++) for (let k = 0; k < 10; k++) g.fillRect(10 + k * 24 + r * 6, 10 + r * 22, 18, 14)
  const tex = new THREE.CanvasTexture(c)
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }))
  m.renderOrder = 9
  return m
}

const props: Record<PropKind, THREE.Object3D> = {
  keyboard: holoPanel(0.42, 0.13, false),
  panel: holoPanel(0.26, 0.17, true),
  bulb: emojiSprite("💡", 0.16),
  cup: emojiSprite("☕", 0.1),
  z: emojiSprite("💤", 0.13),
  heart: emojiSprite("💖", 0.11),
  sweat: emojiSprite("💦", 0.09),
  confetti: emojiSprite("🎉", 0.16),
  cloud: emojiSprite("🌧️", 0.2),
  question: emojiSprite("❓", 0.11),
  exclaim: emojiSprite("❗", 0.12),
  note: emojiSprite("🎵", 0.1),
  stars: emojiSprite("💫", 0.14),
  ring: emojiSprite("⏳", 0.12),
  phone: emojiSprite("📱", 0.1),
  sparkle: emojiSprite("✨", 0.13),
}
props.keyboard.rotation.x = -1.1
for (const p of Object.values(props)) {
  p.visible = false
  scene.add(p)
}

// ---------- model ----------

let vrm: VRM | null = null
const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"] as const
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const

async function load(url: string) {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.loadAsync(url)
  const model = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(model)
  model.scene.traverse((o) => {
    o.frustumCulled = false
  })
  restyleOutfit(model)
  measureArms(model)
  scene.add(model.scene)
  vrm = model
  post({ type: "ready" })
}

// ---------- outfit: pink top, plaid skirt ----------

function solidTexture(color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d") as CanvasRenderingContext2D
  g.fillStyle = color
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Tartan in pinks and navy: wide bands, thin stripes, then a lighter overlay so the crossings mix. */
function plaidTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas")
  c.width = c.height = 512
  const g = c.getContext("2d") as CanvasRenderingContext2D
  g.fillStyle = "#3a2a4a"
  g.fillRect(0, 0, 512, 512)
  const band = (pos: number, width: number, color: string, alpha: number) => {
    g.globalAlpha = alpha
    g.fillStyle = color
    g.fillRect(pos, 0, width, 512)
    g.fillRect(0, pos, 512, width)
  }
  for (let i = 0; i < 4; i++) {
    const o = i * 128
    band(o + 8, 52, "#d4537e", 0.55)
    band(o + 70, 20, "#f4c0d1", 0.45)
    band(o + 100, 4, "#ffffff", 0.7)
    band(o + 112, 3, "#22d3ee", 0.6)
  }
  g.globalAlpha = 1
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(3, 3)
  return t
}

// Sporty look: pink top, white tennis skirt, no school bow.
function restyleOutfit(model: VRM) {
  const pink = solidTexture("#f29abd")
  const plaid = solidTexture("#f7f6f9")
  model.scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const m of mats as (THREE.Material & { map?: THREE.Texture | null; shadeMultiplyTexture?: THREE.Texture | null; shadeColorFactor?: THREE.Color; color?: THREE.Color })[]) {
      const name = m.name || ""
      const top = /Tops/i.test(name)
      const skirt = /Bottoms/i.test(name)
      if (/Accessory/i.test(name)) {
        m.visible = false
        continue
      }
      if (!top && !skirt) continue
      m.map = top ? pink : plaid
      if (m.shadeMultiplyTexture !== undefined) m.shadeMultiplyTexture = top ? pink : plaid
      if (m.shadeColorFactor) m.shadeColorFactor.set(top ? "#c8708f" : "#c3c2d4")
      if (m.color) m.color.set("#ffffff")
      m.needsUpdate = true
    }
  })
}

const tmpEuler = new THREE.Euler()
const tmpQuat = new THREE.Quaternion()

// ---------- two-bone arm IK ----------

const ikS = new THREE.Vector3()
const ikE = new THREE.Vector3()
const ikH = new THREE.Vector3()
const ikT = new THREE.Vector3()
const ikRef = new THREE.Vector3()
const ikPole = new THREE.Vector3()
const ikDir = new THREE.Vector3()
const ikPerp = new THREE.Vector3()
const ikQ1 = new THREE.Quaternion()
const ikQ2 = new THREE.Quaternion()
const ikParent = new THREE.Quaternion()
const ikLocal = new THREE.Quaternion()
const smoothTargets = { left: new THREE.Vector3(), right: new THREE.Vector3(), ready: false }

const restDir: Record<string, { upper: THREE.Vector3; lower: THREE.Vector3 }> = {}
const ikTmp = new THREE.Vector3()
const ikOut = new THREE.Vector3()

/** Child offset of each arm bone in its own frame, measured once from the rest pose (works for VRM0 and VRM1). */
function measureArms(model: VRM) {
  for (const side of ["left", "right"] as const) {
    const lower = model.humanoid.getNormalizedBoneNode(`${side}LowerArm`)
    const hand = model.humanoid.getNormalizedBoneNode(`${side}Hand`)
    if (lower && hand) restDir[side] = { upper: lower.position.clone().normalize(), lower: hand.position.clone().normalize() }
  }
}

/** Places one hand at `target` (world): the elbow bends outward, down and back. */
function solveArm(side: "left" | "right", target: THREE.Vector3) {
  if (!vrm || !restDir[side]) return
  const h = vrm.humanoid
  const upper = h.getNormalizedBoneNode(`${side}UpperArm`)
  const lower = h.getNormalizedBoneNode(`${side}LowerArm`)
  const hand = h.getNormalizedBoneNode(`${side}Hand`)
  const chest = h.getNormalizedBoneNode("upperChest") ?? h.getNormalizedBoneNode("chest") ?? h.getNormalizedBoneNode("spine")
  if (!upper || !lower || !hand || !upper.parent || !chest) return
  upper.getWorldPosition(ikS)
  lower.getWorldPosition(ikE)
  hand.getWorldPosition(ikH)
  chest.getWorldPosition(ikRef)
  const l1 = ikS.distanceTo(ikE)
  const l2 = ikE.distanceTo(ikH)
  ikDir.copy(target).sub(ikS)
  const reach = Math.min(Math.max(ikDir.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999)
  ikDir.normalize()
  const cosA = Math.min(1, Math.max(-1, (l1 * l1 + reach * reach - l2 * l2) / (2 * l1 * reach)))
  const sinA = Math.sqrt(1 - cosA * cosA)
  ikOut.copy(ikS).sub(ikRef).setY(0).normalize()
  ikPole.copy(ikOut).multiplyScalar(0.6).add(ikTmp.set(0, -1, -0.5))
  ikPerp.copy(ikPole).addScaledVector(ikDir, -ikPole.dot(ikDir)).normalize()
  const elbow = ikE.copy(ikS).addScaledVector(ikDir, l1 * cosA).addScaledVector(ikPerp, l1 * sinA)
  const wrist = ikH.copy(ikS).addScaledVector(ikDir, reach)
  // upper arm: direction to the elbow, expressed in the upper arm's parent frame
  upper.parent.getWorldQuaternion(ikParent)
  const inv = ikLocal.copy(ikParent).invert()
  ikT.copy(elbow).sub(ikS).normalize().applyQuaternion(inv)
  ikQ1.setFromUnitVectors(restDir[side].upper, ikT)
  upper.quaternion.copy(ikQ1)
  // forearm: direction to the wrist, in the upper arm's (new) frame
  ikQ2.copy(ikParent).multiply(ikQ1).invert()
  ikT.copy(wrist).sub(elbow).normalize().applyQuaternion(ikQ2)
  lower.quaternion.setFromUnitVectors(restDir[side].lower, ikT)
}

const chestPos = new THREE.Vector3()

function targetWorld(t: Pose["l"], into: THREE.Vector3) {
  if (!vrm) return into
  const ref = vrm.humanoid.getNormalizedBoneNode(t.ref === "head" ? "head" : "chest")
  ref?.getWorldPosition(ikRef)
  return into.set(ikRef.x + t.x, ikRef.y + t.y, ikRef.z + t.z)
}

function applyArms(pose: Pose, k: number) {
  if (!vrm) return
  vrm.scene.updateMatrixWorld(true)
  const l = targetWorld(pose.l, new THREE.Vector3())
  const r = targetWorld(pose.r, new THREE.Vector3())
  if (!smoothTargets.ready) {
    smoothTargets.left.copy(l)
    smoothTargets.right.copy(r)
    smoothTargets.ready = true
  }
  smoothTargets.left.lerp(l, k)
  smoothTargets.right.lerp(r, k)
  solveArm("left", smoothTargets.left)
  solveArm("right", smoothTargets.right)
}

function applyBones(pose: Pose, k: number) {
  if (!vrm) return
  const h = vrm.humanoid
  const bones = { ...REST.bones, ...pose.bones }
  for (const [name, deg] of Object.entries(bones) as [Bone, [number, number, number]][]) {
    const node = h.getNormalizedBoneNode(name)
    if (!node) continue
    tmpEuler.set(deg[0] * DEG, deg[1] * DEG, deg[2] * DEG)
    tmpQuat.setFromEuler(tmpEuler)
    node.quaternion.slerp(tmpQuat, k)
  }
  for (const side of ["left", "right"] as const) {
    const curl = side === "left" ? pose.curlL : pose.curlR
    const shape = side === "left" ? pose.shapeL : pose.shapeR
    const sign = side === "left" ? 1 : -1
    for (const f of FINGERS) {
      const straight = (shape === "peace" && (f === "Index" || f === "Middle")) || (shape === "point" && f === "Index")
      const amount = straight ? 0 : curl
      for (const seg of SEGMENTS) {
        const node = h.getNormalizedBoneNode(`${side}${f}${seg}` as never)
        if (!node) continue
        if (f === "Thumb") tmpEuler.set(0, sign * -amount * 40 * DEG, 0)
        else tmpEuler.set(0, 0, sign * amount * 75 * DEG)
        tmpQuat.setFromEuler(tmpEuler)
        node.quaternion.slerp(tmpQuat, k)
      }
    }
  }
}

const EXPRESSIONS = ["happy", "angry", "sad", "relaxed", "surprised"] as const

function applyFace(pose: Pose, now: number) {
  if (!vrm?.expressionManager) return
  const em = vrm.expressionManager
  for (const e of EXPRESSIONS) em.setValue(e, pose.face === e ? pose.faceWeight : 0)
  const cycle = now % 3600
  const blink = cycle < 140 ? 1 - Math.abs(cycle - 70) / 70 : 0
  const happyEyes = pose.face === "happy" && pose.faceWeight > 0.5
  em.setValue("blink", Math.max(pose.lids, happyEyes ? 0 : blink))
  em.setValue("blinkRight", pose.winkR ? 1 : 0)
  em.setValue("aa", pose.mouth)
}

const lookTarget = new THREE.Object3D()
scene.add(lookTarget)

function applyLook(pose: Pose) {
  if (!vrm?.lookAt) return
  lookTarget.position.set(pose.lookX * 0.6, 1.3 + pose.lookY * 0.4, 2)
  vrm.lookAt.target = lookTarget
}

const headPos = new THREE.Vector3()
const handPos = new THREE.Vector3()

function placeProps(cues: PropKind[], now: number) {
  for (const [kind, obj] of Object.entries(props) as [PropKind, THREE.Object3D][]) obj.visible = cues.includes(kind)
  if (!vrm) return
  vrm.humanoid.getNormalizedBoneNode("head")?.getWorldPosition(headPos)
  vrm.humanoid.getNormalizedBoneNode("rightHand")?.getWorldPosition(handPos)
  const bob = Math.sin(now / 300) * 0.01
  const up = ((now % 2000) / 2000) * 0.12
  props.bulb.position.set(headPos.x + 0.02, headPos.y + 0.24 + bob, headPos.z)
  ;(props.bulb as THREE.Sprite).material.opacity = 0.75 + 0.25 * Math.sin(now / 180)
  ;(vrm.humanoid.getNormalizedBoneNode("chest") ?? vrm.humanoid.getNormalizedBoneNode("spine"))?.getWorldPosition(chestPos)
  props.keyboard.position.set(chestPos.x, chestPos.y - 0.25, chestPos.z + 0.25)
  props.panel.position.set(headPos.x + 0.3, headPos.y - 0.1, headPos.z + 0.15)
  props.cup.position.set(handPos.x, handPos.y + 0.05, handPos.z + 0.05)
  props.phone.position.set(handPos.x, handPos.y + 0.07, handPos.z + 0.04)
  props.z.position.set(headPos.x + 0.18, headPos.y + 0.1 + up, headPos.z)
  props.heart.position.set(headPos.x - 0.16, headPos.y + 0.12 + up, headPos.z)
  props.note.position.set(headPos.x + 0.2, headPos.y + 0.08 + up, headPos.z)
  props.sweat.position.set(headPos.x + 0.11, headPos.y + 0.07 - up * 0.5, headPos.z + 0.05)
  props.question.position.set(headPos.x + 0.2, headPos.y + 0.16 + bob, headPos.z)
  props.exclaim.position.set(headPos.x - 0.2, headPos.y + 0.16 + bob, headPos.z)
  props.sparkle.position.set(headPos.x + 0.22, headPos.y + 0.02 + bob, headPos.z)
  props.cloud.position.set(headPos.x, headPos.y + 0.3 + bob, headPos.z)
  props.stars.position.set(headPos.x + Math.cos(now / 200) * 0.14, headPos.y + 0.16, headPos.z + Math.sin(now / 200) * 0.05)
  props.confetti.position.set(headPos.x - 0.2, headPos.y + 0.18 + bob, headPos.z)
  props.ring.position.set(headPos.x + 0.2, headPos.y + 0.12, headPos.z)
  props.ring.rotation.z = now / 300
}

// ---------- director ----------

let mood = "idle"
let skit: { scene: Scene; start: number } | null = null
let nextSkitAt = performance.now() + 4000
let last: string | null = null
const taps = { count: 0, at: 0 }

function play(id: string) {
  const s = SKITS[id]
  if (!s) return
  skit = { scene: s, start: performance.now() }
  last = id
}

function setMood(m: string) {
  if (!BASE[m] || m === mood) return
  const enter = ENTER_SKIT[m]
  mood = m
  skit = null
  if (enter) play(enter)
  nextSkitAt = performance.now() + 5000 + Math.random() * 5000
}

function tap() {
  const now = performance.now()
  taps.count = now - taps.at < 1800 ? taps.count + 1 : 1
  taps.at = now
  play(TAP_ORDER[Math.min(TAP_ORDER.length - 1, taps.count - 1)])
}

window.cheri = {
  setMood,
  play,
  tap,
  pet: () => play("pet"),
  // Lab only: grab the current frame (render + read back in the same task, no preserveDrawingBuffer needed).
  debug: { snap: () => (renderer.render(scene, camera), canvas.toDataURL("image/png")) },
}

// touches: tap, long press (pet) and drag (moves the floating window in the app)
let down: { x: number; y: number; t: number; moved: boolean } | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.screenX, y: e.screenY, t: performance.now(), moved: false }
  holdTimer = setTimeout(() => {
    holdTimer = null
    // A long press opens the avatar menu in the app (hide, transparency, size); in the lab it pets her.
    if (down && !down.moved) {
      if (window.ReactNativeWebView) post({ type: "menu" })
      else play("pet")
    }
  }, 550)
})
canvas.addEventListener("pointermove", (e) => {
  if (!down) return
  const dx = e.screenX - down.x
  const dy = e.screenY - down.y
  if (!down.moved && Math.hypot(dx, dy) < 8) return
  down.moved = true
  if (holdTimer) clearTimeout(holdTimer)
  holdTimer = null
  post({ type: "drag", dx, dy })
  down.x = e.screenX
  down.y = e.screenY
})
canvas.addEventListener("pointerup", () => {
  if (holdTimer) {
    clearTimeout(holdTimer)
    holdTimer = null
    if (down && !down.moved) tap()
  }
  if (down?.moved) post({ type: "dragEnd" })
  down = null
})

const clock = new THREE.Clock()
function frame() {
  requestAnimationFrame(frame)
  const dt = Math.min(0.05, clock.getDelta())
  const now = performance.now()
  if (skit && now - skit.start >= skit.scene.ms) {
    skit = null
    nextSkitAt = now + 6000 + Math.random() * 7000
  }
  if (!skit && now >= nextSkitAt) {
    const pool = (MOOD_SKITS[mood] ?? []).filter((id) => id !== last)
    if (pool.length) play(pool[Math.floor(Math.random() * pool.length)])
    else nextSkitAt = now + 8000
  }
  const base = sample(BASE[mood], now, REST)
  const pose = skit ? sample(skit.scene, now - skit.start, base) : base
  const breathe = Math.sin(now / 800) * 1.2
  const posed: Pose = { ...pose, bones: { ...pose.bones, chest: [(pose.bones.chest?.[0] ?? 0) + breathe, pose.bones.chest?.[1] ?? 0, pose.bones.chest?.[2] ?? 0] } }
  applyBones(posed, 1 - Math.exp(-dt * 14))
  applyArms(posed, 1 - Math.exp(-dt * 10))
  applyFace(posed, now)
  applyLook(posed)
  if (vrm) {
    vrm.scene.position.y = posed.lift
    vrm.update(dt)
  }
  const cues = new Set<PropKind>([...activeProps(BASE[mood], now).map((p) => p.kind), ...(skit ? activeProps(skit.scene, now - skit.start).map((p) => p.kind) : [])])
  placeProps([...cues], now)
  renderer.render(scene, camera)
}

const params = new URLSearchParams(location.search)
load(params.get("model") || "cheri.vrm").catch((e) => post({ type: "error", message: String(e) }))
const initial = params.get("mood")
if (initial) setMood(initial)
frame()
