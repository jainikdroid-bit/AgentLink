import { execFileSync, fork } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, rmdirSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const { VERSION } = require("../tools/launcher.js")
const dir = resolve(process.argv[2] ?? "dist")
const win = join(root, "node_modules/@esbuild/win32-x64/esbuild.exe")
const bin = existsSync(win) ? win : join(root, "node_modules/.bin/esbuild")
const asset = join(dir, "AgentLink-launcher-" + VERSION + ".cjs")
mkdirSync(dir, { recursive: true })
execFileSync(bin, [
  "tools/launcher.js", "--bundle", "--platform=node", "--format=cjs", "--target=node18",
  "--external:./launcher-update.js",
  // The phone bridge imports the launcher, so esbuild wraps its CommonJS module.
  // The original require.main guard is then false inside that wrapper.
  "--footer:js=if (require.main === module) module.exports.main()",
  "--outfile=" + asset,
], { cwd: root, stdio: "inherit" })
execFileSync(process.execPath, ["--check", asset])
execFileSync(process.execPath, [
  "-e",
  "if (require(process.argv[1]).VERSION !== Number(process.argv[2])) process.exit(1)",
  asset,
  String(VERSION),
])

const profile = mkdtempSync(join(tmpdir(), "agentlink-launcher-build-"))
try {
  const listener = createServer()
  await new Promise((ready, reject) => {
    listener.once("error", reject)
    listener.listen(0, "127.0.0.1", ready)
  })
  const { port } = listener.address()
  await new Promise((ready, reject) => listener.close((error) => error ? reject(error) : ready()))

  const child = fork(asset, [], {
    env: { ...process.env, OPENCODE_CONNECT_DIR: profile, OPENCODE_LAUNCHER_PORT: String(port) },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    windowsHide: true,
  })
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => child.kill(), 10_000)
    child.once("error", (error) => { clearTimeout(timer); reject(error) })
    let listening = false
    child.once("exit", () => {
      clearTimeout(timer)
      if (listening) ready()
      else reject(new Error("Bundled launcher exited before reporting readiness"))
    })
    child.on("message", (message) => {
      if (message !== "agentlink-launcher-ready") return
      listening = true
      child.kill()
    })
  })
} finally {
  rmdirSync(profile)
}
console.log(asset)
