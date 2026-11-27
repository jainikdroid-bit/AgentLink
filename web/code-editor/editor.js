import {EditorView,basicSetup} from "codemirror"
import {EditorState,Compartment} from "@codemirror/state"
import {openSearchPanel} from "@codemirror/search"
import {startCompletion} from "@codemirror/autocomplete"
import {undo,redo} from "@codemirror/commands"
import {javascript} from "@codemirror/lang-javascript"
import {python} from "@codemirror/lang-python"
import {json} from "@codemirror/lang-json"
import {html} from "@codemirror/lang-html"
import {css} from "@codemirror/lang-css"
import {markdown} from "@codemirror/lang-markdown"

const max=256*1024
let editor=null
const readOnly=new Compartment(),editable=new Compartment()
const post=(value)=>window.ReactNativeWebView?.postMessage(JSON.stringify(value))
function lang(file){
 const ext=file.toLowerCase().split(".").at(-1)
 if(["js","jsx","mjs","cjs","ts","tsx"].includes(ext))return javascript({typescript:ext==="ts"||ext==="tsx",jsx:ext==="jsx"||ext==="tsx"})
 if(ext==="py")return python()
 if(ext==="json")return json()
 if(["html","htm"].includes(ext))return html()
 if(ext==="css")return css()
 if(["md","markdown"].includes(ext))return markdown()
 return []
}
function configure(config){
 if(!config||typeof config.text!=="string"||config.text.length>max||typeof config.file!=="string")return
 if(editor)editor.destroy()
 const color=(v,fallback)=>typeof v==="string"&&/^#[a-f0-9]{6}$/i.test(v)?v:fallback
 const bg=color(config.bg,"#141926"),fg=color(config.fg,"#e8ecf4"),accent=color(config.accent,"#22d3ee")
 document.body.style.backgroundColor=bg;document.body.style.color=fg
 const theme=EditorView.theme({
  "&":{height:"100%",backgroundColor:bg,color:fg,fontSize:"14px"},
  ".cm-scroller":{overflow:"auto",fontFamily:"monospace"},
  ".cm-content":{caretColor:fg},
  ".cm-gutters":{backgroundColor:bg,color:fg,border:"none",opacity:".8"},
  ".cm-activeLine":{backgroundColor:"#80808020"},
  ".cm-cursor":{borderLeftColor:fg},
  ".cm-selectionBackground":{backgroundColor:accent+"55"},
  ".cm-panels":{backgroundColor:bg,color:fg},
  ".cm-tooltip":{backgroundColor:bg,color:fg}
 },{dark:true})
 editor=new EditorView({state:EditorState.create({doc:config.text,extensions:[
  basicSetup,lang(config.file),theme,
  readOnly.of(EditorState.readOnly.of(!!config.disabled)),editable.of(EditorView.editable.of(!config.disabled)),
  EditorState.transactionFilter.of(tr=>tr.newDoc.length>max?[]:tr),
  EditorView.updateListener.of(update=>{if(update.docChanged)post({type:"change",text:update.state.doc.toString()})})
 ]}),parent:document.getElementById("editor")})
 for(const button of document.querySelectorAll("button[data-command]")){button.textContent=config.labels?.[button.dataset.command]||button.textContent}
}
window.agentlinkEditor={init:configure,readOnly(value){if(editor)editor.dispatch({effects:[readOnly.reconfigure(EditorState.readOnly.of(!!value)),editable.reconfigure(EditorView.editable.of(!value))]})}}
document.querySelectorAll("button[data-command]").forEach(button=>button.onclick=()=>{
 if(!editor)return
 const action={search:openSearchPanel,complete:startCompletion,undo,redo}[button.dataset.command]
 if(action)action(editor)
})
post({type:"ready"})
