import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
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
execFileSync(bin, ["tools/launcher.js", "--bundle", "--platform=node", "--format=cjs", "--target=node18", "--external:./launcher-update.js", "--outfile=" + asset], { cwd: root, stdio: "inherit" })
execFileSync(process.execPath, ["--check", asset])
execFileSync(process.execPath, [
  "-e",
  "if (require(process.argv[1]).VERSION !== Number(process.argv[2])) process.exit(1)",
  asset,
  String(VERSION),
])
console.log(asset)
