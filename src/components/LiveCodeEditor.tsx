import {useEffect,useRef,useState} from "react"
import {TextInput,View} from "react-native"
import {WebView} from "react-native-webview"
import {useTheme} from "../theme/useTheme"

const MAX_CHARS=256*1024
// Local-only editor document. Source text is serialized as data, never markup.
function literal(value:unknown){return JSON.stringify(value).replace(/</g,"\\u003c").replace(/\u2028/g,"\\u2028").replace(/\u2029/g,"\\u2029")}
export function LiveCodeEditor({value,onChange,disabled}:{value:string;onChange:(value:string)=>void;disabled:boolean}){
 const p=useTheme(),web=useRef<WebView>(null),[fallback,setFallback]=useState(false)
 const [source]=useState(()=>({html:String.raw`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'"><style>
 html,body{margin:0;height:100%;overflow:hidden;background:${p.surface2};color:${p.text};}
 #wrap{height:100%;position:relative;overflow:hidden}
 pre,textarea{margin:0;padding:12px;border:0;box-sizing:border-box;position:absolute;inset:0;width:100%;height:100%;font:14px/21px monospace;white-space:pre;overflow:auto;tab-size:4;letter-spacing:0;text-align:left}
 pre{pointer-events:none;overflow:hidden;color:${p.text};}
 textarea{background:transparent;color:transparent;caret-color:${p.text};-webkit-text-fill-color:transparent;resize:none;outline:none}
 textarea::selection{background:rgba(120,160,220,.3)}
 .k{color:${p.magenta}}.s{color:${p.green}}.n{color:${p.cyan}}.c{color:${p.muted}}
 </style></head><body><div id="wrap"><pre id="paint" aria-hidden="true"></pre><textarea id="edit" aria-label="Code" spellcheck="false" autocorrect="off" autocapitalize="off" wrap="off" maxlength="${MAX_CHARS}"></textarea></div><script>
 const editor=document.getElementById('edit'),paint=document.getElementById('paint');
 const initial=${literal(value)};
 editor.value=initial;
 function sync(){paint.scrollTop=editor.scrollTop;paint.scrollLeft=editor.scrollLeft}
 const re=/\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|def|async|await|try|catch|new|true|false|null|None|public|private|interface|type)\b|\b\d+(?:\.\d+)?\b/g;
 function render(){
  const value=editor.value,fragment=document.createDocumentFragment();let last=0;
  re.lastIndex=0;let m;
  while((m=re.exec(value))!==null){
   if(m.index>last)fragment.append(document.createTextNode(value.slice(last,m.index)));
   const token=document.createElement('span'),s=m[0];
   token.className=s.startsWith('//')||s.startsWith('#')?'c':s[0]==='"'||s[0]==="'"?'s':/^\d/.test(s)?'n':'k';
   token.textContent=s;fragment.append(token);last=m.index+s.length;
  }
  fragment.append(document.createTextNode(value.slice(last)+'\n'));paint.replaceChildren(fragment);sync();
 }
 let frame=0;
 editor.addEventListener('input',()=>{
   cancelAnimationFrame(frame);frame=requestAnimationFrame(render);
   if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'change',text:editor.value}));
 });
 editor.addEventListener('scroll',sync);render();
 window.agentlinkReadOnly=value=>{editor.readOnly=!!value};
 </script></body></html>`}))
 useEffect(()=>{web.current?.injectJavaScript(`window.agentlinkReadOnly&&window.agentlinkReadOnly(${disabled});true;`)},[disabled])
 return <View style={{height:320,borderWidth:1,borderColor:p.border,borderRadius:8,overflow:"hidden"}}>
 {fallback?<TextInput value={value} onChangeText={onChange} editable={!disabled} multiline autoCorrect={false} autoCapitalize="none" maxLength={MAX_CHARS} style={{flex:1,textAlignVertical:"top",fontFamily:p.mono,color:p.text,backgroundColor:p.surface2,padding:12}}/>:
 <WebView ref={web} source={source} originWhitelist={["*"]} onShouldStartLoadWithRequest={r=>r.url==="about:blank"||r.url.startsWith("data:text/html,")} javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" setSupportMultipleWindows={false} incognito onError={()=>setFallback(true)} onLoadEnd={()=>web.current?.injectJavaScript(`window.agentlinkReadOnly&&window.agentlinkReadOnly(${disabled});true;`)} onMessage={event=>{try{const msg=JSON.parse(event.nativeEvent.data);if(!disabled&&msg?.type==="change"&&typeof msg.text==="string"&&msg.text.length<=MAX_CHARS)onChange(msg.text)}catch{}}} style={{flex:1}}/>}
 </View>
}
