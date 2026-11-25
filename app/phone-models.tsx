import {useRef,useState} from "react"
import {Alert,ScrollView,Text,TextInput,TouchableOpacity,View} from "react-native"
import {router} from "expo-router"
import {useTranslation} from "react-i18next"
import {useTheme} from "../src/theme/useTheme"
import {runInTermux,termuxState} from "../src/lib/termux"
import {screenModelFit} from "../src/lib/local-model-fit"
import {modelFiles,downloadCommand,generationCommand,parsePhoneStats,cliRates,modelKey,type HfFile} from "../src/lib/phone-models"

export default function PhoneModels(){
 const p=useTheme(),{t}=useTranslation(),w=(key:string)=>t("workspace."+key)
 const [query,setQuery]=useState("Qwen GGUF"),[repos,setRepos]=useState<string[]>([]),[files,setFiles]=useState<HfFile[]>([])
 const [repo,setRepo]=useState(""),[chosen,setChosen]=useState<HfFile|null>(null),[stats,setStats]=useState<ReturnType<typeof parsePhoneStats>>(null)
 const [prompt,setPrompt]=useState(""),[answer,setAnswer]=useState(""),[status,setStatus]=useState("")
 const [context,setContext]=useState(2048),[threads,setThreads]=useState(4),[rate,setRate]=useState<ReturnType<typeof cliRates>|null>(null)
 const [busy,setBusy]=useState(false),lock=useRef(false)
 const run=async(fn:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setStatus("");try{await fn()}catch(e){setStatus(e instanceof Error?e.message:String(e))}finally{lock.current=false;setBusy(false)}}
 const local=async(cmd:string,timeout="300")=>{if(await termuxState()!=="ready")throw Error(w("termuxNeeded"));const r=await runInTermux(cmd,"",timeout);if(r.exitCode!==0||r.error)throw Error(r.error||r.stderr||r.stdout||w("failed"));return r}
 const fetchJson=async(url:string)=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(timer)}}
 const search=()=>void run(async()=>{const raw=await fetchJson("https://huggingface.co/api/models?filter=gguf&limit=20&sort=downloads&search="+encodeURIComponent(query.trim()));setRepos(Array.isArray(raw)?raw.filter(x=>!x.private&&!x.gated&&typeof x.id==="string").map(x=>x.id):[]);setFiles([]);setChosen(null)})
 const browse=(name:string)=>void run(async()=>{if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))throw Error(w("failed"));const data=await fetchJson("https://huggingface.co/api/models/"+name+"?blobs=true");setRepo(name);setFiles(modelFiles(name,data));setChosen(null)})
 const probe=()=>void run(async()=>{const result=await local("awk '/^MemAvailable:/ {printf \"%s \",$2}' /proc/meminfo; df -Pk \"$HOME\" | awk 'END {printf \"%s \",$4}'; getconf _NPROCESSORS_ONLN","15");const parsed=parsePhoneStats(result.stdout);setStats(parsed);if(!parsed)throw Error(w("failed"));setThreads(Math.max(1,Math.min(4,parsed.cores)))})
 const install=()=>Alert.alert(w("installEngine"),w("installEngineBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{await local("pkg install -y llama-cpp curl coreutils");setStatus(w("done"))})}])
 const fit=(m:HfFile)=>stats?screenModelFit({...stats,fileBytes:m.bytes,estimatedRuntimeExtraBytes:undefined}):null
 const download=()=>{if(!chosen)return;const model=chosen;Alert.alert(w("download"),model.repo+" / "+model.file+" · "+(model.bytes/1024**3).toFixed(2)+" GiB\n"+w("downloadBody"),[{text:t("common.cancel"),style:"cancel"},{text:w("confirm"),onPress:()=>void run(async()=>{if(fit(model)?.reason==="storage"&&fit(model)?.status==="too-large")throw Error(w("tooLarge"));await local(downloadCommand(model));setStatus(w("done"))})}])}
 const generate=()=>{if(!chosen)return;const model=chosen;void run(async()=>{setAnswer("");setRate(null);if(fit(model)?.status==="too-large")throw Error(w("tooLarge"));const r=await local(generationCommand(model,prompt,context,threads));setAnswer(r.stdout);setRate(cliRates(r.stderr+"\n"+r.stdout))})}
 const remove=()=>{if(!chosen)return;const key=modelKey(chosen);Alert.alert(w("remove"),chosen.file,[{text:t("common.cancel"),style:"cancel"},{text:w("remove"),style:"destructive",onPress:()=>void run(async()=>{await local('cd "$HOME/.agentlink-models" && rm -f -- '+key+' '+key+'.part',"15");setStatus(w("done"))})}])}
 const text={color:p.text,fontSize:14} as const,title={color:p.cyan,fontSize:17,fontWeight:"700"} as const,box={backgroundColor:p.surface,borderColor:p.border,borderWidth:1,padding:12,borderRadius:12,gap:8} as const,input={color:p.text,backgroundColor:p.surface2,borderColor:p.border,borderWidth:1,padding:10,borderRadius:8} as const
 const btn=(label:string,fn:()=>void,disabled=false)=><TouchableOpacity key={label} disabled={busy||disabled} onPress={fn} style={{borderColor:p.border,borderWidth:1,padding:10,borderRadius:8,opacity:busy||disabled?0.5:1}}><Text style={{color:p.cyan,fontWeight:"600"}}>{label}</Text></TouchableOpacity>
 return <ScrollView style={{backgroundColor:p.bg,flex:1}} contentContainerStyle={{padding:14,gap:12}} keyboardShouldPersistTaps="handled">
  <View style={box}><Text style={title}>{w("phoneModels")}</Text><Text style={text}>{w("phoneHelp")}</Text>{btn(w("termuxSetup"),()=>router.push("/termux-setup"))}{btn(w("installEngine"),install)}{btn(w("probePhone"),probe)}{stats&&<Text style={text}>RAM {(stats.availableRamBytes/1024**3).toFixed(1)} GiB · SSD {(stats.freeStorageBytes/1024**3).toFixed(1)} GiB · CPU {stats.cores}×</Text>}</View>
  <View style={box}><Text style={title}>Hugging Face · GGUF</Text><TextInput value={query} onChangeText={setQuery} editable={!busy} style={input} autoCapitalize="none"/>{btn(w("search"),search)}{repos.map(name=>btn(name,()=>browse(name)))}{repo?<Text style={text}>{repo}</Text>:null}{files.map(m=><TouchableOpacity key={m.sha256} disabled={busy} onPress={()=>setChosen(m)} style={{padding:10,borderWidth:1,borderRadius:8,borderColor:chosen?.sha256===m.sha256?p.cyan:p.border}}><Text style={text}>{m.file} · {(m.bytes/1024**3).toFixed(2)} GiB</Text><Text style={{color:p.muted}}>{fit(m)?.status==="too-large"?w("tooLarge"):w("fitUnknown")}</Text></TouchableOpacity>)}</View>
  {chosen&&<View style={box}><Text style={title}>{chosen.file}</Text><Text style={{color:p.muted}}>{w("downloadBody")}</Text>{btn(w("download"),download)}{btn(w("remove"),remove)}<Text style={text}>{w("context")}: {context}</Text><View style={{flexDirection:"row",gap:8}}>{[1024,2048,4096].map(n=>btn(String(n),()=>setContext(n)))}</View><Text style={text}>{w("threads")}: {threads}</Text><View style={{flexDirection:"row",gap:8}}>{[1,2,4,8].map(n=>btn(String(n),()=>setThreads(n)))}</View><TextInput editable={!busy} multiline style={[input,{minHeight:100}]} value={prompt} onChangeText={setPrompt} placeholder={w("prompt")} placeholderTextColor={p.muted} maxLength={8000}/>{btn(w("generate"),generate,!prompt.trim())}{answer?<Text selectable style={text}>{answer}</Text>:null}{rate&&<Text style={text}>Prompt {rate.promptPerSecond?.toFixed(1)??"—"} t/s · Generation {rate.generationPerSecond?.toFixed(1)??"—"} t/s</Text>}</View>}
  {busy&&<Text style={text}>{w("working")}</Text>}{status?<Text selectable style={text}>{status}</Text>:null}
 </ScrollView>
}
