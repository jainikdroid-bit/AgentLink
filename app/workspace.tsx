import {useCallback,useRef,useState} from "react"
import {Alert,Linking,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import {router,useFocusEffect,useLocalSearchParams} from "expo-router"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {getConnectionTarget,useConnections} from "../src/stores/connections"
import {call,getHostHardware,listAgents,type HostHardware,type RunningAgent,type AgentInfo,type AcpTarget} from "../src/lib/acp/api"
import {routeUrl} from "../src/lib/tailnet"
import {highlightLine,parseGitStatus,previewAddress} from "../src/lib/workspace-pure"

type Inventory={root:string;statusPorcelain:string;branches:string[];worktrees:{path:string;branch:string|null;head:string|null;locked:boolean}[]}
type InboxEvent={id:string;at:number;category:string;agent:string;bridgeId:string}
type BenchModel={engine:string;id:string;state:string}
type Host={id:string;hardware?:HostHardware;running?:RunningAgent[];agents?:AgentInfo[];events?:InboxEvent[];pushConfigured?:boolean;error?:string}
type Edit={file:string;text:string;revision:string;dirty:boolean}
const describe=(e:unknown)=>e instanceof Error?e.message:String(e)

export default function Workspace(){
 const p=useTheme(),{t}=useTranslation()
 const params=useLocalSearchParams<{draft?:string;connectionId?:string}>()
 const connections=useConnections(s=>s.connections),active=useConnections(s=>s.activeConnection)
 const [selected,setSelected]=useState(params.connectionId||active?.id||"")
 const [cwd,setCwd]=useState(active?.directory||"")
 const [hosts,setHosts]=useState<Host[]>([])
 const [inventory,setInventory]=useState<Inventory|null>(null)
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
     const [hw,agents,inbox]=await Promise.allSettled([getHostHardware(target),listAgents(target),call<{events:InboxEvent[];pushConfigured:boolean}>(target,"/acp/inbox",{},8000)])
     values.push({id:c.id,hardware:hw.status==="fulfilled"?hw.value:undefined,running:agents.status==="fulfilled"?agents.value.running:undefined,agents:agents.status==="fulfilled"?agents.value.agents:undefined,events:inbox.status==="fulfilled"?inbox.value.events:undefined,pushConfigured:inbox.status==="fulfilled"?inbox.value.pushConfigured:undefined,error:agents.status==="rejected"?describe(agents.reason):undefined})
    }catch(e){values.push({id:c.id,error:describe(e)})}
   }
   if(seq===generation.current)setHosts(values)
  }finally{polling.current=false}
 },[connections])
 useFocusEffect(useCallback(()=>{generation.current++;void poll();const timer=setInterval(()=>void poll(),20000);return()=>{clearInterval(timer);generation.current++}},[poll]))
 const reset=(id:string)=>{
  if(operation.current)return
  const c=connections.find(c=>c.id===id)
  setSelected(id);setCwd(c?.directory||"");setInventory(null);setEdit(null);setOutput("");setError("");setFile("");setBranch("");setMessage("");setResume("");setBenchModels([]);setBenchResult("")
 }
 const select=(id:string)=>{if(edit?.dirty)Alert.alert(w("discard"),w("discardBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("discard"),style:"destructive",onPress:()=>reset(id)}]);else reset(id)}
 const run=async(fn:(target:AcpTarget,query:string)=>Promise<void>)=>{
  if(operation.current)return
  operation.current=true;setBusy(true);setError("")
  try{
   const id=selected,target=await getConnectionTarget(id)
   if(!target||selection.current!==id)throw Error(w("noHost"))
   await fn(target,"?cwd="+encodeURIComponent(cwd.trim()))
  }catch(e){setError(describe(e))}finally{operation.current=false;setBusy(false)}
 }
 const refresh=()=>run(async(target,q)=>{setInventory(await call<Inventory>(target,"/git/inventory"+q));setOutput("")})
 const action=(name:string,extra:Record<string,unknown>={},confirm=false)=>{
  const go=()=>run(async(target,q)=>{
   const result=await call<{text?:string;path?:string}>(target,"/git/action"+q,{method:"POST",body:JSON.stringify({action:name,...extra})})
   setOutput(result.text||result.path||w("done"))
   setInventory(await call<Inventory>(target,"/git/inventory"+q))
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
  await Linking.openURL(routed)
 })
 const start=(agent:AgentInfo,existingId?:string,folder=cwd)=>{
  if(busy||!selected)return
  router.push({pathname:"/agent-chat",params:{agent:agent.id,name:agent.name,cwd:folder,connectionId:selected,...(existingId?{id:existingId}:resume.trim()?{resumeId:resume.trim()}:{}),...(handoff.trim()?{draft:handoff.trim().slice(0,8000)}:{})}})
 }
 const box={backgroundColor:p.surface,borderRadius:12,borderWidth:1,borderColor:p.border,padding:12,gap:8} as const
 const input={backgroundColor:p.surface2,color:p.text,borderWidth:1,borderColor:p.border,borderRadius:8,padding:10,fontSize:14} as const
 const txt={color:p.text,fontSize:14} as const
 const title={color:p.cyan,fontSize:17,fontWeight:"700"} as const
 const btn=(label:string,onPress:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={disabled||busy} onPress={onPress} accessibilityRole="button" style={{borderWidth:1,borderColor:p.border,borderRadius:8,padding:10,opacity:(disabled||busy)?0.5:1}}><Text style={{color:p.cyan,fontWeight:"600"}}>{label}</Text></TouchableOpacity>
 const field=(value:string,onChangeText:(s:string)=>void,placeholder:string)=><TextInput editable={!busy} autoCapitalize="none" autoCorrect={false} style={input} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={p.muted}/>
 const changes=inventory?parseGitStatus(inventory.statusPorcelain):[]
 return <ScrollView style={{flex:1,backgroundColor:p.bg}} contentContainerStyle={{padding:14,gap:14}} keyboardShouldPersistTaps="handled">
  <Text style={title}>{w("fleet")}</Text>
  {connections.map(c=>{const h=hosts.find(x=>x.id===c.id);return <TouchableOpacity key={c.id} style={[box,{borderColor:selected===c.id?p.cyan:p.border}]} onPress={()=>select(c.id)} disabled={busy}><Text style={txt}>{c.name} · {c.url}</Text><Text style={{color:p.muted}}>{h?.error||(!c.launcherPort?w("noHost"):h?.hardware?"CPU "+(h.hardware.cpu.percent??"—")+"% · RAM "+(h.hardware.memory.availableBytes/1024**3).toFixed(1)+" GiB "+w("free"):"—")}</Text><Text style={txt}>{w("agents")}: {h?.running?.filter(r=>!r.exited).length??"—"}</Text></TouchableOpacity>})}
  {error?<Text selectable style={{color:p.red}}>{error}</Text>:null}
  <View style={box}><Text style={title}>{w("project")}</Text><Text style={{color:p.muted}}>{w("gitHelp")}</Text>{field(cwd,v=>{if(edit?.dirty)return;setCwd(v);setInventory(null);setEdit(null);setOutput("")},w("path"))}{btn(w("refresh"),refresh,!cwd||!chosen?.launcherPort)}
  {inventory&&<><Text selectable style={txt}>{inventory.root}</Text>{changes.map((c,i)=><TouchableOpacity key={i} onPress={()=>setFile(c.path)}><Text style={txt}>{c.status}  {c.path}</Text></TouchableOpacity>)}<Text style={{color:p.muted}}>{w("branches")}: {inventory.branches.join(" · ")}</Text>{field(branch,setBranch,w("branch"))}<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{btn(w("newBranch"),()=>action("branch",{branch},true),!branch)}{btn(w("switchBranch"),()=>action("switch",{branch},true),!branch)}{btn(w("worktree"),()=>action("worktree",{branch},true),!branch)}{btn(w("history"),()=>action("log"))}{btn(w("diff"),()=>action("diff",{file}))}{btn(w("stagedDiff"),()=>action("diff",{file,staged:true}))}</View>{inventory.worktrees.map(tree=><TouchableOpacity key={tree.path} disabled={!!edit?.dirty||busy} onPress={()=>{setCwd(tree.path);setInventory(null);setEdit(null);setOutput("")}}><Text style={txt}>{tree.branch||"HEAD"} · {tree.path}</Text></TouchableOpacity>)}{field(file,setFile,w("file"))}<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{btn(w("stage"),()=>action("stage",{file},true),!file)}{btn(w("unstage"),()=>action("unstage",{file},true),!file)}{btn(w("edit"),()=>{if(edit?.dirty)Alert.alert(w("discard"),w("discardBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("discard"),onPress:()=>void read()}]);else void read()},!file)}</View>{field(message,setMessage,w("commitMessage"))}{btn(w("commit"),()=>action("commit",{message},true),!message.trim())}</>}
  {output?<Text selectable style={{color:p.text,fontFamily:p.mono,fontSize:12}}>{output}</Text>:null}
  </View>
  {edit&&<View style={box}><Text style={title}>{edit.file}{edit.dirty?" *":""}</Text><TextInput style={[input,{minHeight:180,textAlignVertical:"top",fontFamily:p.mono}]} multiline editable={!busy} value={edit.text} onChangeText={text=>setEdit({...edit,text,dirty:true})} autoCapitalize="none" autoCorrect={false}/>{btn(w("save"),save,!edit.dirty)}{btn(w("highlight"),()=>setHighlight(!highlight))}{highlight&&<View>{edit.text.split("\n").slice(0,250).map((line,i)=><Text key={i} style={{fontFamily:p.mono,fontSize:12,color:p.text}}>{i+1}  {highlightLine(line).map((token,j)=><Text key={j} style={{color:token.kind==="keyword"?p.magenta:token.kind==="string"?p.green:token.kind==="comment"?p.muted:token.kind==="number"?p.cyan:p.text}}>{token.text}</Text>)}</Text>)}</View>}</View>}
  <View style={box}><Text style={title}>{w("preview")}</Text><Text style={{color:p.muted}}>{w("previewHelp")}</Text>{field(port,setPort,"3000")}{btn(w("openPreview"),openPreview,!chosen?.launcherPort)}</View>
  <View style={box}><Text style={title}>{w("agents")}</Text>{field(resume,setResume,w("resumeId"))}<TextInput style={[input,{minHeight:100}]} multiline value={handoff} onChangeText={setHandoff} placeholder={w("handoff")} placeholderTextColor={p.muted} maxLength={8000}/><Text style={{color:p.muted}}>{w("handoffHelp")}</Text>{host?.running?.filter(r=>!r.exited).map(r=>btn(r.name+" · "+r.cwd,()=>start({id:r.agent,name:r.name,installed:true},r.id,r.cwd)))}{host?.agents?.filter(a=>a.installed).map(a=>btn(a.name,()=>start(a)))}</View>
  <View style={box}><Text style={title}>{w("benchmark")}</Text>{btn(w("refresh"),refreshBench,!chosen?.launcherPort)}{benchModels.map(m=>btn(m.engine+" · "+m.id,()=>benchmark(m)))}{benchResult?<Text selectable style={txt}>{benchResult}</Text>:null}<Text style={txt}>{w("quota")}: {w("quotaUnknown")}</Text></View>
  <View style={box}><Text style={title}>{w("inbox")}</Text><Text style={{color:p.muted}}>{host?.pushConfigured?w("pushOn"):w("pushOff")}</Text>{!host?.events?.length?<Text style={txt}>{w("inboxEmpty")}</Text>:host.events.slice(-30).reverse().map(e=><Text key={e.id} style={txt}>{new Date(e.at).toLocaleString()} · {e.agent} · {w(e.category)}</Text>)}</View>
  {btn(w("phoneModels"),()=>router.push("/phone-models"))}
 </ScrollView>
}
