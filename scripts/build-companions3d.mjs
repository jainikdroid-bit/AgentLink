// Offline procedural companions: reuse the installed three.js/esbuild tooling.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
const root=join(dirname(fileURLToPath(import.meta.url)),"..")
const args=process.argv.slice(2)
const lab=args.includes("--lab")
const out=args.find(a=>!a.startsWith("--")) || (lab ? join(root,".companion-lab") : join(root,"android/app/src/main/assets/companions3d"))
const labUi=lab ? readFileSync(join(root,"web/companions3d/lab.html"),"utf8") : ""
const win=join(root,"node_modules/@esbuild/win32-x64/esbuild.exe")
const bin=existsSync(win)?win:join(root,"node_modules/.bin/esbuild")
const js=execFileSync(bin,[join(root,"web/companions3d/scene.ts"),"--bundle","--format=iife","--minify","--target=es2020","--log-level=warning"],{cwd:root,maxBuffer:64*1024*1024}).toString("utf8")
mkdirSync(out,{recursive:true})
for(const kind of ["byte","orbit"]){
  const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;height:100%;background:transparent;overflow:hidden;touch-action:none}canvas{width:100%;height:100%;display:block}</style></head><body><canvas id="c"></canvas><script>window.__companionKind='+JSON.stringify(kind)+';</script><script>'+js.replace(/<\/script/g,"<\\/script")+'</script>'+labUi+'</body></html>'
  writeFileSync(join(out,kind+".html"),html)
}
console.log("Wrote offline Byte and Orbit 3D scenes to "+out)
