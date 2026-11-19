// Regenerates cheri-anim.json from Quaternius UAL1_Standard.glb (Unreal-Godot folder): node extract-anim.mjs <glb> <out.json>
import { readGlb } from "./extract-glb.mjs"
import { writeFileSync } from "node:fs"
const [src, out] = process.argv.slice(2)
const { json, acc } = readGlb(src)
const nodes = json.nodes
const byName = Object.fromEntries(nodes.map((n, i) => [n.name, i]))
const parent = {}
nodes.forEach((n, i) => (n.children || []).forEach((c) => (parent[c] = i)))
const qmul = (a, b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0], a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]]
const worldRest = (i) => { const r = nodes[i].rotation || [0,0,0,1]; return parent[i] === undefined ? r : qmul(worldRest(parent[i]), r) }
const MAP = { pelvis: "hips", spine_01: "spine", spine_02: "chest", spine_03: "upperChest",
  thigh_l: "leftUpperLeg", calf_l: "leftLowerLeg", foot_l: "leftFoot", ball_l: "leftToes",
  thigh_r: "rightUpperLeg", calf_r: "rightLowerLeg", foot_r: "rightFoot", ball_r: "rightToes" }
const r5 = (v) => Math.round(v * 1e5) / 1e5
const rq = (q) => q.map(r5)
const bones = {}
for (const [s, v] of Object.entries(MAP)) {
  const i = byName[s]
  bones[v] = { rest: rq(worldRest(i)), parent: rq(worldRest(parent[i])) }
}
// root has -90deg about X: node-local z is world up.
const hipsRestUp = nodes[byName.pelvis].translation[2]
function clipData(name) {
  const a = json.animations.find((x) => x.name === name)
  const times = Array.from(acc(a.samplers[a.channels[0].sampler].input).data)
  const tracks = {}
  for (const [s, v] of Object.entries(MAP)) {
    const ch = a.channels.find((c) => c.target.node === byName[s] && c.target.path === "rotation")
    tracks[v] = Array.from(acc(a.samplers[ch.sampler].output).data)
  }
  const tc = a.channels.find((c) => c.target.node === byName.pelvis && c.target.path === "translation")
  const tr = acc(a.samplers[tc.sampler].output).data
  const up = times.map((_, k) => tr[k * 3 + 2])
  return { times, tracks, up }
}
const slice = (c, t0, t1) => {
  const idx = c.times.map((t, i) => (t >= t0 - 1e-6 && t <= t1 + 1e-6 ? i : -1)).filter((i) => i >= 0)
  const tracks = {}
  for (const v of Object.keys(c.tracks)) tracks[v] = idx.flatMap((i) => c.tracks[v].slice(i * 4, i * 4 + 4))
  return { times: idx.map((i) => c.times[i] - c.times[idx[0]]), tracks, up: idx.map((i) => c.up[i]) }
}
const nlerp = (a, b, t) => { let d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; const s = d < 0 ? -1 : 1; const r = a.map((x, i) => x * (1 - t) + s * b[i] * t); const n = Math.hypot(...r); return r.map((x) => x / n) }
const BLEND = 4
const concat = (parts) => {
  const times = [], up = [], tracks = Object.fromEntries(Object.keys(parts[0].tracks).map((k) => [k, []]))
  const marks = []
  let off = 0
  parts.forEach((p, pi) => {
    if (pi > 0) {
      const prev = parts[pi - 1], last = prev.times.length - 1
      for (let b = 1; b <= BLEND; b++) {
        const f = b / (BLEND + 1)
        times.push(off + (b - 1) / 30)
        up.push(prev.up[last] * (1 - f) + p.up[0] * f)
        for (const k of Object.keys(tracks)) tracks[k].push(...nlerp(prev.tracks[k].slice(last * 4, last * 4 + 4), p.tracks[k].slice(0, 4), f))
      }
      off += BLEND / 30
    }
    marks.push(off)
    p.times.forEach((t, i) => { times.push(t + off); up.push(p.up[i]); for (const k of Object.keys(tracks)) tracks[k].push(...p.tracks[k].slice(i * 4, i * 4 + 4)) })
    off += p.times.at(-1) + 1 / 30
  })
  return { times, tracks, up, marks }
}
const ang = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]))) * 180 / Math.PI
const q = (c, k, i) => c.tracks[k].slice(i * 4, i * 4 + 4)
const S = clipData("Jump_Start"), L = clipData("Jump_Land"), Lp = clipData("Jump_Loop")
for (const [n, a, ia, b, ib] of [["Start@0.6->Land@0", S, 18, L, 0], ["Start@0.6->Loop@0", S, 18, Lp, 0], ["Loop@0.5->Land@0", Lp, 15, L, 0]]) {
  const d = Object.keys(MAP).map((k) => MAP[k]).map((k) => ang(q(a, k, ia), q(b, k, ib)))
  console.log(n, "max joint jump deg", Math.max(...d).toFixed(1))
}
const jump = concat([slice(S, 0, 0.7), slice(Lp, 0, 0.3), slice(L, 0, 0.9)])
const air = [0.1, jump.marks[2] + 0.1]
console.log("air", air)
const clips = {
  idle: { ...clipData("Idle_Loop"), loop: true },
  walk: { ...clipData("Walk_Loop"), loop: true },
  crouch: { ...clipData("Crouch_Idle_Loop"), loop: true },
  jump: { ...jump, loop: false, air: [r5(air[0]), r5(air[1])] },
}
for (const c of Object.values(clips)) { c.times = c.times.map(r5); c.up = c.up.map(r5); for (const k of Object.keys(c.tracks)) c.tracks[k] = c.tracks[k].map(r5) }
for (const c of Object.values(clips)) delete c.marks
const o = { source: "Quaternius Universal Animation Library [Standard], CC0 1.0", hipsRestUp: r5(hipsRestUp), bones, clips }
writeFileSync(out, JSON.stringify(o))
console.log("bytes", JSON.stringify(o).length, Object.entries(clips).map(([k, c]) => `${k}:${c.times.length}f/${c.times.at(-1).toFixed(2)}s`).join(" "))
