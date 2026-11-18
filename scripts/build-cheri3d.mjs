// Bundles the Cheri 3D scene (web/cheri3d) with three.js + three-vrm into one offline HTML page.
//   node scripts/build-cheri3d.mjs [outDir] [--lab]
// Default outDir: android/app/src/main/assets/cheri3d (loaded by the app's WebView). The model
// web/cheri3d/model/cheri.vrm is copied next to it. --lab adds mood/scene buttons for the desktop.
// esbuild is run as its native binary through the ASCII path alias, because its npm launcher
// breaks on the Cyrillic project path on this machine.
import { execFileSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const args = process.argv.slice(2)
const lab = args.includes("--lab")
const outDir = args.find((a) => !a.startsWith("--")) ?? join(root, "android/app/src/main/assets/cheri3d")
const exe = join(root, "node_modules/@esbuild/win32-x64/esbuild.exe")
const bin = existsSync(exe) ? exe : join(root, "node_modules/.bin/esbuild")

mkdirSync(outDir, { recursive: true })
const js = execFileSync(bin, [join(root, "web/cheri3d/scene.ts"), "--bundle", "--format=iife", "--minify", "--target=es2020", "--log-level=warning"], {
  cwd: root,
  maxBuffer: 64 * 1024 * 1024,
}).toString("utf8")

const labUi = lab
  ? `<div id="ui" style="position:fixed;left:8px;top:8px;right:8px;font:12px system-ui;color:#e8ecf4;z-index:2">
${["idle", "thinking", "working", "writing", "loading", "success", "error", "offline"].map((m) => `<button onclick="cheri.setMood('${m}')">${m}</button>`).join("")}
<br>${readFileSync(join(root, "web/cheri3d/poses.ts"), "utf8").match(/^  (\w+): \{\r?\n    id: "/gm).map((s) => s.trim().split(":")[0]).map((id) => `<button onclick="cheri.play('${id}')">${id}</button>`).join("")}
</div><style>button{background:#141926;color:#e8ecf4;border:1px solid #1c2333;border-radius:6px;margin:2px;padding:4px 8px}</style>`
  : ""

const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:${lab ? "#07080c" : "transparent"};overflow:hidden;touch-action:none}#c{width:100%;height:100%;display:block}</style></head>
<body>${labUi}<canvas id="c"></canvas><script>${js.replace(/<\/script/g, "<\\/script")}</script></body></html>`

writeFileSync(join(outDir, "index.html"), html)
copyFileSync(join(root, "web/cheri3d/model/cheri.vrm"), join(outDir, "cheri.vrm"))
console.log(`wrote ${join(outDir, "index.html")} (${Math.round(html.length / 1024)} KB) and cheri.vrm`)
