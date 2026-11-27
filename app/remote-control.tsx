import {useEffect,useRef,useState} from "react"
import {Alert,Image,Linking,NativeModules,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import {useLocalSearchParams} from "expo-router"
import * as Crypto from "expo-crypto"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {useConnections,getConnectionTarget} from "../src/stores/connections"
import {call} from "../src/lib/acp/api"
import {validModel,type HfFile} from "../src/lib/phone-models"
import {generateLocal,installedModel,cancelLocal} from "../src/lib/native-local-models"
import {parseRemoteProposal,privateRemoteUrl,toolPrompt,type RemoteProposal} from "../src/lib/remote-proposal"

type Status={enabled:boolean;platform:string;until:number;roots:string[];shell:boolean;files:boolean;desktop:boolean;maxFileBytes:number}
type Picked={name:string;base64:string;bytes:number;sha256:string}
type Result={stdout?:string;stderr?:string;exitCode?:number|null;timedOut?:boolean;truncated?:boolean;entries?:{name:string;directory:boolean}[];jpeg?:string;base64?:string;sha256?:string;bytes?:number}
const libraryKey="agentlink-local-model-library-v1"
const nativeFiles=()=>{const n=NativeModules.AgentLinkRemoteFiles;if(!n)throw Error("File picker unavailable");return n as {pick():Promise<Picked|null>;save(name:string,base64:string,sha256:string):Promise<boolean|null>}}
export default function RemoteControl(){
 const p=useTheme(),{t}=useTranslation(),w=(key:string)=>t("workspace."+key)
 const params=useLocalSearchParams<{hash?:string;connectionId?:string}>()
 const connections=useConnections(s=>s.connections),active=useConnections(s=>s.activeConnection)
 const [host,setHost]=useState(params.connectionId||active?.id||"")
 const [status,setStatus]=useState<Status|null>(null),[root,setRoot]=useState(0),[folder,setFolder]=useState(""),[file,setFile]=useState("")
 const [models,setModels]=useState<HfFile[]>([]),[model,setModel]=useState<HfFile|null>(null)
 const [task,setTask]=useState(""),[proposal,setProposal]=useState<RemoteProposal|null>(null),[results,setResults]=useState<string[]>([]),[answer,setAnswer]=useState("")
 const [command,setCommand]=useState(""),[output,setOutput]=useState(""),[jpeg,setJpeg]=useState(""),[entries,setEntries]=useState<{name:string;directory:boolean}[]>([])
 const [x,setX]=useState(""),[y,setY]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("")
 const lock=useRef(false),hostRef=useRef(host);hostRef.current=host
 useEffect(()=>{let alive=true;void AsyncStorage.getItem(libraryKey).then(async raw=>{const list=raw?JSON.parse(raw):[];if(!Array.isArray(list))return;const available:HfFile[]=[];for(const m of list.filter(validModel).slice(0,40))if(await installedModel(m).catch(()=>false))available.push(m);if(alive){setModels(available);setModel(available.find(m=>m.sha256===params.hash)||available[0]||null)}}).catch(e=>{if(alive)setError(String(e))});return()=>{alive=false}},[params.hash])
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError("");try{await fn()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{lock.current=false;setBusy(false)}}
 const target=async(id=host)=>{const a=await getConnectionTarget(id);if(!a||hostRef.current!==id||a.tunnel||!a.auth?.password||!privateRemoteUrl(a.serverUrl))throw Error(w("remotePrivate"));return a}
 const probe=()=>void run(async()=>{const a=await target();const s=await call<Status>(a,"/remote/status",{},8000);setStatus(s);setRoot(0);setFolder("");setEntries([]);setProposal(null);setResults([]);setJpeg("")})
 const choose=(id:string)=>{if(lock.current)return;hostRef.current=id;setHost(id);setStatus(null);setRoot(0);setFolder("");setFile("");setResults([]);setProposal(null);setEntries([]);setOutput("");setAnswer("");setJpeg("")}
 const perform=async(body:Record<string,unknown>)=>{
  const a=await target();const live=await call<Status>(a,"/remote/status",{},8000)
  if(!status||!live.enabled||live.until!==status.until||JSON.stringify(live.roots)!==JSON.stringify(status.roots))throw Error(w("remotePermissionChanged"))
  const result=await call<Result>(a,"/remote/action",{method:"POST",body:JSON.stringify({...body,root,id:Crypto.randomUUID()})},45000)
  return result
 }
 const summarize=(r:Result)=>JSON.stringify({stdout:r.stdout,stderr:r.stderr,exitCode:r.exitCode,timedOut:r.timedOut,truncated:r.truncated,entries:r.entries,bytes:r.bytes}).slice(0,5000)
 const propose=()=>void run(async()=>{
  if(!model||!status?.enabled||!task.trim()||results.length>=6)throw Error(w("remotePlanLimit"))
  await target()
  const prompt=toolPrompt(task,status.platform,status,results)
  const r=await generateLocal(model,prompt,4096,4,512,"auto")
  if(r.cancelled)return
  const parsed=parseRemoteProposal(r.text)
  if(!parsed){setAnswer(r.text);setProposal(null);throw Error(w("remoteInvalidProposal"))}
  if(parsed.action==="final"){setAnswer(parsed.text);setProposal(null);return}
  if(parsed.action==="shell"&&!status.shell||parsed.action==="list"&&!status.files||["windows","activate","click","key"].includes(parsed.action)&&!status.desktop)throw Error(w("remotePermissionChanged"))
  setProposal(parsed);setAnswer("")
 })
 const executeProposal=()=>{if(!proposal||proposal.action==="final")return;const proposed=proposal,id=host,selectedRoot=root,selectedFolder=folder
  Alert.alert(w("remoteApprove"),(connections.find(c=>c.id===id)?.name||id)+"\n"+(status?.roots[selectedRoot]||"")+" / "+selectedFolder+"\n\n"+JSON.stringify(proposed,null,2),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{
   if(hostRef.current!==id||proposal!==proposed)throw Error(w("remotePermissionChanged"))
   setProposal(null)
   const r=await perform({...proposed,path:proposed.action==="list"?proposed.path:selectedFolder})
   const summary=summarize(r);setOutput(summary);setResults(old=>[...old,JSON.stringify(proposed)+"\n"+summary]);if(r.entries)setEntries(r.entries)
  })}])
 }
 const approve=(body:Record<string,unknown>)=>Alert.alert(w("remoteApprove"),(connections.find(c=>c.id===host)?.name||host)+"\n"+JSON.stringify(body,null,2),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{const r=await perform(body);if(r.jpeg)setJpeg(r.jpeg);else setOutput(summarize(r))})}])
 const browse=()=>void run(async()=>{const r=await perform({action:"list",path:folder});setEntries(r.entries||[])})
 const upload=()=>void run(async()=>{const picked=await nativeFiles().pick();if(!picked)return
  const dest=[folder,picked.name].filter(Boolean).join("/")
  const yes=await new Promise<boolean>(resolve=>Alert.alert(w("remoteUpload"),dest+" · "+picked.bytes+" bytes",[{text:t("common.cancel"),style:"cancel",onPress:()=>resolve(false)},{text:w("confirm"),onPress:()=>resolve(true)}],{cancelable:false}))
  if(!yes)return;const r=await perform({action:"upload",path:dest,base64:picked.base64,sha256:picked.sha256});setOutput(summarize(r))
 })
 const download=()=>void run(async()=>{const r=await perform({action:"download",path:[folder,file].filter(Boolean).join("/")});if(typeof r.base64!=="string"||!r.sha256)throw Error(w("failed"));const saved=await nativeFiles().save(file.split("/").pop()||"file",r.base64,r.sha256);if(saved)setOutput(w("done"))})
 const box={backgroundColor:p.surface,borderRadius:12,borderWidth:1,borderColor:p.border,padding:12,gap:8} as const
 const txt={color:p.text,fontSize:14} as const,title={color:p.cyan,fontSize:17,fontWeight:"700"} as const
 const btn=(label:string,fn:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={busy||disabled} onPress={fn} style={{borderWidth:1,borderColor:p.border,padding:10,borderRadius:8,opacity:busy||disabled?0.5:1}}><Text style={{color:p.cyan}}>{label}</Text></TouchableOpacity>
 const field=(value:string,onChangeText:(v:string)=>void,placeholder:string,multiline=false)=><TextInput value={value} onChangeText={onChangeText} editable={!busy} multiline={multiline} maxLength={multiline?4000:1024} autoCorrect={false} autoCapitalize="none" placeholder={placeholder} placeholderTextColor={p.muted} style={{color:p.text,backgroundColor:p.surface2,borderWidth:1,borderColor:p.border,padding:10,borderRadius:8,minHeight:multiline?90:40}}/>
 const enabled=!!status?.enabled
 return <ScrollView style={{flex:1,backgroundColor:p.bg}} contentContainerStyle={{padding:14,gap:12}} keyboardShouldPersistTaps="handled">
 <View style={box}><Text style={title}>{w("remoteControl")}</Text><Text style={txt}>{w("remoteHelp")}</Text>{connections.map(c=>btn((host===c.id?"✓ ":"")+c.name,()=>choose(c.id),!c.launcherPort))}{btn(w("refresh"),probe,!host)}{status&&<><Text style={txt}>{status.enabled?w("remoteEnabled")+" · "+new Date(status.until).toLocaleTimeString():w("remoteDisabled")}</Text>{status.roots.map((r,i)=>btn((root===i?"✓ ":"")+r,()=>{setRoot(i);setFolder("");setEntries([]);setProposal(null);setResults([])}))}</>}</View>
 {error?<Text selectable style={{color:p.red}}>{error}</Text>:null}
 <View style={box}><Text style={title}>{w("remoteLocalAgent")}</Text>{models.map(m=>btn((model?.sha256===m.sha256?"✓ ":"")+m.file,()=>{setModel(m);setProposal(null);setResults([])}))}{field(task,v=>{setTask(v);setProposal(null);setResults([]);setAnswer("")},w("taskDescription"),true)}{btn(w("remotePropose"),propose,!enabled||!model||!task.trim()||!!proposal||results.length>=6)}{proposal&&<><Text selectable style={txt}>{JSON.stringify(proposal,null,2)}</Text>{btn(w("remoteApprove"),executeProposal)}{btn(t("common.cancel"),()=>setProposal(null))}</>}{answer?<Text selectable style={txt}>{answer}</Text>:null}<Text style={{color:p.muted}}>{results.length}/6</Text>{results.map((r,i)=><Text key={i} selectable style={{color:p.muted,fontSize:12}}>{r}</Text>)}</View>
 <View style={box}><Text style={title}>{w("remoteShell")}</Text>{field(folder,v=>{setFolder(v);setEntries([]);setProposal(null)},w("remoteFolder"))}{field(command,setCommand,status?.platform==="win32"?"Get-Location":"pwd",true)}{btn(w("remoteApprove"),()=>approve({action:"shell",command,path:folder}),!enabled||!status?.shell||!command.trim())}</View>
 <View style={box}><Text style={title}>{w("remoteFiles")}</Text><Text style={{color:p.muted}}>{w("remoteFileLimit")}</Text>{btn(w("browseFiles"),browse,!enabled||!status?.files)}{entries.map(e=>btn((e.directory?"📁 ":"")+e.name,()=>{if(e.directory){setFolder([folder,e.name].filter(Boolean).join("/"));setEntries([]);setFile("")}else setFile(e.name)}))}{field(file,setFile,w("file"))}{btn(w("remoteDownload"),download,!enabled||!status?.files||!file.trim())}{btn(w("remoteUpload"),upload,!enabled||!status?.files)}</View>
 <View style={box}><Text style={title}>{w("remoteDesktop")}</Text>{btn(w("remoteWindows"),()=>approve({action:"windows"}),!enabled||!status?.desktop)}{btn(w("remoteScreenshot"),()=>approve({action:"screenshot"}),!enabled||!status?.desktop)}{jpeg?<Image resizeMode="contain" source={{uri:"data:image/jpeg;base64,"+jpeg}} style={{width:"100%",height:220}}/>:null}{field(x,setX,"X 0–1000")}{field(y,setY,"Y 0–1000")}{btn(w("remoteClick"),()=>approve({action:"click",x:Number(x),y:Number(y)}),!enabled||!status?.desktop||!x.trim()||!y.trim())}<View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{["enter","escape","tab","up","down","left","right","backspace","space"].map(key=>btn(key,()=>approve({action:"key",key}),!enabled||!status?.desktop))}</View></View>
 {output?<Text selectable style={{color:p.text,fontFamily:p.mono,fontSize:12}}>{output}</Text>:null}
 {busy&&<TouchableOpacity onPress={()=>void cancelLocal().catch(()=>{})}><Text style={{color:p.amber,padding:10}}>{t("common.cancel")} · {w("remoteLocalAgent")}</Text></TouchableOpacity>}
 <View style={box}><Text style={title}>{w("remoteInternet")}</Text><Text style={txt}>{w("remoteInternetHelp")}</Text>{btn(w("remoteHotspot"),()=>void Linking.sendIntent("android.settings.TETHER_SETTINGS").catch(()=>Linking.sendIntent("android.settings.WIRELESS_SETTINGS")).catch(()=>setError(w("failed"))))}{btn(w("remoteExitDocs"),()=>void Linking.openURL("https://tailscale.com/docs/features/exit-nodes").catch(()=>setError(w("failed"))))}</View>
 </ScrollView>
}
