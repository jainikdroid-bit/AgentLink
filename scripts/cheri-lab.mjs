// Builds a single-file browser lab for the Cheri mascot: every mood and scene, taps and long
// press, auto mode, and small previews. Uses the same src/lib/cheri modules as the app.
//   node scripts/cheri-lab.mjs <out.html>
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const files = ["types", "scenes", "render", "director"]
const modules = files
  .map((name) => {
    const source = readFileSync(join(root, "src/lib/cheri", `${name}.ts`), "utf8")
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
    return `"./${name}.ts": function (module, exports, require) {\n${js}\n}`
  })
  .join(",\n")

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Cheri lab</title>
<style>
body{margin:0;background:#07080c;color:#e8ecf4;font:14px/1.5 system-ui,sans-serif;padding:16px}
h1{font-size:18px;font-weight:500;margin:0 0 4px} p{color:#8a93a8;margin:0 0 12px}
.wrap{display:flex;gap:20px;flex-wrap:wrap;align-items:flex-start}
#stage{width:min(360px,90vw);height:min(360px,90vw);cursor:pointer;user-select:none;touch-action:none}
#stage svg,.mini svg{width:100%;height:100%}
.minis{display:flex;gap:12px;align-items:flex-end;margin-top:8px}.mini{width:44px;height:44px}.mini.m{width:96px;height:96px}
.panel{flex:1;min-width:260px}
button{background:#141926;color:#e8ecf4;border:1px solid #1c2333;border-radius:8px;padding:6px 10px;margin:3px;font:13px system-ui;cursor:pointer}
button.on{border-color:#22d3ee;color:#22d3ee} h2{font-size:13px;color:#8a93a8;font-weight:600;margin:12px 0 4px;text-transform:uppercase}
#now{color:#22d3ee;font-family:monospace}
</style></head><body>
<h1>Cheri lab</h1><p>Tap her (several taps escalate), hold to pet. Pick a mood, or play any scene.</p>
<div class="wrap"><div><div id="stage"></div><div class="minis"><div class="mini m" id="m96"></div><div class="mini" id="m44"></div><span id="now"></span></div></div>
<div class="panel"><h2>Mood</h2><div id="moods"></div><label><input type="checkbox" id="auto" checked> auto scenes</label><h2>Scenes</h2><div id="scenes"></div></div></div>
<script>
const __m = {${modules}};
const __c = {};
function require(n){ if(__c[n]) return __c[n].exports; const module={exports:{}}; __c[n]=module; __m[n](module,module.exports,require); return module.exports; }
const D = require("./director.ts"), R = require("./render.ts"), S = require("./scenes.ts");
const MOODS=["idle","thinking","working","writing","loading","success","error","offline"];
let mood="idle", playing=null, last=null, next=performance.now()+2000, taps={n:0,at:0}, holdTimer=null;
const stage=document.getElementById("stage"), m96=document.getElementById("m96"), m44=document.getElementById("m44"), now$=document.getElementById("now");
function play(id){ playing={id,start:performance.now()}; last=id; }
function setMood(m){ const e=D.enterScene(mood,m); mood=m; playing=null; if(e) play(e); next=performance.now()+D.nextDelayMs(mood,Math.random); renderButtons(); }
function renderButtons(){
  document.getElementById("moods").innerHTML=MOODS.map(m=>'<button class="'+(m===mood?'on':'')+'" data-m="'+m+'">'+m+'</button>').join("");
  const groups=Object.entries(S.MOOD_SCENES).filter(([k])=>k!=="writing").concat([["taps",S.TAP_SCENES]]);
  document.getElementById("scenes").innerHTML=groups.map(([k,list])=>'<div><b style="color:#8a93a8">'+k+'</b> '+list.map(s=>'<button data-s="'+s.id+'">'+s.id+'</button>').join("")+'</div>').join("");
}
document.addEventListener("click",e=>{ const t=e.target; if(t.dataset.m) setMood(t.dataset.m); if(t.dataset.s) play(t.dataset.s); });
stage.addEventListener("pointerdown",()=>{ holdTimer=setTimeout(()=>{ holdTimer=null; play(D.PET_SCENE); },550); });
stage.addEventListener("pointerup",()=>{ if(!holdTimer) return; clearTimeout(holdTimer); holdTimer=null; const t=performance.now(); taps.n = t-taps.at<D.TAP_WINDOW_MS ? taps.n+1 : 1; taps.at=t; play(D.tapScene(taps.n)); });
renderButtons();
let lastDraw=0;
function tick(t){
  requestAnimationFrame(tick);
  if(t-lastDraw<1000/15) return; lastDraw=t;
  if(playing && t-playing.start>=D.sceneLength(playing.id)) { playing=null; next=t+D.nextDelayMs(mood,Math.random); }
  if(!playing && document.getElementById("auto").checked && t>=next){ const id=D.pickScene(mood,Math.random,last); if(id) play(id); }
  const svg=R.renderFrame(D.frameAt(mood,playing,t),mood);
  stage.innerHTML=svg; m96.innerHTML=svg; m44.innerHTML=svg;
  now$.textContent=mood+(playing?" · "+playing.id:"")+" · "+(svg.length/1024).toFixed(1)+" KB";
}
requestAnimationFrame(tick);
</script></body></html>`

const out = process.argv[2] ?? join(root, "cheri-lab.html")
writeFileSync(out, html)
console.log("wrote", out)
