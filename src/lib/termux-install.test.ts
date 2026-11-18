import { test } from "node:test"
import assert from "node:assert/strict"
import {
  assetAbi,
  failureStep,
  findChecksumAsset,
  formatSize,
  parseSha256s,
  pickAsset,
  planRelease,
  progressPercent,
  versionLabel,
  wizardStatuses,
  wizardStep,
  type ReleaseAsset,
} from "./termux-install.ts"

const base = "termux-app_v0.118.3+github-debug"
const asset = (abi: string, size = 100): ReleaseAsset => ({ name: `${base}_${abi}.apk`, browser_download_url: `https://x/${abi}`, size })
const assets = [asset("universal"), asset("arm64-v8a"), asset("armeabi-v7a"), asset("x86"), asset("x86_64"), { name: `${base}_sha256sums`, browser_download_url: "https://x/sums" }]

test("assetAbi reads the abi and ignores other files", () => {
  assert.equal(assetAbi(`${base}_arm64-v8a.apk`), "arm64-v8a")
  assert.equal(assetAbi(`${base}_universal.apk`), "universal")
  assert.equal(assetAbi(`${base}_sha256sums`), null)
})

test("pickAsset takes the first device abi that has an apk", () => {
  assert.equal(pickAsset(assets, ["arm64-v8a", "armeabi-v7a"])?.name, `${base}_arm64-v8a.apk`)
  assert.equal(pickAsset(assets, ["armeabi-v7a", "armeabi"])?.name, `${base}_armeabi-v7a.apk`)
})

test("pickAsset falls back to universal, then to null", () => {
  assert.equal(pickAsset(assets, ["riscv64"])?.name, `${base}_universal.apk`)
  assert.equal(pickAsset(assets, [])?.name, `${base}_universal.apk`)
  assert.equal(pickAsset([asset("arm64-v8a")], ["x86"]), null)
  assert.equal(pickAsset([], ["arm64-v8a"]), null)
})

test("parseSha256s maps filenames to lowercase hashes", () => {
  const h1 = "A".repeat(64)
  const h2 = "b".repeat(64)
  const map = parseSha256s(`${h1}  ${base}_arm64-v8a.apk\r\n${h2} *${base}_x86.apk\nnot a line\n\n`)
  assert.equal(map.size, 2)
  assert.equal(map.get(`${base}_arm64-v8a.apk`), "a".repeat(64))
  assert.equal(map.get(`${base}_x86.apk`), h2)
})

test("findChecksumAsset, versionLabel, formatSize, progressPercent", () => {
  assert.equal(findChecksumAsset(assets)?.name, `${base}_sha256sums`)
  assert.equal(findChecksumAsset([asset("x86")]), null)
  assert.equal(versionLabel("v0.118.3"), "0.118.3")
  assert.equal(versionLabel(undefined), "")
  assert.equal(formatSize(1024 * 1024 * 106), "106.0 MB")
  assert.equal(formatSize(undefined), "")
  assert.equal(progressPercent(50, 200), 25)
  assert.equal(progressPercent(5, 0), 0)
  assert.equal(progressPercent(300, 200), 100)
})

test("planRelease needs an apk and a checksum file", () => {
  const plan = planRelease({ tag_name: "v0.118.3", assets }, ["arm64-v8a"])
  assert.equal(plan?.version, "0.118.3")
  assert.equal(plan?.checksumUrl, "https://x/sums")
  assert.equal(planRelease({ tag_name: "v1", assets: [asset("arm64-v8a")] }, ["arm64-v8a"]), null)
  assert.equal(planRelease({}, ["arm64-v8a"]), null)
})

test("wizardStep walks the steps in order", () => {
  const s = (o: Partial<Parameters<typeof wizardStep>[0]>) => wizardStep({ installed: false, permission: false, lastTest: null, ...o })
  assert.equal(s({}), "install")
  assert.equal(s({ installed: true }), "open")
  assert.equal(s({ installed: true, termuxOpenedOnce: null }), "open")
  assert.equal(s({ installed: true, termuxOpenedOnce: true }), "allow")
  assert.equal(s({ installed: true, termuxOpenedOnce: true, allowDone: true }), "permission")
  assert.equal(s({ installed: true, termuxOpenedOnce: true, allowDone: true, permission: true }), "test")
  assert.equal(s({ installed: true, termuxOpenedOnce: true, allowDone: true, permission: true, lastTest: "failed" }), "test")
  assert.equal(s({ installed: true, permission: true, lastTest: "ok" }), "done")
})

test("a passing test proves the middle steps; losing Termux resets everything", () => {
  const ok = wizardStatuses({ installed: true, permission: true, lastTest: "ok" })
  assert.deepEqual(Object.values(ok), ["done", "done", "done", "done", "done"])
  const gone = wizardStatuses({ installed: false, termuxOpenedOnce: true, allowDone: true, permission: true, lastTest: "ok" })
  assert.deepEqual(Object.values(gone), ["current", "todo", "todo", "todo", "todo"])
})

test("failureStep points at the step to revisit", () => {
  assert.equal(failureStep({ code: "timeout" }), "open")
  assert.equal(failureStep({ code: "no_permission", message: "x" }), "permission")
  assert.equal(failureStep({ code: "not_installed" }), "install")
  assert.equal(failureStep("RUN_COMMAND: allow-external-apps is not set to true"), "allow")
  assert.equal(failureStep({ message: "weird" }), null)
  assert.equal(failureStep(null), null)
})
