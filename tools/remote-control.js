'use strict'
// Locally enabled owner control, not a shell sandbox. No public tunnel.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto')
const {spawn,execFile}=require('node:child_process')
const {promisify}=require('node:util')
const exec=promisify(execFile)
const MAX_FILE=4*1024*1024,MAX_OUTPUT=64*1024
const MAX_DOWNLOAD=256*1024*1024,CHUNK=512*1024
const snapshot=st=>crypto.createHash('sha256').update([st.dev,st.ino,st.size,st.mtimeMs,st.ctimeMs].join(':')).digest('hex')
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex')
const problem=(status,message)=>Object.assign(Error(message),{status})
function inside(root,target){const rel=path.relative(root,target);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))}
function relative(value){
 if(typeof value!=='string'||value.length>1024||value.includes('\\')||/[\x00-\x1f:]/.test(value)||path.isAbsolute(value)||value.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw problem(400,'Invalid relative path')
 return value
}
function privateAddress(address){
 const v=String(address||'').replace(/^::ffff:/,'')
 if(v==='::1')return true
 if(!/^\d{1,3}(\.\d{1,3}){3}$/.test(v))return false
 const a=v.split('.').map(Number)
 return a.every(n=>n>=0&&n<=255)&&(a[0]===127||a[0]===10||a[0]===192&&a[1]===168||a[0]===172&&a[1]>=16&&a[1]<=31||a[0]===100&&a[1]>=64&&a[1]<=127)
}
async function policy(dir,now=Date.now()){
 try{
  const raw=JSON.parse((await fs.readFile(path.join(dir,'remote-control.json'),'utf8')).replace(/^\uFEFF/,''))
  if(!Number.isFinite(raw.until)||raw.until<=now||raw.until>now+24*3600000||!Array.isArray(raw.roots))return null
  const roots=[]
  for(const r of raw.roots.slice(0,8))if(typeof r==='string'&&path.isAbsolute(r)){const p=await fs.realpath(r).catch(()=>null);if(p&&(await fs.stat(p)).isDirectory())roots.push(p)}
  return {until:raw.until,roots:[...new Set(roots)],shell:raw.shell===true,files:raw.files===true,desktop:raw.desktop===true&&process.platform==='win32'}
 }catch{return null}
}
async function locate(roots,index,rel,{directory=false,create=false}={}){
 if(!Number.isInteger(index)||!roots[index])throw problem(400,'Select an allowed folder')
 const root=roots[index]
 if(rel===''&&directory)return root
 const parts=relative(rel).split('/')
 let actual=root
 for(let i=0;i<parts.length;i++){
  actual=path.join(actual,parts[i]);const last=i===parts.length-1
  const st=await fs.lstat(actual).catch(e=>{if(e.code==='ENOENT'&&last&&create)return null;throw problem(404,'File or folder unavailable')})
  if(!st)return actual
  if(st.isSymbolicLink())throw problem(403,'Links are not allowed')
  if(!inside(root,await fs.realpath(actual)))throw problem(403,'Outside allowed folder')
  if(!last&&!st.isDirectory()||last&&directory&&!st.isDirectory())throw problem(400,'Folder required')
  if(last&&!directory&&(!st.isFile()||st.nlink!==1))throw problem(400,'Regular file required')
  if(last&&create)throw problem(409,'File already exists')
 }
 return actual
}
function commandEnv(){
 const allow=['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','COMSPEC','ComSpec','TEMP','TMP','TMPDIR','HOME','USERPROFILE','LOCALAPPDATA','APPDATA','USERNAME','USER','LOGNAME','LANG','LC_ALL','TERM','SHELL']
 return Object.fromEntries(allow.filter(k=>typeof process.env[k]==='string').map(k=>[k,process.env[k]]))
}
const ps=()=>path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe')
const psArgs=command=>['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')]
function shellRun(command,cwd,timeout=30000){
 return new Promise((resolve,reject)=>{
  const win=process.platform==='win32'
  const child=spawn(win?ps():'/bin/sh',win?psArgs('[Console]::OutputEncoding=[Text.UTF8Encoding]::new();'+command):['-c',command],{cwd,env:commandEnv(),windowsHide:true,detached:!win,stdio:['ignore','pipe','pipe']})
  let stdout=[],stderr=[],size=0,truncated=false,timedOut=false,settled=false
  const stop=()=>{try{if(win)execFile('taskkill.exe',['/T','/F','/PID',String(child.pid)],{windowsHide:true},()=>{});else process.kill(-child.pid,'SIGKILL')}catch{try{child.kill('SIGKILL')}catch{}}}
  const timer=setTimeout(()=>{timedOut=true;stop()},timeout)
  const finish=(code,signal)=>{if(settled)return;settled=true;clearTimeout(timer);resolve({exitCode:code,signal,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8'),truncated,timedOut})}
  for(const [stream,chunks] of [[child.stdout,stdout],[child.stderr,stderr]])stream.on('data',chunk=>{const left=Math.max(0,MAX_OUTPUT-size);if(chunk.length>left)truncated=true;if(left){const v=chunk.subarray(0,left);chunks.push(v);size+=v.length}})
  child.on('error',()=>{clearTimeout(timer);reject(problem(500,'Could not start command'))})
  child.on('close',finish)
 })
}
// Fixed desktop operations. Only the logged-in Windows user's interactive session.
async function desktopAction(action,params={}){
 if(process.platform!=='win32')throw problem(501,'Desktop controls require Windows')
 let script=''
 if(action==='windows')script="Get-Process | Where-Object {$_.MainWindowHandle -ne 0 -and $_.MainWindowTitle} | Select-Object -First 80 Id,MainWindowTitle | ConvertTo-Json -Compress"
 else if(action==='activate'){
  if(!Number.isInteger(params.pid)||params.pid<1||params.pid>2147483647)throw problem(400,'Invalid process ID')
  script="$p=Get-Process -Id "+params.pid+" -ErrorAction Stop;if(!$p.MainWindowHandle){throw 'No interactive window'};$w=New-Object -ComObject WScript.Shell;[bool]$w.AppActivate($p.Id)"
 }else if(action==='click'){
  if(!Number.isInteger(params.x)||params.x<0||params.x>1000||!Number.isInteger(params.y)||params.y<0||params.y>1000)throw problem(400,'Use normalized primary-screen coordinates 0–1000')
  script="Add-Type -AssemblyName System.Windows.Forms;Add-Type -TypeDefinition 'using System.Runtime.InteropServices;public static class AgentLinkMouse{[DllImport(\"user32.dll\")]public static extern bool SetCursorPos(int x,int y);[DllImport(\"user32.dll\")]public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr extra);}';$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;$x=$b.Left+[int](($b.Width-1)*"+params.x+"/1000);$y=$b.Top+[int](($b.Height-1)*"+params.y+"/1000);if(![AgentLinkMouse]::SetCursorPos($x,$y)){throw 'Cursor unavailable'};[AgentLinkMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero);[AgentLinkMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);'true'"
 }else if(action==='key'){
  const keys={enter:'{ENTER}',escape:'{ESC}',tab:'{TAB}',up:'{UP}',down:'{DOWN}',left:'{LEFT}',right:'{RIGHT}',backspace:'{BACKSPACE}',space:' '}
  if(!Object.hasOwn(keys,params.key))throw problem(400,'Unsupported desktop key')
  script="$w=New-Object -ComObject WScript.Shell;$w.SendKeys('"+keys[params.key]+"');'true'"
 }else if(['inspect','invoke','set_text'].includes(action)){
  if(!Number.isInteger(params.pid)||params.pid<1||params.pid>2147483647)throw problem(400,'Invalid process ID')
  const encode=value=>Buffer.from(value,'utf8').toString('base64')
  const field=(value,max)=>typeof value==='string'&&value.length<=max&&!value.includes('\0')
  if(action!=='inspect'&&(!field(params.automationId,256)||!field(params.name,256)||(!params.automationId&&!params.name)||!field(params.controlType,80)))throw problem(400,'Exact control selector required')
  if(action==='set_text'&&!field(params.text,2000))throw problem(400,'Invalid text')
  const common="Add-Type -AssemblyName UIAutomationClient;Add-Type -AssemblyName UIAutomationTypes;$ErrorActionPreference='Stop';$p=Get-Process -Id "+params.pid+";if(!$p.MainWindowHandle){throw 'Window not available'};$root=[System.Windows.Automation.AutomationElement]::FromHandle($p.MainWindowHandle);$els=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);"
  if(action==='inspect'){
   script=common+"$rows=@();for($i=0;$i -lt [Math]::Min($els.Count,500);$i++){try{$e=$els.Item($i);$c=$e.Current;if($c.IsPassword -or !$c.IsEnabled -or $c.IsOffscreen){continue};$a=$null;$v=$null;$invoke=$e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$a);$value=$e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$v);if(!$invoke -and !$value -and !$c.Name){continue};$rows+=@{name=([string]$c.Name).Substring(0,[Math]::Min(256,([string]$c.Name).Length));automationId=([string]$c.AutomationId).Substring(0,[Math]::Min(256,([string]$c.AutomationId).Length));controlType=$c.ControlType.ProgrammaticName;canInvoke=$invoke;canSetText=($value -and !$v.Current.IsReadOnly)};if($rows.Count -ge 100){break}}catch{}};ConvertTo-Json -InputObject @($rows) -Compress -Depth 4"
  }else{
   const decode=value=>"[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+encode(value)+"'))"
   script=common+"$wantedId="+decode(params.automationId)+";$wantedName="+decode(params.name)+";$wantedType="+decode(params.controlType)+";$matchesFound=@();for($i=0;$i -lt [Math]::Min($els.Count,500);$i++){try{$e=$els.Item($i);$c=$e.Current;if(!$c.IsPassword -and $c.IsEnabled -and !$c.IsOffscreen -and $c.AutomationId -ceq $wantedId -and $c.Name -ceq $wantedName -and $c.ControlType.ProgrammaticName -ceq $wantedType){$matchesFound+= $e}}catch{}};if($els.Count -gt 500 -or $matchesFound.Count -ne 1){throw 'Control unavailable or ambiguous'};$e=$matchesFound[0];$pat=$null;"
   if(action==='invoke')script+="if(!$e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pat)){throw 'Control does not support Invoke'};$pat.Invoke();'true'"
   else script+="if(!$e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pat) -or $pat.Current.IsReadOnly -or $e.Current.IsPassword){throw 'Control does not support text input'};$pat.SetValue("+decode(params.text)+");'true'"
  }
 }else if(action==='screenshot'){
  script="Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds;$bmp=New-Object Drawing.Bitmap($b.Width,$b.Height);$g=[Drawing.Graphics]::FromImage($bmp);try{$g.CopyFromScreen($b.Location,[Drawing.Point]::Empty,$b.Size);$scale=[Math]::Min(1,1280.0/[Math]::Max($b.Width,$b.Height));$small=New-Object Drawing.Bitmap($bmp,[int]($b.Width*$scale),[int]($b.Height*$scale));$ms=New-Object IO.MemoryStream;try{$small.Save($ms,[Drawing.Imaging.ImageFormat]::Jpeg);[Convert]::ToBase64String($ms.ToArray())}finally{$ms.Dispose();$small.Dispose()}}finally{$g.Dispose();$bmp.Dispose()}"
 }else throw problem(400,'Unknown desktop action')
 try{const {stdout}=await exec(ps(),psArgs('[Console]::OutputEncoding=[Text.UTF8Encoding]::new();'+script),{timeout:12000,maxBuffer:3*1024*1024,windowsHide:true,env:commandEnv()});const text=stdout.trim();return action==='screenshot'?{jpeg:text}:action==='windows'?{windows:text?JSON.parse(text):[]}:action==='inspect'?{controls:text?JSON.parse(text):[]}:{performed:text.toLowerCase()==='true'}}
 catch{throw problem(503,'Desktop unavailable in this Windows session')}
}
function createRemoteControl({dir,readState,clock=Date.now}){
 let running=false, activeOperations=0
 const ids=new Map()
 async function status(req){
  if(!privateAddress(req.socket.remoteAddress)||readState()?.mode==='tunnel')throw problem(403,'Remote control requires a trusted LAN or private tailnet')
  const p=await policy(dir,clock())
  return {enabled:!!p,platform:process.platform,until:p?.until||0,roots:p?.roots||[],shell:!!p?.shell,files:!!p?.files,desktop:!!p?.desktop,maxFileBytes:MAX_FILE,maxDownloadBytes:MAX_DOWNLOAD,downloadChunkBytes:CHUNK}
 }
 async function perform(req,body){
  const p=await status(req)
  if(!p.enabled)throw problem(403,'Enable remote control on the computer first')
  if(!body||typeof body!=='object')throw problem(400,'Invalid action')
  const action=body.action
  if(action==='list'){
   if(!p.files)throw problem(403,'File access disabled')
   const base=await locate(p.roots,body.root,body.path||'',{directory:true})
   const rows=await fs.readdir(base,{withFileTypes:true})
   return {entries:rows.filter(e=>!e.isSymbolicLink()&&(e.isDirectory()||e.isFile())).slice(0,500).map(e=>({name:e.name,directory:e.isDirectory()})),truncated:rows.length>500}
  }
  // Chunked download is read-only and tied to the same file identity on every request.
  // It never opens an arbitrary URL or bypasses the local file permission.
  if(action==='download_info'||action==='download_chunk'){
   if(!p.files)throw problem(403,'File access disabled')
   const file=await locate(p.roots,body.root,body.path)
   const fd=await fs.open(file,require('node:fs').constants.O_RDONLY|(require('node:fs').constants.O_NOFOLLOW||0))
   try{
    const st=await fd.stat()
    if(!st.isFile()||st.nlink!==1||st.size>MAX_DOWNLOAD)throw problem(413,'File exceeds download limit')
    const version=snapshot(st)
    let result
    if(action==='download_info'){
     const hash=crypto.createHash('sha256'),buf=Buffer.alloc(CHUNK)
     let offset=0
     while(offset<st.size){
      const {bytesRead}=await fd.read(buf,0,Math.min(CHUNK,st.size-offset),offset)
      if(!bytesRead)throw problem(409,'File changed during download')
      hash.update(buf.subarray(0,bytesRead));offset+=bytesRead
     }
     result={bytes:st.size,version,sha256:hash.digest('hex'),chunkBytes:CHUNK}
    }else{
     if(body.version!==version)throw problem(409,'File changed during download')
     if(!Number.isSafeInteger(body.offset)||body.offset<0||body.offset>=st.size||body.offset%CHUNK!==0)throw problem(400,'Invalid download offset')
     const data=Buffer.alloc(Math.min(CHUNK,st.size-body.offset))
     let read=0
     while(read<data.length){
      const {bytesRead}=await fd.read(data,read,data.length-read,body.offset+read)
      if(!bytesRead)throw problem(409,'File changed during download')
      read+=bytesRead
     }
     result={base64:data.toString('base64'),bytes:read,sha256:sha256(data),version,offset:body.offset}
    }
    const end=await fd.stat()
    if(snapshot(end)!==version||end.nlink!==1)throw problem(409,'File changed during download')
    const fresh=await status(req)
    if(!fresh.files||fresh.until!==p.until||JSON.stringify(fresh.roots)!==JSON.stringify(p.roots))throw problem(403,'Remote permission changed')
    return result
   }finally{await fd.close()}
  }
  if(action==='download'){
   if(!p.files)throw problem(403,'File access disabled')
   const file=await locate(p.roots,body.root,body.path)
   const fd=await fs.open(file,'r')
   try{const st=await fd.stat();if(!st.isFile()||st.nlink!==1||st.size>MAX_FILE)throw problem(413,'File exceeds limit');const data=Buffer.alloc(st.size+1);const {bytesRead}=await fd.read(data,0,data.length,0);if(bytesRead!==st.size)throw problem(409,'File changed');const b=data.subarray(0,bytesRead);return {base64:b.toString('base64'),bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')}}finally{await fd.close()}
  }
  if(action==='upload'){
   if(!p.files)throw problem(403,'File access disabled')
   if(typeof body.base64!=='string'||body.base64.length>Math.ceil(MAX_FILE/3)*4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.base64))throw problem(400,'Invalid file payload')
   const data=Buffer.from(body.base64,'base64')
   if(data.length>MAX_FILE)throw problem(413,'File exceeds limit')
   const hash=crypto.createHash('sha256').update(data).digest('hex')
   if(body.sha256!==hash)throw problem(400,'Checksum mismatch')
   const file=await locate(p.roots,body.root,body.path,{create:true})
   const fd=await fs.open(file,'wx',0o600)
   try{await fd.writeFile(data);await fd.sync()}catch(e){await fd.close();await fs.rm(file,{force:true}).catch(()=>{});throw e}finally{await fd.close().catch(()=>{})}
   return {bytes:data.length,sha256:hash}
  }
  if(action==='shell'||['windows','activate','screenshot','click','key','inspect','invoke','set_text'].includes(action)){
   if(action==='shell'?!p.shell:!p.desktop)throw problem(403,'Capability disabled on computer')
   if(typeof body.id!=='string'||!(/^[0-9a-f-]{36}$/i).test(body.id))throw problem(400,'Action ID required')
   if(ids.has(body.id))throw problem(409,'Action already accepted; do not repeat automatically')
   if(running)throw problem(409,'Another remote action is running')
   let cwd
   if(action==='shell'){
    if(typeof body.command!=='string'||!body.command.trim()||body.command.length>8000||body.command.includes('\0'))throw problem(400,'Invalid command')
    cwd=await locate(p.roots,body.root,body.path||'',{directory:true})
   }
   const fresh=await status(req)
   if(!fresh.enabled||fresh.until!==p.until||(action==='shell'?!fresh.shell:!fresh.desktop)||JSON.stringify(fresh.roots)!==JSON.stringify(p.roots))throw problem(403,'Remote permission changed')
   if(running||ids.has(body.id))throw problem(409,'Action already accepted')
   if(ids.size>=1000)throw problem(429,'Remote action limit reached; restart launcher after review')
   ids.set(body.id,true);running=true
   try{return action==='shell'?await shellRun(body.command,cwd):await desktopAction(action,body)}finally{running=false}
  }
  throw problem(400,'Unsupported remote action')
 }
 async function act(req,body){
  if(activeOperations>=4)throw problem(429,"Too many remote operations")
  activeOperations++
  try{return await perform(req,body)}finally{activeOperations--}
 }
 return {status,act,isWorking:()=>activeOperations>0}
}
module.exports={createRemoteControl,privateAddress,relative,locate,policy,shellRun}
