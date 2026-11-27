import {build} from "esbuild"
import {mkdirSync,writeFileSync,readFileSync,readdirSync,existsSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {join} from "node:path"
const root=fileURLToPath(new URL("../",import.meta.url))
const out=join(root,"android/app/src/main/assets/code-editor")
mkdirSync(out,{recursive:true})
const result=await build({entryPoints:[join(root,"web/code-editor/editor.js")],bundle:true,format:"iife",target:"es2020",minify:true,write:false,legalComments:"inline"})
const js=result.outputFiles[0].text
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'none\'; img-src \'data:\'; base-uri \'none\'; form-action \'none\'"><style>html,body{height:100%;margin:0;overflow:hidden;font:14px system-ui}body{display:flex;flex-direction:column}#toolbar{display:flex;gap:4px;padding:4px;flex-wrap:wrap}button{font:inherit;background:transparent;color:inherit;border:1px solid #808080;border-radius:5px;padding:5px}#editor{flex:1;min-height:0}</style></head><body><div id="toolbar"><button data-command="search">Find</button><button data-command="complete">Complete</button><button data-command="undo">Undo</button><button data-command="redo">Redo</button></div><div id="editor"></div><script>'+js+'</script></body></html>'
writeFileSync(join(out,"index.html"),html)
const lock=JSON.parse(readFileSync(join(root,"package-lock.json"),"utf8")).packages
const names=Object.keys(lock).filter(k=>/^node_modules\/(?:codemirror$|@codemirror\/|@lezer\/|@marijn\/find-cluster-break$|crelt$|style-mod$|w3c-keyname$)/.test(k))
const notices=[]
for(const name of names){
 const dir=join(root,name)
 const files=readdirSync(dir).filter(x=>/^licen[cs]e(?:\.|$)/i.test(x))
 if(!files.length)throw Error("Missing license for "+name)
 for(const file of files)notices.push(name+"@"+lock[name].version+"\n"+readFileSync(join(dir,file),"utf8"))
}
writeFileSync(join(out,"LICENSES.txt"),notices.join("\n\n"))
console.log("Built offline CodeMirror editor",Math.round(html.length/1024),"KiB")
