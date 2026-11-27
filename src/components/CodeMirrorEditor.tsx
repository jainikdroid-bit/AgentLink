import {useEffect,useRef,useState} from "react"
import {Platform,Text,View} from "react-native"
import {WebView} from "react-native-webview"
import {useTranslation} from "react-i18next"
import {useTheme} from "../theme/useTheme"
import {LiveCodeEditor} from "./LiveCodeEditor"

const URI="file:///android_asset/code-editor/index.html"
const SOURCE={uri:URI}
const literal=(v:unknown)=>JSON.stringify(v).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")
export function CodeMirrorEditor({file,value,onChange,disabled}:{file:string;value:string;onChange:(text:string)=>void;disabled:boolean}){
 const p=useTheme(),{t}=useTranslation(),web=useRef<WebView>(null)
 const [fallback,setFallback]=useState(()=>Platform.OS!=="android"||value.length>256*1024||/\r(?!\n)/.test(value)||(/\r\n/.test(value)&&/(^|[^\r])\n/.test(value)))
 const [ready,setReady]=useState(false),initialized=useRef(false),[crlf]=useState(()=>value.includes("\r\n"))
 const current=useRef({value,disabled,onChange});current.current={value,disabled,onChange}
 useEffect(()=>{if(fallback||ready)return;const timer=setTimeout(()=>setFallback(true),6000);return()=>clearTimeout(timer)},[fallback,ready])
 useEffect(()=>{if(ready&&!fallback)web.current?.injectJavaScript("window.agentlinkEditor?.readOnly("+disabled+");true;")},[disabled,ready,fallback])
 if(fallback)return <View style={{gap:4}}><Text style={{color:p.muted,fontSize:11}}>{t("workspace.editorFallback")}</Text><LiveCodeEditor value={value} disabled={disabled} onChange={onChange}/></View>
 return <View style={{height:440,borderWidth:1,borderColor:p.border,borderRadius:8,overflow:"hidden"}}>
 <WebView ref={web} source={SOURCE} originWhitelist={["*"]} onShouldStartLoadWithRequest={r=>r.url===URI||r.url==="about:blank"} onError={()=>setFallback(true)} onHttpError={()=>setFallback(true)} javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" setSupportMultipleWindows={false} incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} onMessage={event=>{
  if(event.nativeEvent.url!==URI)return
  try{
    const msg=JSON.parse(event.nativeEvent.data)
    if(msg?.type==="ready"&&!initialized.current){
     initialized.current=true
     const config={file,text:current.current.value,disabled:current.current.disabled,bg:p.surface2,fg:p.text,accent:p.cyan,labels:{search:t("workspace.editorFind"),complete:t("workspace.editorComplete"),undo:t("workspace.editorUndo"),redo:t("workspace.editorRedo")}}
     web.current?.injectJavaScript("window.agentlinkEditor.init("+literal(config)+");true;");setReady(true)
    }else if(initialized.current&&msg?.type==="change"&&!current.current.disabled&&typeof msg.text==="string"&&msg.text.length<=256*1024)current.current.onChange(crlf?msg.text.replace(/\r?\n/g,"\r\n"):msg.text)
  }catch{}
 }} style={{flex:1,backgroundColor:p.surface2}}/>
 </View>
}
