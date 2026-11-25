import {useCallback,useRef,useState} from "react"
import {Alert,Linking,Modal,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import {WebView} from "react-native-webview"
import {useSafeAreaInsets} from "react-native-safe-area-context"
import {router,useFocusEffect,useLocalSearchParams} from "expo-router"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {getConnectionTarget,useConnections} from "../src/stores/connections"
import {call,getHostHardware,listAgents,listSavedSessions,type SavedAgentSession,type HostHardware,type RunningAgent,type AgentInfo,type AcpTarget} from "../src/lib/acp/api"
import {attentionRows} from "../src/lib/attention"
import {routeUrl} from "../src/lib/tailnet"
import {highlightLine,parseGitStatus,previewAddress,previewNavigationAllowed} from "../src/lib/workspace-pure"

type Inventory={root:string;statusPorcelain:string;branches:string[];worktrees:{path:string;branch:string|null;head:string|null;locked:boolean}[]}
type InboxEvent={id:string;at:number;category:string;agent:string;bridgeId:string}
type BenchModel={engine:string;id:string;state:string}
type Host={id:string;hardware?:HostHardware;running?:RunningAgent[];agents?:AgentInfo[];events?:InboxEvent[];saved?:SavedAgentSession[];pushConfigured?:boolean;error?:string}
type Edit={file:string;text:string;revision:string;dirty:boolean}
const describe=(e:unknown)=>e instanceof Error?e.message:String(e)

export default function Workspace(){
 const p=useTheme(),{t}=useTranslation(),insets=useSafeAreaInsets()
 const [preview,setPreview]=useState<string|null>(null),[previewJs,setPreviewJs]=useState(false),[previewEpoch,setPreviewEpoch]=useState(0)
 const params=useLocalSearchParams<{draft?:string;connectionId?:string}>()
 const connections=useConnections(s=>s.connections),active=useConnections(s=>s.activeConnection)
 const [selected,setSelected]=useState(params.connectionId||active?.id||"")
 const [cwd,setCwd]=useState(connections.find(c=>c.id===(params.connectionId||active?.id))?.directory||"")
 const [hosts,setHosts]=useState<Host[]>([])
 const [inventory,setInventory]=useState<Inventory|null>(null)
 const [files,setFiles]=useState<string[]>([]),[fileSearch,setFileSearch]=useState(""),[filesTruncated,setFilesTruncated]=useState(false)
 const [file,setFile]=useState(""),[branch,setBranch]=useState(""),[message,setMessage]=useState("")
 const [output,setOutput]=useState(""),[edit,setEdit]=useState<Edit|null>(null),[highlight,setHighlight]=useState(true)
 const [port,setPort]=useState("3000"),[resume,setResume]=useState(""),[handoff,setHandoff]=useState(typeof params.draft==="string"?params.draft.slice(0,8000):"")
 const [benchModels,setBenchModels]=useState<BenchModel[]>([]),[benchResult,setBenchResult]=useState("")
 const [busy,setBusy]=useState(false),[error,setError]=useState("")
 const generation=useRef(0),polling=useRef(false),operation=useRef(false),selection=useRef(selected)
 selection.current=selected
 const chosen=connections.find(c=>c.id===selected)
 const host=hosts.find(h=>h.id===selected)
 const w=(key:string)=>t("workspace."+key)
 const poll=useCallback(async()=>{
  if(polling.current)return
  polling.current=true
  const seq=generation.current
  try{
   const values:Host[]=[]
   // Bounded sequential polling; no auth from other hosts.
   for(const c of connections.filter(c=>c.launcherPort)){
    try{
     const target=await getConnectionTarget(c.id)
     if(!target)throw Error("Unavailable")
     const [hw,agents,inbox,saved]=await Promise.allSettled([getHostHardware(target),listAgents(target),call<{events:InboxEvent[];pushConfigured:boolean}>(target,"/acp/inbox",{},8000),listSavedSessions(target)])
     values.push({id:c.id,hardware:hw.status==="fulfilled"?hw.value:undefined,running:agents.status==="fulfilled"?agents.value.running:undefined,agents:agents.status==="fulfilled"?agents.value.agents:undefined,saved:saved.status==="fulfilled"?saved.value:undefined,events:inbox.status==="fulfilled"?inbox.value.events:undefined,pushConfigured:inbox.status==="fulfilled"?inbox.value.pushConfigured:undefined,error:agents.status==="rejected"?describe(agents.reason):undefined})
    }catch(e){values.push({id:c.id,error:describe(e)})}
   }
   if(seq===generation.current)setHosts(values)
  }finally{polling.current=false}
 },[connections])
 useFocusEffect(useCallback(()=>{generation.current++;void poll();const timer=setInterval(()=>void poll(),20000);return()=>{clearInterval(timer);generation.current++}},[poll]))
 const reset=(id:string)=>{
  if(operation.current)return
  selection.current=id
  const c=connections.find(c=>c.id===id)
  setSelected(id);setCwd(c?.directory||"");setInventory(null);setFiles([]);setFileSearch("");setFilesTruncated(false);setEdit(null);setOutput("");setError("");setFile("");setBranch("");setMessage("");setResume("");setBenchModels([]);setBenchResult("")
 }
 const select=(id:string)=>{if(edit?.dirty)Alert.alert(w("discard"),w("discardBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("discard"),style:"destructive",onPress:()=>reset(id)}]);else reset(id)}
 const run=async(fn:(target:AcpTarget,query:string)=>Promise<void>)=>{
  if(operation.current)return
  operation.current=true;setBusy(true);setError("")
  try{
   const id=selected
   if(selection.current!==id)throw Error(w("noHost"))
   const target=await getConnectionTarget(id)
   if(!target||selection.current!==id)throw Error(w("noHost"))
   await fn(target,"?cwd="+encodeURIComponent(cwd.trim()))
  }catch(e){setError(describe(e))}finally{operation.current=false;setBusy(false)}
 }
 const refresh=()=>run(async(target,q)=>{setInventory(await call<Inventory>(target,"/git/inventory"+q));setOutput("");setFiles([]);setFilesTruncated(false)})
 const browseFiles=()=>void run(async(target,q)=>{const r=await call<{files:string[];truncated:boolean}>(target,"/git/action"+q,{method:"POST",body:JSON.stringify({action:"files"})});setFiles(r.files);setFilesTruncated(r.truncated)})
 const action=(name:string,extra:Record<string,unknown>={},confirm=false)=>{
  const go=()=>run(async(target,q)=>{
   const result=await call<{text?:string;path?:string}>(target,"/git/action"+q,{method:"POST",body:JSON.stringify({action:name,...extra})})
   setOutput(result.text||result.path||w("done"))
   if(name==="worktree"&&result.path){
    setCwd(result.path);setEdit(null);setFile("");setFiles([]);setFilesTruncated(false);setResume("");
    setInventory(await call<Inventory>(target,"/git/inventory?cwd="+encodeURIComponent(result.path)))
   }else setInventory(await call<Inventory>(target,"/git/inventory"+q))
  })
  if(confirm)Alert.alert(w("confirm"),name+" · "+(chosen?.name||"")+" · "+cwd,[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void go()}])
  else void go()
 }
 const read=()=>run(async(target,q)=>{
  const data=await call<{text:string;revision:string}>(target,"/git/file"+q+"&file="+encodeURIComponent(file.trim()))
  setEdit({file:file.trim(),text:data.text,revision:data.revision,dirty:false})
 })
 const save=()=>{if(!edit)return;void run(async(target,q)=>{
  const result=await call<{revision:string}>(target,"/git/file"+q+"&file="+encodeURIComponent(edit.file),{method:"PUT",body:JSON.stringify({text:edit.text,revision:edit.revision})})
  setEdit({...edit,revision:result.revision,dirty:false})
 })}
 const refreshBench=()=>void run(async(target)=>{const value=await call<{models:BenchModel[]}>(target,"/llm/benchmark");setBenchModels(value.models)})
 const benchmark=(model:BenchModel)=>Alert.alert(w("benchmark"),w("benchmarkBody")+"\n"+model.id,[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async(target)=>{const r=await call<{promptPerSecond:number|null;generationPerSecond:number|null}>(target,"/llm/benchmark",{method:"POST",body:JSON.stringify({engine:model.engine,model:model.id})},140000);setBenchResult(model.id+" · Prompt "+(r.promptPerSecond?.toFixed(1)??"—")+" t/s · Generation "+(r.generationPerSecond?.toFixed(1)??"—")+" t/s")})}])
 const openPreview=()=>void run(async(target)=>{
  const url=previewAddress(target.serverUrl,Number(port))
  if(!url||target.tunnel)throw Error(w("previewPrivate"))
  const routed=await routeUrl(url)
  if(!previewNavigationAllowed(routed,routed))throw Error(w("previewPrivate"))
  setPreviewJs(false);setPreview(routed)
 })
 const start=(agent:AgentInfo,existingId?:string,folder=cwd,savedId?:string)=>{
  if(busy||!selected||selection.current!==selected)return
  router.push({pathname:"/agent-chat",params:{agent:agent.id,name:agent.name,cwd:folder,connectionId:selected,...(existingId?{id:existingId}:(savedId||resume.trim())?{resumeId:savedId||resume.trim()}:{}),...(handoff.trim()?{draft:handoff.trim().slice(0,8000)}:{})}})
 }
 const box={backgroundColor:p.surface,borderRadius:12,borderWidth:1,borderColor:p.border,padding:12,gap:8} as const
 const input={backgroundColor:p.surface2,color:p.text,borderWidth:1,borderColor:p.border,borderRadius:8,padding:10,fontSize:14} as const
 const txt={color:p.text,fontSize:14} as const
 const title={color:p.cyan,fontSize:17,fontWeight:"700"} as const
 const btn=(label:string,onPress:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={disabled||busy} onPress={onPress} accessibilityRole="button" style={{borderWidth:1,borderColor:p.border,borderRadius:8,padding:10,opacity:(disabled||busy)?0.5:1}}><Text style={{color:p.cyan,fontWeight:"600"}}>{label}</Text></TouchableOpacity>
 const field=(value:string,onChangeText:(s:string)=>void,placeholder:string)=><TextInput editable={!busy} autoCapitalize="none" autoCorrect={false} style={input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={p.muted}/>
 const attention=attentionRows(hosts)
 const changes=inventory?parseGitStatus(inventory.statusPorcelain):[]
 return <ScrollView style={{flex:1,backgroundColor:p.bg}} contentContainerStyle={{padding:14,gap:14}} keyboardShouldPersistTaps="handled">
  <View style={box}><Text style={title}>{w("attention")}</Text><Text style={txt}>{w("needsApproval")}: {attention.filter(r=>r.kind==="approval").length} · {w("activeRuns")}: {attention.filter(r=>r.kind==="busy").length}</Text>{!attention.length?<Text style={{color:p.muted}}>{w("noActiveRuns")}</Text>:attention.map(({connectionId,run:r,kind})=><TouchableOpacity key={connectionId+":"+r.id} disabled={busy} onPress={()=>router.push({pathname:"/agent-chat",params:{agent:r.agent,name:r.name,cwd:r.cwd,id:r.id,connectionId}})} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:kind==="approval"?p.amber:p.border}}><Text style={txt}>{r.name} · {connections.find(c=>c.id===connectionId)?.name}</Text><Text style={{color:kind==="approval"?p.amber:p.muted}}>{w("attention_"+kind)}{kind==="approval"?" ("+r.pendingPermissions+")":""} · {r.cwd}</Text></TouchableOpacity>)}</View>
  <Text style={title}>{w("fleet")}</Text>
  {connections.map(c=>{const h=hosts.find(x=>x.id===c.id);return <TouchableOpacity key={c.id} style={[box,{borderColor:selected===c.id?p.cyan:p.border}]} onPress={()=>select(c.id)} disabled={busy}><Text style={txt}>{c.name} · {c.url}</Text><Text style={{color:p.muted}}>{h?.error||(!c.launcherPort?w("noHost"):h?.hardware?"CPU "+(h.hardware.cpu.percent??"—")+"% · RAM "+(h.hardware.memory.availableBytes/1024**3).toFixed(1)+" GiB "+w("free"):"—")}</Text><Text style={txt}>{w("agents")}: {h?.running?.filter(r=>!r.exited).length??"—"}</Text></TouchableOpacity>})}
  {error?<Text selectable style={{color:p.red}}>{error}</Text>:null}
  <View style={box}><Text style={title}>{w("project")}</Text><Text style={{color:p.muted}}>{w("gitHelp")}</Text>{field(cwd,v=>{if(edit?.dirty)return;setCwd(v);setInventory(null);setFiles([]);setFilesTruncated(false);setEdit(null);setOutput("")},w("path"))}{btn(w("refresh"),refresh,!cwd||!chosen?.launcherPort)}
  {inventory&&<><Text selectable style={txt}>{inventory.root}</Text>{changes.map((c,i)=><TouchableOpacity key={i} onPress={()=>setFile(c.path)}><Text style={txt}>{c.status}  {c.path}</Text></TouchableOpacity>)}<Text style={{color:p.muted}}>{w("branches")}: {inventory.branches.join(" · ")}</Text>{field(branch,setBranch,w("branch"))}<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{btn(w("newBranch"),()=>action("branch",{branch},true),!branch)}{btn(w("switchBranch"),()=>action("switch",{branch},true),!branch)}{btn(w("worktree"),()=>action("worktree",{branch},true),!branch||!!edit?.dirty)}{btn(w("history"),()=>action("log"))}{btn(w("diff"),()=>action("diff",{file}))}{btn(w("stagedDiff"),()=>action("diff",{file,staged:true}))}</View>{inventory.worktrees.map(tree=><TouchableOpacity key={tree.path} disabled={!!edit?.dirty||busy} onPress={()=>{setCwd(tree.path);setInventory(null);setEdit(null);setOutput("")}}><Text style={txt}>{tree.branch||"HEAD"} · {tree.path}</Text></TouchableOpacity>)}{btn(w("browseFiles"),browseFiles)}{files.length>0&&<>{field(fileSearch,setFileSearch,w("filterFiles"))}{files.filter(name=>name.toLowerCase().includes(fileSearch.toLowerCase())).slice(0,80).map(name=><TouchableOpacity key={name} disabled={busy} onPress={()=>setFile(name)}><Text style={{color:file===name?p.cyan:p.text,fontFamily:p.mono,fontSize:13}}>{name}</Text></TouchableOpacity>)}<Text style={{color:p.muted}}>{files.length} · {w("fileListLimit")}{filesTruncated?" · "+w("truncated"):""}</Text></>}{field(file,setFile,w("file"))}<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{btn(w("stage"),()=>action("stage",{file},true),!file)}{btn(w("unstage"),()=>action("unstage",{file},true),!file)}{btn(w("edit"),()=>{if(edit?.dirty)Alert.alert(w("discard"),w("discardBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("discard"),onPress:()=>void read()}]);else void read()},!file)}</View>{field(message,setMessage,w("commitMessage"))}{btn(w("commit"),()=>action("commit",{message},true),!message.trim())}</>}
  {output?<Text selectable style={{color:p.text,fontFamily:p.mono,fontSize:12}}>{output}</Text>:null}
  </View>
  {edit&&<View style={box}><Text style={title}>{edit.file}{edit.dirty?" *":""}</Text><TextInput style={[input,{minHeight:180,textAlignVertical:"top",fontFamily:p.mono}]} multiline editable={!busy} value={edit.text} onChangeText={text=>setEdit({...edit,text,dirty:true})} autoCapitalize="none" autoCorrect={false}/>{btn(w("save"),save,!edit.dirty)}{btn(w("highlight"),()=>setHighlight(!highlight))}{highlight&&<View>{edit.text.split("\n").slice(0,250).map((line,i)=><Text key={i} style={{fontFamily:p.mono,fontSize:12,color:p.text}}>{i+1}  {highlightLine(line).map((token,j)=><Text key={j} style={{color:token.kind==="keyword"?p.magenta:token.kind==="string"?p.green:token.kind==="comment"?p.muted:token.kind==="number"?p.cyan:p.text}}>{token.text}</Text>)}</Text>)}</View>}</View>}
  <View style={box}><Text style={title}>{w("preview")}</Text><Text style={{color:p.muted}}>{w("previewHelp")}</Text>{field(port,setPort,"3000")}{btn(w("openPreview"),openPreview,!chosen?.launcherPort)}</View>
  <View style={box}><Text style={title}>{w("agents")}</Text>{field(resume,setResume,w("resumeId"))}{host?.saved?.filter(r=>r.loadSession).map(r=>btn(r.agent+" · "+r.cwd+" · "+new Date(r.at).toLocaleString(),()=>start({id:r.agent,name:r.agent,installed:true},undefined,r.cwd,r.sessionId)))}<TextInput style={[input,{minHeight:100}]} multiline value={handoff} onChangeText={setHandoff} placeholder={w("handoff")} placeholderTextColor={p.muted} maxLength={8000}/><Text style={{color:p.muted}}>{w("handoffHelp")}</Text>{host?.running?.filter(r=>!r.exited).map(r=>btn(r.name+" · "+r.cwd,()=>start({id:r.agent,name:r.name,installed:true},r.id,r.cwd)))}{host?.agents?.filter(a=>a.installed).map(a=>btn(a.name,()=>start(a)))}</View>
  <View style={box}><Text style={title}>{w("benchmark")}</Text>{btn(w("refresh"),refreshBench,!chosen?.launcherPort)}{benchModels.map(m=>btn(m.engine+" · "+m.id,()=>benchmark(m)))}{benchResult?<Text selectable style={txt}>{benchResult}</Text>:null}<Text style={txt}>{w("quota")}: {w("quotaUnknown")}</Text></View>
  <View style={box}><Text style={title}>{w("inbox")}</Text><Text style={{color:p.muted}}>{host?.pushConfigured?w("pushOn"):w("pushOff")}</Text>{!host?.events?.length?<Text style={txt}>{w("inboxEmpty")}</Text>:host.events.slice(-30).reverse().map(e=><Text key={e.id} style={txt}>{new Date(e.at).toLocaleString()} · {e.agent} · {w(e.category)}</Text>)}</View>
  {btn(w("phoneModels"),()=>router.push("/phone-models"))}
  <Modal visible={!!preview} onRequestClose={()=>setPreview(null)} animationType="slide"><View style={{flex:1,backgroundColor:p.bg,paddingTop:insets.top,paddingBottom:insets.bottom}}><View style={{padding:10,gap:8}}><Text style={title}>{w("preview")}</Text><Text selectable numberOfLines={2} style={{color:p.muted}}>{preview}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{btn(t("common.close"),()=>setPreview(null))}{btn(w("refresh"),()=>setPreviewEpoch(v=>v+1))}{btn(w("browser"),()=>{if(preview)void Linking.openURL(preview).catch(e=>setError(describe(e)))})}{btn(w("previewScripts")+(previewJs?" ✓":""),()=>{if(previewJs)setPreviewJs(false);else Alert.alert(w("previewScripts"),w("previewScriptHelp"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>setPreviewJs(true)}])})}</View></View>{preview&&<WebView key={preview+":"+previewEpoch+":"+previewJs} source={{uri:preview}} style={{flex:1,backgroundColor:p.bg}} originWhitelist={["*"]} onShouldStartLoadWithRequest={r=>previewNavigationAllowed(preview,r.url)} javaScriptEnabled={previewJs} domStorageEnabled={previewJs} incognito sharedCookiesEnabled={false} thirdPartyCookiesEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" setSupportMultipleWindows={false} geolocationEnabled={false} mediaPlaybackRequiresUserAction onOpenWindow={()=>{}}/>}</View></Modal>
 </ScrollView>
}
