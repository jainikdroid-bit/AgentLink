// Cheri 3D runtime: a VRM model rendered with three.js on a transparent canvas, inside the app's WebView
// (and in the desktop lab). The app drives it with window.cheri.setMood(...); taps, long presses and
// drags go back through window.ReactNativeWebView.postMessage.
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm"
import { BASE, ENTER_SKIT, MOOD_SKITS, REST, SKITS, TAP_ORDER, WALK, activeProps, sample, type Bone, type BonePose, type Pose, type PropKind, type Scene } from "./poses"

declare global {
  interface Window {
    cheri: { setMood(m: string): void; play(id: string): void; tap(): void; pet(): void; walk(dir: number): void; debug: Record<string, unknown> }
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
camera.position.set(0, 0.9, 4.2)
camera.lookAt(0, 0.85, 0)
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

/** XHR, not fetch: Android WebView refuses fetch() for file:///android_asset URLs but allows XHR. */
function readBuffer(url: string): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("GET", url)
    xhr.responseType = "arraybuffer"
    xhr.onload = () => (xhr.status === 200 || (xhr.status === 0 && xhr.response) ? resolve(xhr.response as ArrayBuffer) : reject(new Error(`model: HTTP ${xhr.status}`)))
    xhr.onerror = () => reject(new Error("model: could not read the file"))
    xhr.send()
  })
}

async function load(url: string) {
  const loader = new GLTFLoader()
  loader.register((parser) => new VRMLoaderPlugin(parser))
  const gltf = await loader.parseAsync(await readBuffer(url), "")
  const model = gltf.userData.vrm as VRM
  VRMUtils.removeUnnecessaryVertices(gltf.scene)
  VRMUtils.combineSkeletons(gltf.scene)
  VRMUtils.rotateVRM0(model)
  baseTurn = model.scene.rotation.y
  model.scene.traverse((o) => {
    o.frustumCulled = false
  })
  restyleOutfit(model)
  measureArms(model)
  scene.add(model.scene)
  vrm = model
  post({ type: "ready" })
  // Motion-capture clips are optional: without the file the hand-made poses in poses.ts still work.
  try {
    const data = JSON.parse(new TextDecoder().decode(await readBuffer(url.replace(/[^/]*$/, "") + "cheri-anim.json"))) as AnimData
    motion = buildMotion(model, data)
  } catch (e) {
    post({ type: "warn", message: `animation: ${String(e)}` })
  }
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

// ---------- motion capture (Quaternius Universal Animation Library, CC0), retargeted to the VRM ----------

interface AnimData {
  hipsRestUp: number
  bones: Record<string, { rest: number[]; parent: number[] }>
  clips: Record<string, { times: number[]; tracks: Record<string, number[]>; up: number[]; loop: boolean; air?: number[] }>
}
type Group = "hips" | "trunk" | "legs"
const GROUP: Record<string, Group> = {
  hips: "hips",
  spine: "trunk",
  chest: "trunk",
  upperChest: "trunk",
  leftUpperLeg: "legs",
  leftLowerLeg: "legs",
  leftFoot: "legs",
  leftToes: "legs",
  rightUpperLeg: "legs",
  rightLowerLeg: "legs",
  rightFoot: "legs",
  rightToes: "legs",
}
/** How strongly each clip drives each body part (the rest keeps coming from the hand-made poses). */
const INFLUENCE: Record<string, Record<Group, number>> = {
  idle: { hips: 1, trunk: 0, legs: 1 },
  walk: { hips: 1, trunk: 1, legs: 1 },
  crouch: { hips: 1, trunk: 0.25, legs: 1 },
  jump: { hips: 1, trunk: 1, legs: 1 },
}
/** Clips that also own the body height (so the pose's `lift` is dropped). */
const OWNS_LIFT: Record<string, boolean> = { walk: true, crouch: true, jump: true }
/** The jump clip has no root motion, so the runtime adds the arc (metres) between its take-off and landing marks. */
const JUMP_HEIGHT = 0.2
/** Skits that are really a motion clip. */
const SKIT_CLIP: Record<string, string> = { squat: "crouch", joyJump: "jump", victory: "jump" }
/** Bones a motion clip can drive: they return to rest whenever a pose does not name them. */
const ZERO_BONES = Object.fromEntries(Object.keys(GROUP).map((b) => [b, [0, 0, 0]])) as Record<string, [number, number, number]>

interface MotionClip {
  clip: THREE.AnimationClip
  quats: { bone: string; node: THREE.Object3D; interp: THREE.Interpolant }[]
  hips: { interp: THREE.Interpolant; restY: number } | null
  duration: number
  loop: boolean
  air: number[] | null
}
interface Motion {
  clips: Record<string, MotionClip>
  hipsNode: THREE.Object3D | null
  cur: string
  prev: string
  curT: number
  prevT: number
  mix: number
  fade: number
}
let motion: Motion | null = null
const mqA = new THREE.Quaternion()
const mqB = new THREE.Quaternion()

/**
 * Same idea as three-vrm's loadMixamoAnimation. The normalized VRM rig has an identity rest pose, so a source local
 * rotation q (bone rest world rotation R, parent rest world rotation P) becomes P * q * R^-1. No axis flip is needed for these clips (see below).
 * Only the vertical hip motion is kept (scaled by hip height); forward and sideways root motion is dropped.
 */
function buildMotion(model: VRM, data: AnimData): Motion {
  const h = model.humanoid
  // Unlike Mixamo, the Quaternius clips already face the same way as our VRM after rotateVRM0: no x/z flip
  // (verified in the lab: with the flip she walked in a deep crouch, leaning back).
  const flip = false
  void model
  const hipsNode = h.getNormalizedBoneNode("hips")
  model.scene.updateMatrixWorld(true)
  const hipsHeight = hipsNode ? hipsNode.getWorldPosition(new THREE.Vector3()).y - model.scene.position.y : data.hipsRestUp
  const scale = hipsHeight / data.hipsRestUp
  const clips: Record<string, MotionClip> = {}
  for (const [name, src] of Object.entries(data.clips)) {
    const tracks: THREE.KeyframeTrack[] = []
    const quats: MotionClip["quats"] = []
    for (const [bone, flat] of Object.entries(src.tracks)) {
      const node = h.getNormalizedBoneNode(bone as never)
      const rest = data.bones[bone]
      if (!node || !rest) continue
      const parentRest = new THREE.Quaternion().fromArray(rest.parent)
      const restInv = new THREE.Quaternion().fromArray(rest.rest).invert()
      const values = new Float32Array(flat.length)
      for (let i = 0; i < flat.length; i += 4) {
        mqA.fromArray(flat, i).premultiply(parentRest).multiply(restInv)
        if (flip) values.set([-mqA.x, mqA.y, -mqA.z, mqA.w], i)
        else mqA.toArray(values, i)
      }
      const track = new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, src.times, values)
      tracks.push(track)
      quats.push({ bone, node, interp: track.createInterpolant() })
    }
    let hips: MotionClip["hips"] = null
    if (hipsNode) {
      const restY = hipsNode.position.y
      const values = new Float32Array(src.up.length * 3)
      src.up.forEach((up, i) => values.set([hipsNode.position.x, restY + (up - data.hipsRestUp) * scale, hipsNode.position.z], i * 3))
      const track = new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, src.times, values)
      tracks.push(track)
      hips = { interp: track.createInterpolant(), restY }
    }
    const duration = src.times[src.times.length - 1]
    clips[name] = { clip: new THREE.AnimationClip(name, duration, tracks), quats, hips, duration, loop: src.loop, air: src.air ?? null }
  }
  return { clips, hipsNode, cur: "idle", prev: "idle", curT: 0, prevT: 0, mix: 1, fade: 0.3 }
}

function selectClip(m: Motion, name: string, fade: number) {
  if (!m.clips[name] || m.cur === name) return
  m.prev = m.cur
  m.prevT = m.curT
  m.cur = name
  m.curT = 0
  m.mix = 0
  m.fade = fade
}

const smooth = (x: number) => x * x * (3 - 2 * x)

/** Layers the active clips over the bones the hand-made pose just set; returns how much of the body height the clips own and the jump arc. */
function applyMotion(m: Motion, dt: number): { liftOwned: number; arc: number } {
  const advance = (name: string, t: number) => {
    const c = m.clips[name]
    return c.loop ? (t + dt) % c.duration : Math.min(t + dt, c.duration)
  }
  m.curT = advance(m.cur, m.curT)
  m.prevT = advance(m.prev, m.prevT)
  m.mix = Math.min(1, m.mix + dt / m.fade)
  const s = smooth(m.mix)
  const layers = m.mix >= 1 ? [{ name: m.cur, t: m.curT, w: 1 }] : [{ name: m.prev, t: m.prevT, w: 1 - s }, { name: m.cur, t: m.curT, w: s }]
  let liftOwned = 0
  let arc = 0
  let dy = 0
  for (const { name, t, w } of layers) {
    const c = m.clips[name]
    if (OWNS_LIFT[name]) liftOwned += w
    if (c.air && t >= c.air[0] && t <= c.air[1]) {
      const u = (t - c.air[0]) / (c.air[1] - c.air[0])
      arc += w * JUMP_HEIGHT * 4 * u * (1 - u)
    }
    if (c.hips) dy += w * INFLUENCE[name].hips * (c.hips.interp.evaluate(t)[1] - c.hips.restY)
    for (const { bone, node, interp } of c.quats) {
      const k = w * INFLUENCE[name][GROUP[bone]]
      if (k <= 0) continue
      mqB.fromArray(interp.evaluate(t) as unknown as number[])
      node.quaternion.slerp(mqB, k)
    }
  }
  const rest = m.clips[m.cur].hips
  if (m.hipsNode && rest) m.hipsNode.position.y = rest.restY + dy
  return { liftOwned, arc }
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
  const bones = { ...ZERO_BONES, ...REST.bones, ...pose.bones }
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
/** -1 walking to the left of the screen, 1 to the right, 0 standing (set by the app while it moves her window). */
let walking = 0
let baseTurn = 0
let skit: { scene: Scene; start: number } | null = null
/** performance.now() plus the time the lab skipped ahead with debug.step. */
let skew = 0
const nowMs = () => performance.now() + skew
let nextSkitAt = nowMs() + 4000
let last: string | null = null
const taps = { count: 0, at: 0 }

function play(id: string) {
  const s = SKITS[id]
  if (!s) return
  skit = { scene: s, start: nowMs() }
  last = id
}

function setMood(m: string) {
  if (!BASE[m] || m === mood) return
  const enter = ENTER_SKIT[m]
  mood = m
  skit = null
  if (enter) play(enter)
  nextSkitAt = nowMs() + 5000 + Math.random() * 5000
}

function tap() {
  const now = nowMs()
  taps.count = now - taps.at < 1800 ? taps.count + 1 : 1
  taps.at = now
  play(TAP_ORDER[Math.min(TAP_ORDER.length - 1, taps.count - 1)])
}

window.cheri = {
  setMood,
  play,
  tap,
  pet: () => play("pet"),
  walk: (dir: number) => {
    walking = dir > 0 ? 1 : dir < 0 ? -1 : 0
    if (walking) skit = null
  },
  // Lab only: grab the current frame (render + read back in the same task, no preserveDrawingBuffer needed).
  debug: {
    // Lab only: advance the animation by n steps of dt seconds without waiting for (throttled) frames.
    step: (n: number, dt = 1 / 30) => {
      for (let i = 0; i < n; i++) {
        skew += dt * 1000
        step(dt)
      }
    },
    snap: () => (renderer.render(scene, camera), canvas.toDataURL("image/png")) },
}

// touches: tap, long press (pet) and drag (moves the floating window in the app)
let down: { x: number; y: number; t: number; moved: boolean } | null = null
let holdTimer: ReturnType<typeof setTimeout> | null = null
// two fingers: pinch to resize the floating window (the app applies the size)
const touches = new Map<number, { x: number; y: number }>()
let pinch: { d0: number; scale: number } | null = null
const spread = () => {
  const [a, b] = [...touches.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}
canvas.addEventListener("pointerdown", (e) => {
  touches.set(e.pointerId, { x: e.screenX, y: e.screenY })
  if (touches.size === 2) {
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = null
    down = null
    pinch = { d0: Math.max(1, spread()), scale: 1 }
    post({ type: "pinchStart" })
    return
  }
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
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.screenX, y: e.screenY })
  if (pinch && touches.size === 2) {
    pinch.scale = spread() / pinch.d0
    post({ type: "pinch", scale: pinch.scale })
    return
  }
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
const endTouch = (e: PointerEvent) => {
  touches.delete(e.pointerId)
  if (pinch && touches.size < 2) {
    post({ type: "pinchEnd", scale: pinch.scale })
    pinch = null
    down = null
    return true
  }
  return false
}
canvas.addEventListener("pointercancel", (e) => void endTouch(e))
canvas.addEventListener("pointerup", (e) => {
  if (endTouch(e)) return
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
  step(Math.min(0.05, clock.getDelta()))
}

function step(dt: number) {
  const now = nowMs()
  if (skit && now - skit.start >= skit.scene.ms) {
    skit = null
    nextSkitAt = now + 6000 + Math.random() * 7000
  }
  if (!skit && !walking && now >= nextSkitAt) {
    const pool = (MOOD_SKITS[mood] ?? []).filter((id) => id !== last)
    if (pool.length) play(pool[Math.floor(Math.random() * pool.length)])
    else nextSkitAt = now + 8000
  }
  const base = walking ? { ...sample(WALK, now, REST), turn: walking * 75 } : sample(BASE[mood], now, REST)
  const pose = skit && !walking ? sample(skit.scene, now - skit.start, base) : base
  const breathe = Math.sin(now / 800) * 1.2
  const bones: BonePose = { ...pose.bones, chest: [(pose.bones.chest?.[0] ?? 0) + breathe, pose.bones.chest?.[1] ?? 0, pose.bones.chest?.[2] ?? 0] }
  let lift = pose.lift
  if (motion) {
    // Pick the motion clip: walking, a clip skit (squat / jump), else the idle clip. The hand-made leg, hip and (while a
    // clip drives the trunk) spine poses are dropped so they do not fight it; arms, head and face stay hand-made.
    const clipSkit = skit && !walking ? SKIT_CLIP[skit.scene.id] : undefined
    const skitT = skit ? now - skit.start : 0
    const target = clipSkit ? motion.clips[clipSkit] : undefined
    const running = !!target && !!skit && (target.loop ? skitT < skit.scene.ms - 350 : motion.cur !== clipSkit || motion.curT < target.duration)
    const want = walking ? "walk" : running ? clipSkit : "idle"
    selectClip(motion, want, want === "jump" ? 0.15 : want === "idle" ? 0.35 : 0.4)
    for (const name of Object.keys(GROUP)) if (GROUP[name] !== "trunk" || motion.cur !== "idle") delete bones[name as Bone]
  }
  const posed: Pose = { ...pose, bones }
  applyBones(posed, 1 - Math.exp(-dt * 14))
  if (motion) {
    const m = applyMotion(motion, dt)
    lift = pose.lift * (1 - m.liftOwned) + m.arc
  }
  applyArms(posed, 1 - Math.exp(-dt * 10))
  applyFace(posed, now)
  applyLook(posed)
  if (vrm) {
    vrm.scene.position.y = lift
    vrm.scene.rotation.y = baseTurn + posed.turn * DEG
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
