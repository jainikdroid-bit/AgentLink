import {useCallback,useEffect,useRef,useState} from "react"
import {Alert,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import {router,useFocusEffect,useLocalSearchParams} from "expo-router"
import * as Crypto from "expo-crypto"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {useConnections,getConnectionTarget} from "../src/stores/connections"
import {call,listAgents,getHostHardware,type AcpTarget,type AgentInfo} from "../src/lib/acp/api"
import {phoneStats,vaultRead,vaultWrite,vaultRemove} from "../src/lib/native-local-models"

type Task={id:string;agent:string;text:string;after:string[]}
type TeamTask=Task&{status:string;bridgeId?:string;worktree?:string;branch?:string;error?:string}
type Team={id:string;cwd:string;created:number;cancelled:boolean;tasks:TeamTask[]}
type Archived={agent:string;cwd:string;sessionId:string;pending:number;uncertain:boolean;at:number}
type Profile={id:string;name:string;connectionId:string;cwd:string;agent:string;draft:string}
type Check={name:string;state:"ok"|"error"|"unknown";detail:string}
const PROFILE_KEY="agent_profiles_v1"
function validProfile(p:unknown):p is Profile{
 if(!p||typeof p!=="object")return false
 const v=p as Profile
 return [v.id,v.name,v.connectionId,v.cwd,v.agent,v.draft].every(x=>typeof x==="string")&&v.name.length>0&&v.name.length<=100&&v.draft.length<=8000
}
export default function TeamControl(){
 const p=useTheme(),{t}=useTranslation(),w=(k:string)=>t("workspace."+k)
 const params=useLocalSearchParams<{connectionId?:string;cwd?:string}>()
 const connections=useConnections(s=>s.connections),active=useConnections(s=>s.activeConnection)
 const [host,setHost]=useState(params.connectionId||active?.id||"")
 const [cwd,setCwd]=useState(params.cwd||connections.find(c=>c.id===host)?.directory||"")
 const [agents,setAgents]=useState<AgentInfo[]>([]),[teams,setTeams]=useState<Team[]>([])
 const [tasks,setTasks]=useState<Task[]>([{id:"task1",agent:"",text:"",after:[]}])
 const [profiles,setProfiles]=useState<Profile[]>([]),[profileReady,setProfileReady]=useState(false)
 const [profileName,setProfileName]=useState(""),[profileAgent,setProfileAgent]=useState(""),[profileDraft,setProfileDraft]=useState("")
 const [archives,setArchives]=useState<Archived[]>([]),[journalState,setJournalState]=useState("")
 const [history,setHistory]=useState<{role:string;text:string}[]>([]),[historyLabel,setHistoryLabel]=useState("")
 const [checks,setChecks]=useState<Check[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("")
 const lock=useRef(false),selected=useRef(host);selected.current=host
 const requestId=useRef<string|null>(null)
 const desc=(e:unknown)=>e instanceof Error?e.message:String(e)
 useEffect(()=>{let alive=true;void vaultRead<unknown>(PROFILE_KEY).then(raw=>{if(alive){if(raw!==null&&!Array.isArray(raw))throw Error("Invalid profile store");setProfiles(Array.isArray(raw)?raw.filter(validProfile).slice(0,50):[]);setProfileReady(true)}}).catch(e=>{if(alive)setError(desc(e))});return()=>{alive=false}},[])
 const target=async(id=host)=>{const a=await getConnectionTarget(id);if(!a||selected.current!==id)throw Error(w("noHost"));return a}
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await fn()}catch(e){setError(desc(e))}finally{lock.current=false;setBusy(false)}}
 const refresh=useCallback(async(id:string)=>{
  const a=await getConnectionTarget(id);if(!a||selected.current!==id)return
  const [available,team,journal]=await Promise.allSettled([listAgents(a),call<{teams:Team[]}>(a,"/acp/team",{},8000),call<{durable:boolean;error:string|null;sessions:Archived[]}>(a,"/acp/journal",{},8000)])
  if(selected.current!==id)return
  setAgents(available.status==="fulfilled"?available.value.agents.filter(a=>a.installed):[])
  setTeams(team.status==="fulfilled"?team.value.teams:[])
  setArchives(journal.status==="fulfilled"?journal.value.sessions:[])
  setJournalState(journal.status==="fulfilled"?(journal.value.error|| (journal.value.durable?"AES-256-GCM":"RAM")):desc(journal.reason))
 },[])
 useFocusEffect(useCallback(()=>{let alive=true,polling=false;const poll=async()=>{if(!alive||polling||lock.current||!host)return;polling=true;try{await refresh(host)}catch(e){if(alive)setError(desc(e))}finally{polling=false}};void poll();const timer=setInterval(()=>void poll(),5000);return()=>{alive=false;clearInterval(timer)}},[host,refresh]))
 const choose=(id:string)=>{if(lock.current)return;selected.current=id;setHost(id);setCwd(connections.find(c=>c.id===id)?.directory||"");setAgents([]);setTeams([]);setArchives([]);setHistory([]);setHistoryLabel("");setChecks([]);setJournalState("");setProfileAgent("");setTasks([{id:"task1",agent:"",text:"",after:[]}]);requestId.current=null}
 const updateTask=(id:string,patch:Partial<Task>)=>{requestId.current=null;setTasks(old=>old.map(task=>task.id===id?{...task,...patch}:task))}
 const addTask=()=>{requestId.current=null;setTasks(old=>{if(old.length>=4)return old;const id=["task1","task2","task3","task4"].find(id=>!old.some(t=>t.id===id))!;return [...old,{id,agent:"",text:"",after:[]}]})}
 const removeTask=(id:string)=>{requestId.current=null;setTasks(old=>old.length>1?old.filter(t=>t.id!==id).map(t=>({...t,after:t.after.filter(a=>a!==id)})):old)}
 const startTeam=()=>Alert.alert(w("startTeam"),w("teamConfirm")+"\n"+tasks.map(t=>t.id+": "+t.agent+" · "+t.text.slice(0,100)).join("\n"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{
  const a=await target();const id=requestId.current??Crypto.randomUUID();requestId.current=id
  await call(a,"/acp/team",{method:"POST",body:JSON.stringify({action:"start",id,cwd,tasks})},30000)
  requestId.current=null;await refresh(host)
 })}])
 const cancelTeam=(team:Team)=>Alert.alert(w("stopTeam"),w("teamStopHelp"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),style:"destructive",onPress:()=>void run(async()=>{await call(await target(),"/acp/team",{method:"POST",body:JSON.stringify({action:"cancel",id:team.id})});await refresh(host)})}])
 const open=(task:TeamTask)=>{if(task.bridgeId&&task.worktree)router.push({pathname:"/agent-chat",params:{agent:task.agent,name:task.agent,cwd:task.worktree,id:task.bridgeId,connectionId:host}})}
 const saveProfile=()=>void run(async()=>{if(!profileReady||!profileName.trim()||!profileAgent||!cwd)return;const next=[{id:Crypto.randomUUID(),name:profileName.trim().slice(0,100),connectionId:host,cwd,agent:profileAgent,draft:profileDraft.slice(0,8000)},...profiles].slice(0,50);await vaultWrite(PROFILE_KEY,next);setProfiles(next);setProfileName("")})
 const deleteProfile=(id:string)=>Alert.alert(w("deleteProfile"),"",[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),style:"destructive",onPress:()=>void run(async()=>{const next=profiles.filter(x=>x.id!==id);await vaultWrite(PROFILE_KEY,next);setProfiles(next)})}])
 const openProfile=(v:Profile)=>{if(!connections.some(c=>c.id===v.connectionId)){setError(w("noHost"));return}router.push({pathname:"/agent-chat",params:{agent:v.agent,name:v.name,cwd:v.cwd,connectionId:v.connectionId,draft:v.draft}})}
 const historyQuery=(a:Archived)=>"?agent="+encodeURIComponent(a.agent)+"&cwd="+encodeURIComponent(a.cwd)+"&sessionId="+encodeURIComponent(a.sessionId)
 const readHistory=(a:Archived)=>void run(async()=>{const r=await call<{history:{role:string;text:string}[]}>(await target(),"/acp/history"+historyQuery(a));setHistory(r.history);setHistoryLabel(a.agent+" · "+a.cwd)})
 const deleteHistory=(a:Archived)=>Alert.alert(w("clearHistory"),w("archiveDeleteHelp"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),style:"destructive",onPress:()=>void run(async()=>{await call(await target(),"/acp/history"+historyQuery(a),{method:"DELETE"});setHistory([]);setHistoryLabel("");await refresh(host)})}])
 const diagnose=()=>void run(async()=>{
  setChecks([])
  const rows:Check[]=[]
  const test=async(name:string,fn:()=>Promise<string>)=>{try{rows.push({name,state:"ok",detail:await fn()})}catch(e){rows.push({name,state:"error",detail:desc(e).slice(0,220)})}setChecks([...rows])}
  await test("Android · llama.cpp",async()=>{const s=await phoneStats();if(!s.engine)throw Error(w("engineUnavailable"));return (s.backends||["cpu"]).join(" · ")+" · "+s.abi+" · RAM "+Math.round(s.availableRamBytes/1024**2)+" MiB"})
  await test("Android Keystore",async()=>{const key="diag_"+Crypto.randomUUID().replace(/-/g,"");try{await vaultWrite(key,{probe:true});const v=await vaultRead<{probe:boolean}>(key);if(!v?.probe)throw Error("Encrypted readback failed");return "AES-256-GCM"}finally{await vaultRemove(key)}})
  if(!host){rows.push({name:"Launcher",state:"unknown",detail:w("noHost")});setChecks([...rows]);return}
  let a:AcpTarget
  try{a=await target()}catch(e){rows.push({name:"Launcher",state:"error",detail:desc(e)});setChecks([...rows]);return}
  await test("Launcher / OpenCode",async()=>{const r=await call<{launcher:number;server:unknown}>(a,"/status",{},8000);return "v"+r.launcher+" · "+JSON.stringify(r.server).slice(0,120)})
  await test("ACP",async()=>{const r=await listAgents(a);return String(r.agents.filter(x=>x.installed).length)+" "+w("agents")})
  await test("CPU / RAM / GPU",async()=>{const h=await getHostHardware(a);return h.platform+" · "+h.arch+" · "+(h.gpu?.map(g=>g.name).join(", ")||"GPU —")})
  await test("Encrypted journal",async()=>{const r=await call<{durable:boolean;error:string|null}>(a,"/acp/journal",{},8000);if(!r.durable||r.error)throw Error(r.error||"Durability disabled");return "AES-256-GCM"})
  await test("Subagents",async()=>{const r=await call<{teams:Team[]}>(a,"/acp/team",{},8000);return String(r.teams.length)+" "+w("teams")})
  await test("Git",async()=>{if(!cwd)throw Error(w("path"));const r=await call<{root:string}>(a,"/git/inventory?cwd="+encodeURIComponent(cwd),{},8000);return r.root})
  await test("Ollama / llama.cpp server",async()=>{const r=await call<{models:unknown[]}>(a,"/llm/benchmark",{},12000);if(!r.models?.length)throw Error(w("noModels"));return String(r.models.length)+" "+w("phoneModels")})
  await test("Push",async()=>{const r=await call<{pushConfigured:boolean}>(a,"/acp/inbox",{},8000);if(!r.pushConfigured)throw Error(w("pushOff"));return w("pushOn")})
 })
 const box={backgroundColor:p.surface,borderRadius:12,borderWidth:1,borderColor:p.border,padding:12,gap:8} as const
 const text={color:p.text,fontSize:14} as const
 const title={color:p.cyan,fontSize:17,fontWeight:"700"} as const
 const button=(label:string,fn:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={busy||disabled} onPress={fn} style={{borderWidth:1,borderColor:p.border,padding:10,borderRadius:8,opacity:busy||disabled?0.5:1}}><Text style={{color:p.cyan}}>{label}</Text></TouchableOpacity>
 const field=(value:string,change:(v:string)=>void,placeholder:string,multiline=false)=><TextInput value={value} onChangeText={change} editable={!busy} multiline={multiline} maxLength={multiline?8000:4096} autoCorrect={false} autoCapitalize="none" placeholder={placeholder} placeholderTextColor={p.muted} style={{color:p.text,backgroundColor:p.surface2,borderColor:p.border,borderWidth:1,padding:10,borderRadius:8,minHeight:multiline?80:40}}/>
 return <ScrollView style={{flex:1,backgroundColor:p.bg}} contentContainerStyle={{padding:14,gap:12}} keyboardShouldPersistTaps="handled">
  <View style={box}><Text style={title}>{w("fleet")}</Text>{connections.map(c=>button((host===c.id?"✓ ":"")+c.name,()=>choose(c.id)))}{field(cwd,v=>{setCwd(v);requestId.current=null},w("path"))}</View>
  {error?<Text selectable style={{color:p.red}}>{error}</Text>:null}
  <View style={box}><Text style={title}>{w("teams")}</Text><Text style={text}>{w("teamHelp")}</Text>{tasks.map(task=><View key={task.id} style={{gap:7,borderBottomWidth:1,borderColor:p.border,paddingBottom:9}}><Text style={text}>{task.id}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>{agents.map(a=>button((task.agent===a.id?"✓ ":"")+a.name,()=>updateTask(task.id,{agent:a.id})))}</View>{field(task.text,v=>updateTask(task.id,{text:v}),w("taskDescription"),true)}<Text style={{color:p.muted}}>{w("dependsOn")}</Text><View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>{tasks.filter(x=>x.id!==task.id).map(x=>button((task.after.includes(x.id)?"✓ ":"")+x.id,()=>updateTask(task.id,{after:task.after.includes(x.id)?task.after.filter(id=>id!==x.id):[...task.after,x.id]})))}</View>{button(w("removeTask"),()=>removeTask(task.id),tasks.length===1)}</View>)}{button(w("addTask"),addTask,tasks.length>=4)}{button(w("startTeam"),startTeam,!host||!cwd||tasks.some(x=>!x.agent||!x.text.trim()))}
  {teams.map(team=><View key={team.id} style={{borderWidth:1,borderColor:p.border,borderRadius:8,padding:8,gap:6}}><Text style={text}>{new Date(team.created).toLocaleString()} · {team.cwd}</Text>{team.tasks.map(task=><View key={task.id} style={{gap:5}}><Text style={{color:task.status==="failed"?p.red:p.text}}>{task.id} · {task.agent} · {w("team_"+task.status)}</Text>{task.branch?<Text selectable style={text}>{task.branch}</Text>:null}{task.error?<Text selectable style={{color:p.red}}>{task.error}</Text>:null}{task.bridgeId&&button(w("openTask")+" "+task.id,()=>open(task))}</View>)}{!team.cancelled&&team.tasks.some(t=>["pending","starting","running"].includes(t.status))&&button(w("stopTeam"),()=>cancelTeam(team))}</View>)}</View>
  <View style={box}><Text style={title}>{w("agentProfiles")}</Text>{field(profileName,setProfileName,w("profileName"))}<View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>{agents.map(a=>button((profileAgent===a.id?"✓ ":"")+a.name,()=>setProfileAgent(a.id)))}</View>{field(profileDraft,setProfileDraft,w("handoff"),true)}{button(w("saveProfile"),saveProfile,!profileReady||!profileName.trim()||!profileAgent||!cwd)}{profiles.map(v=><View key={v.id} style={{gap:5}}><Text style={text}>{v.name} · {v.agent} · {connections.find(c=>c.id===v.connectionId)?.name||"—"}</Text>{button(w("openTask")+" "+v.name,()=>openProfile(v))}{button(w("deleteProfile")+" "+v.name,()=>deleteProfile(v.id))}</View>)}</View>
  <View style={box}><Text style={title}>{w("encryptedHistory")}</Text><Text style={text}>{journalState||"—"}</Text><Text style={{color:p.muted}}>{w("archiveHelp")}</Text>{archives.map(a=><View key={a.agent+":"+a.cwd+":"+a.sessionId} style={{gap:5}}><Text style={text}>{a.agent} · {a.cwd} · {w("queue")}: {a.pending}{a.uncertain?" · "+w("uncertainTask"):""}</Text>{button(w("readHistory")+" "+a.sessionId.slice(-8),()=>readHistory(a))}{button(w("resumeId")+" "+a.sessionId.slice(-8),()=>router.push({pathname:"/agent-chat",params:{agent:a.agent,name:a.agent,cwd:a.cwd,resumeId:a.sessionId,connectionId:host}}))}{button(w("clearHistory")+" "+a.sessionId.slice(-8),()=>deleteHistory(a))}</View>)}{historyLabel?<Text style={title}>{historyLabel}</Text>:null}{history.map((m,i)=><View key={i} style={{gap:3}}><Text style={{color:p.muted}}>{m.role}</Text><Text selectable style={text}>{m.text}</Text></View>)}</View>
  <View style={box}><Text style={title}>{w("diagnostics")}</Text>{button(w("runDiagnostics"),diagnose)}{checks.map(c=><View key={c.name} style={{gap:4}}><Text style={{color:c.state==="ok"?p.green:c.state==="error"?p.red:p.muted}}>{c.state==="ok"?"✓":c.state==="error"?"!":"—"} {c.name}</Text><Text selectable style={text}>{c.detail}</Text></View>)}</View>
 </ScrollView>
}
