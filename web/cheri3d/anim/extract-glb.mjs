import { readFileSync } from "node:fs"
export function readGlb(path) {
  const d = readFileSync(path)
  const jl = d.readUInt32LE(12)
  const json = JSON.parse(d.slice(20, 20 + jl).toString("utf8"))
  const bin = d.slice(20 + jl + 8)
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView]
    const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0)
    const out = new Float32Array(a.count * n)
    for (let k = 0; k < out.length; k++) out[k] = bin.readFloatLE(off + k * 4)
    return { data: out, n, count: a.count }
  }
  return { json, acc }
}
