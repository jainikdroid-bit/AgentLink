import {useEffect,useRef,useState} from "react"
import {Alert,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {phoneStats,localProgress,cancelLocal,installedModel,downloadModel,removeModel,generateLocal,type PhoneStats,type LocalProgress} from "../src/lib/native-local-models"
import {screenModelFit} from "../src/lib/local-model-fit"
import {modelFiles,type HfFile} from "../src/lib/phone-models"

export default function PhoneModels(){
 const p=useTheme(),{t}=useTranslation(),w=(key:string)=>t("workspace."+key)
 const [query,setQuery]=useState("Qwen GGUF"),[repos,setRepos]=useState<string[]>([]),[files,setFiles]=useState<HfFile[]>([])
 const [repo,setRepo]=useState(""),[chosen,setChosen]=useState<HfFile|null>(null),[stats,setStats]=useState<PhoneStats|null>(null)
 const [prompt,setPrompt]=useState(""),[answer,setAnswer]=useState(""),[status,setStatus]=useState("")
 const [context,setContext]=useState(2048),[threads,setThreads]=useState(4),[rate,setRate]=useState<{promptPerSecond:number|null;generationPerSecond:number|null}|null>(null)
 const [busy,setBusy]=useState(false),lock=useRef(false)
 const [progress,setProgress]=useState<LocalProgress|null>(null),[installed,setInstalled]=useState(false)
 useEffect(()=>{let alive=true;void phoneStats().then(s=>{if(alive){setStats(s);setThreads(Math.max(1,Math.min(4,s.cores)))}}).catch(e=>{if(alive)setStatus(String(e))});return()=>{alive=false}},[])
 useEffect(()=>{let alive=true;setInstalled(false);if(chosen)void installedModel(chosen).then(v=>{if(alive)setInstalled(v)}).catch(()=>{});return()=>{alive=false}},[chosen])
 useEffect(()=>{if(!busy)return;const timer=setInterval(()=>void localProgress().then(setProgress).catch(()=>{}),500);return()=>{clearInterval(timer);setProgress(null)}},[busy])
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setStatus("");try{await fn()}catch(e){setStatus(e instanceof Error?e.message:String(e))}finally{lock.current=false;setBusy(false)}}
 const fetchJson=async(url:string)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(timer)}}
 const search=()=>void run(async()=>{const raw=await fetchJson("https://huggingface.co/api/models?filter=gguf&limit=20&sort=downloads&search="+encodeURIComponent(query.trim()));setRepos(Array.isArray(raw)?raw.filter(x=>!x.private&&!x.gated&&typeof x.id==="string").map(x=>x.id):[]);setFiles([]);setChosen(null)})
 const browse=(name:string)=>void run(async()=>{if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))throw Error(w("failed"));const data=await fetchJson("https://huggingface.co/api/models/"+name+"?blobs=true");setRepo(name);setFiles(modelFiles(name,data));setChosen(null)})
 const probe=()=>void run(async()=>{const data=await phoneStats();setStats(data);setThreads(Math.max(1,Math.min(4,data.cores)))})
 const fit=(m:HfFile)=>stats?screenModelFit({...stats,fileBytes:m.bytes,estimatedRuntimeExtraBytes:undefined}):null
 const download=()=>{if(!chosen)return;const model=chosen;Alert.alert(w("download"),model.repo+" / "+model.file+" · "+(model.bytes/1024**3).toFixed(2)+" GiB\n"+w("downloadBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{await downloadModel(model);setInstalled(true);setStatus(w("done"))})}])}
 const generate=()=>{if(!chosen)return;const model=chosen;void run(async()=>{setAnswer("");setRate(null);const result=await generateLocal(model,prompt,context,threads);setAnswer(result.text);setRate(result);if(result.cancelled)setStatus(w("cancelled"))})}
 const remove=()=>{if(!chosen)return;const model=chosen;Alert.alert(w("remove"),model.file,[{text:t("common.cancel"),style:"cancel"},{text:w("remove"),style:"destructive",onPress:()=>void run(async()=>{await removeModel(model);setInstalled(false);setStatus(w("done"))})}])}
 const text={color:p.text,fontSize:14} as const,title={color:p.cyan,fontSize:17,fontWeight:"700"} as const,box={backgroundColor:p.surface,borderColor:p.border,borderWidth:1,padding:12,borderRadius:12,gap:8} as const,input={color:p.text,backgroundColor:p.surface2,borderColor:p.border,borderWidth:1,padding:10,borderRadius:8} as const
 const btn=(label:string,fn:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={busy||disabled} onPress={fn} style={{borderColor:p.border,borderWidth:1,padding:10,borderRadius:8,opacity:busy||disabled?0.5:1}}><Text style={{color:p.cyan,fontWeight:"600"}}>{label}</Text></TouchableOpacity>
 return <ScrollView style={{backgroundColor:p.bg,flex:1}} contentContainerStyle={{padding:14,gap:12}} keyboardShouldPersistTaps="handled">
  <View style={box}><Text style={title}>{w("phoneModels")}</Text><Text style={text}>{w("phoneHelp")}</Text>{stats&&!stats.engine?<Text style={{color:p.red}}>{w("engineUnavailable")}</Text>:null}{btn(w("probePhone"),probe)}{stats&&<Text style={text}>RAM {(stats.availableRamBytes/1024**3).toFixed(1)} GiB · SSD {(stats.freeStorageBytes/1024**3).toFixed(1)} GiB · CPU {stats.cores}× · {stats.soc} · {stats.abi}</Text>}</View>
  <View style={box}><Text style={title}>Hugging Face · GGUF</Text><TextInput value={query} onChangeText={setQuery} editable={!busy} style={input} autoCapitalize="none"/>{btn(w("search"),search)}{repos.map(name=>btn(name,()=>browse(name)))}{repo?<Text style={text}>{repo}</Text>:null}{files.map(m=><TouchableOpacity key={m.sha256} disabled={busy} onPress={()=>setChosen(m)} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:chosen?.sha256===m.sha256?p.cyan:p.border}}><Text style={text}>{m.file} · {(m.bytes/1024**3).toFixed(2)} GiB</Text><Text style={{color:p.muted}}>{fit(m)?.status==="too-large"?w("tooLarge"):w("fitUnknown")}</Text></TouchableOpacity>)}</View>
  {chosen&&<View style={box}><Text style={title}>{chosen.file}</Text><Text style={{color:p.muted}}>{w("downloadBody")}</Text>{btn(installed?w("downloaded"):w("download"),download,installed)}{btn(w("remove"),remove)}<Text style={text}>{w("context")}: {context}</Text><View style={{flexDirection:"row",gap:8}}>{[1024,2048,4096].map(n=>btn(String(n),()=>setContext(n)))}</View><Text style={text}>{w("threads")}: {threads}</Text><View style={{flexDirection:"row",gap:8}}>{[1,2,4,8].map(n=>btn(String(n),()=>setThreads(n)))}</View><TextInput editable={!busy} multiline style={[input,{minHeight:100}]} value={prompt} onChangeText={setPrompt} placeholder={w("prompt")} placeholderTextColor={p.muted} maxLength={8000}/>{btn(w("generate"),generate,!prompt.trim()||!installed||!stats?.engine)}{answer?<Text selectable style={text}>{answer}</Text>:null}{rate&&<Text style={text}>Prompt {rate.promptPerSecond?.toFixed(1)??"—"} t/s · Generation {rate.generationPerSecond?.toFixed(1)??"—"} t/s</Text>}</View>}
  {busy&&<View style={box}><Text style={text}>{w("working")}{progress&&progress.total>0? " · "+Math.floor(progress.bytes/progress.total*100)+"%":""}</Text><TouchableOpacity onPress={()=>void cancelLocal().catch(()=>{})}><Text style={{color:p.amber,padding:10}}>{t("common.cancel")}</Text></TouchableOpacity></View>}{status?<Text selectable style={text}>{status}</Text>:null}
 </ScrollView>
}
