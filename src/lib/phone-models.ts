// Public, single-file GGUFs only. No remote code or arbitrary user-provided URL.
export type HfFile={repo:string;revision:string;file:string;bytes:number;sha256:string}
const repoPattern=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/
export function validModel(m:HfFile):boolean{
 return repoPattern.test(m.repo)&&/^[a-f0-9]{40}$/i.test(m.revision)&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.gguf$/i.test(m.file)&&!/-\d{5}-of-\d{5}\.gguf$/i.test(m.file)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&/^[a-f0-9]{64}$/i.test(m.sha256)
}
export function modelFiles(repo:string,raw:unknown):HfFile[]{
 if(!repoPattern.test(repo)||!raw||typeof raw!=="object")return []
 const r=raw as {sha?:string;private?:boolean;gated?:boolean|string;siblings?:{rfilename?:string;size?:number;lfs?:{sha256?:string;size?:number}}[]}
 if(r.private||r.gated||!Array.isArray(r.siblings))return []
 return r.siblings.map(f=>({repo,revision:r.sha||"",file:f.rfilename||"",bytes:f.lfs?.size??f.size??0,sha256:f.lfs?.sha256||""})).filter(validModel).sort((a,b)=>a.bytes-b.bytes)
}
export function quoteShell(value:string):string{return "'"+value.replace(/'/g,"'\"'\"'")+"'"}
export function modelKey(m:HfFile):string{
 if(!validModel(m))throw Error("invalid model metadata")
 return m.sha256.toLowerCase()+".gguf"
}
export function downloadCommand(m:HfFile):string{
 const key=modelKey(m),url="https://huggingface.co/"+m.repo+"/resolve/"+m.revision+"/"+encodeURIComponent(m.file)
 // Resume only the exact immutable content ID. SHA256 is mandatory before rename.
 return [
  'set -eu','umask 077','mkdir -p "$HOME/.agentlink-models"','cd "$HOME/.agentlink-models"',
  'file='+quoteShell(key),'part="$file.part"',
  'if [ -f "$file" ] && printf "%s  %s\\n" '+quoteShell(m.sha256.toLowerCase())+' "$file" | sha256sum -c - >/dev/null; then exit 0; fi',
  'if [ -f "$part" ] && [ "$(wc -c < "$part")" -gt '+m.bytes+' ]; then rm -- "$part"; fi',
  'if [ ! -f "$part" ] || [ "$(wc -c < "$part")" -ne '+m.bytes+' ]; then curl --fail --silent --show-error --location --proto "=https" --proto-redir "=https" --max-time 240 --continue-at - --output "$part" '+quoteShell(url)+'; fi',
  '[ "$(wc -c < "$part")" -eq '+m.bytes+' ]',
  'if ! printf "%s  %s\\n" '+quoteShell(m.sha256.toLowerCase())+' "$part" | sha256sum -c -; then rm -- "$part"; exit 1; fi',
  '[ "$(head -c 4 "$part")" = GGUF ]','mv -f -- "$part" "$file"'
 ].join("\n")
}
export function generationCommand(m:HfFile,prompt:string,context:number,threads:number):string{
 if(!prompt.trim()||prompt.length>8000||![1024,2048,4096].includes(context)||!Number.isInteger(threads)||threads<1||threads>8)throw Error("invalid generation parameters")
 const key=modelKey(m)
 return 'cd "$HOME/.agentlink-models" && [ -f '+quoteShell(key)+' ] && [ "$(head -c 4 '+quoteShell(key)+')" = GGUF ] && llama-cli -m '+quoteShell(key)+' --single-turn --no-display-prompt --perf -ngl 0 -n 256 -c '+context+' -t '+threads+' -p '+quoteShell(prompt)+' </dev/null'
}
export function parsePhoneStats(text:string):{availableRamBytes:number;freeStorageBytes:number;cores:number}|null{
 const values=text.trim().split(/\s+/).map(Number)
 return values.length===3&&values.every(x=>Number.isFinite(x)&&x>0)?{availableRamBytes:values[0]*1024,freeStorageBytes:values[1]*1024,cores:values[2]}:null
}
export function cliRates(text:string){
 const read=(re:RegExp)=>{const n=Number(re.exec(text)?.[1]);return Number.isFinite(n)&&n>=0?n:null}
 return {promptPerSecond:read(/prompt eval time[^\n]*?([\d.]+)\s+tokens per second/),generationPerSecond:read(/(?:^|\n)[^\n]*?\beval time\s*=[^\n]*?([\d.]+)\s+tokens per second/m)}
}
