'use strict'
// Git workspace for locally trusted repositories. Opt-in on the computer via AGENTLINK_GIT_ROOTS
// (path.delimiter-separated absolute roots). No arbitrary shell or remote URL.
const fs=require('node:fs/promises')
const crypto=require('node:crypto')
const path=require('node:path')
const {execFile}=require('node:child_process')
const {promisify}=require('node:util')
const run=promisify(execFile)
const allowedRoots=()=>String(process.env.AGENTLINK_GIT_ROOTS||'').split(path.delimiter).filter(p=>path.isAbsolute(p))
function inside(root,child){const rel=path.relative(root,child);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+path.sep))}
function problem(status,message){return Object.assign(new Error(message),{status})}
async function git(cwd,args){
 const env={...process.env,GIT_OPTIONAL_LOCKS:'0',GIT_TERMINAL_PROMPT:'0',GIT_CONFIG_NOSYSTEM:'1'}
 // Do not let inherited Git variables redirect repository or index selection.
 for(const key of ['GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_CONFIG','GIT_CONFIG_COUNT','GIT_CONFIG_PARAMETERS','GIT_CEILING_DIRECTORIES'])delete env[key]
 const {stdout}=await run('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+(process.platform==='win32'?'NUL':'/dev/null'),'-c','core.quotePath=false','-C',cwd,...args],{encoding:'utf8',timeout:8000,maxBuffer:2*1024*1024,windowsHide:true,env})
 return stdout
}
async function resolveWorkspace(requested,{roots=allowedRoots(),execute=git}={}){
 if(!roots.length)throw problem(403,'Git workspace access is not enabled on this computer')
 if(typeof requested!=='string'||!path.isAbsolute(requested)||requested.includes('\0'))throw problem(400,'absolute project path required')
 const actual=await fs.realpath(requested).catch(()=>{throw problem(404,'project folder not found')})
 const permitted=(await Promise.all(roots.map(r=>fs.realpath(r).catch(()=>null)))).filter(Boolean)
 if(!permitted.some(r=>inside(r,actual)))throw problem(403,'project outside configured roots')
 if(!(await fs.stat(actual)).isDirectory())throw problem(400,'project folder required')
 let top
 try{top=await fs.realpath((await execute(actual,['rev-parse','--show-toplevel'])).trim())}catch{throw problem(400,'not a Git working tree')}
 if(!permitted.some(r=>inside(r,top)))throw problem(403,'repository outside configured roots')
 const common=await fs.realpath((await execute(top,['rev-parse','--path-format=absolute','--git-common-dir'])).trim()).catch(()=>{throw problem(400,'Git common directory unavailable')})
 if(!permitted.some(r=>inside(r,common)))throw problem(403,'Git metadata outside configured roots')
 return {top,permitted,execute,common}
}
async function inventory(requested,options={}){
 const {top,permitted,execute}=await resolveWorkspace(requested,options)
 // Read-only commands, bounded output. Worktree paths outside the allowlist are omitted.
 const [status,branches,worktrees]=await Promise.all([
   execute(top,['status','--porcelain=v1','-z','--branch','--untracked-files=normal']),
   execute(top,['for-each-ref','--format=%(refname:short)','refs/heads']),
   execute(top,['worktree','list','--porcelain','-z'])
 ])
 const trees=[]
 for(const block of worktrees.split('\0\0')){
  const fields=block.split('\0'), first=fields[0]
  if(!first?.startsWith('worktree '))continue
  const candidate=first.slice(9)
  const canonical=await fs.realpath(candidate).catch(()=>null)
  if(!canonical||!permitted.some(r=>inside(r,canonical)))continue
  trees.push({path:canonical,branch:fields.find(v=>v.startsWith('branch '))?.slice(7)||null,head:fields.find(v=>v.startsWith('HEAD '))?.slice(5)||null,locked:fields.some(v=>v==='locked'||v.startsWith('locked '))})
 }
 return {root:top,statusPorcelain:status,branches:branches.split(/\r?\n/).filter(Boolean),worktrees:trees}
}
const MAX_FILE_BYTES=256*1024
const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex')
function safeRelative(value){
 if(typeof value!=='string'||!value||value.length>4096||path.isAbsolute(value)||/^[A-Za-z]:/.test(value)||value.includes('\0')||value.includes('\\')||/[\x00-\x1f:]/.test(value)||value.split('/').some(x=>!x||x==='.'||x==='..'||x.toLowerCase()==='.git'||/[. ]$/.test(x)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(x)))throw problem(400,'invalid relative file path')
 return value
}
async function resolveFile(cwd,relative,options){
 const {top}=await resolveWorkspace(cwd,options)
 const name=safeRelative(relative)
 const file=path.join(top,...name.split('/'))
 // Refuse symlinks/junctions at every component. Workspace must be trusted.
 let cursor=top
 for(const part of name.split('/')){
  cursor=path.join(cursor,part)
  const stat=await fs.lstat(cursor).catch(()=>{throw problem(404,'file not found')})
  if(stat.isSymbolicLink())throw problem(403,'symbolic links are not editable')
 }
 if(await fs.realpath(file)!==file||!inside(top,file))throw problem(403,'file outside workspace')
 const stat=await fs.stat(file)
 if(!stat.isFile()||stat.nlink!==1||stat.size>MAX_FILE_BYTES)throw problem(400,'file is not an editable small text file')
 return {file,stat}
}
async function readText(cwd,relative,options={}){
 const {file}=await resolveFile(cwd,relative,options)
 const buffer=await fs.readFile(file)
 if(buffer.length>MAX_FILE_BYTES||buffer.includes(0))throw problem(400,'file is not editable text')
 let text
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buffer)}catch{throw problem(400,'file is not UTF-8')}
 return {text,revision:digest(buffer)}
}
const locks=new Map()
async function exclusive(key,fn){
 if(locks.has(key))throw problem(409,'another workspace operation is running')
 locks.set(key,true)
 try{return await fn()}finally{locks.delete(key)}
}
async function writeText(cwd,relative,text,revision,options={}){
 if(typeof text!=='string'||Buffer.byteLength(text)>MAX_FILE_BYTES||text.includes('\0')||typeof revision!=='string'||!/^[a-f0-9]{64}$/.test(revision))throw problem(400,'invalid text or revision')
 const {file,stat}=await resolveFile(cwd,relative,options)
 return exclusive(file,async()=>{
  const current=await fs.readFile(file)
  if(digest(current)!==revision)throw problem(409,'file changed since it was opened')
  const tmp=path.join(path.dirname(file),'.agentlink-'+crypto.randomUUID()+'.tmp')
  const buffer=Buffer.from(text,'utf8')
  try{
   await fs.writeFile(tmp,buffer,{flag:'wx',mode:stat.mode&0o777})
   const fresh=await resolveFile(cwd,relative,options)
   if(fresh.file!==file||digest(await fs.readFile(file))!==revision)throw problem(409,'file changed while saving')
   await fs.rename(tmp,file)
   return {revision:digest(buffer)}
  }finally{await fs.rm(tmp,{force:true}).catch(()=>{})}
 })
}
function safeBranch(name){
 if(typeof name!=='string'||!(/^[A-Za-z0-9][A-Za-z0-9/_-]{0,79}$/).test(name)||name.includes('//')||name.endsWith('/')||name.split('/').some(p=>!p||p.endsWith('.lock')))throw problem(400,'invalid branch name')
 return name
}
// Repository-aware browser: list tracked/nonignored files without following symlinks.
async function listFiles(cwd,options={}){
 const {top,execute}=await resolveWorkspace(cwd,options)
 const raw=await execute(top,['ls-files','-z','--cached','--others','--exclude-standard'])
 const files=[]
 const seen=new Set()
 for(const name of raw.split('\0')){
  if(!name||seen.has(name))continue
  seen.add(name)
  try{safeRelative(name)}catch{continue}
  if(files.length>=4000)return {files,truncated:true}
  files.push(name)
 }
 return {files,truncated:false}
}
async function gitAction(cwd,body,options={}){
 const {top,permitted,execute,common}=await resolveWorkspace(cwd,options)
 return exclusive(common,async()=>{
  switch(body?.action){
   case 'diff':return {text:await execute(top,['--literal-pathspecs','diff','--no-ext-diff','--no-textconv',...(body.staged===true?['--cached']:[]),'--',...(body.file?[safeRelative(body.file)]:[])])}
   case 'files':return listFiles(top,options)
   case 'log':return {text:await execute(top,['log','-30','--format=%h %s','--'])}
   case 'stage':case 'unstage':{
    const name=safeRelative(body.file)
    await execute(top,body.action==='stage'?['--literal-pathspecs','add','--',name]:['--literal-pathspecs','restore','--staged','--',name])
    return {}
   }
   case 'commit':{
    if(typeof body.message!=='string'||!body.message.trim()||body.message.length>2000||body.message.includes('\0'))throw problem(400,'invalid commit message')
    await execute(top,['-c','commit.gpgsign=false','commit','-m',body.message]);return {}
   }
   case 'branch':await execute(top,['branch',safeBranch(body.branch)]);return {}
   case 'switch':{
    const branch=safeBranch(body.branch)
    if((await execute(top,['status','--porcelain=v1','-z'])).length)throw problem(409,'working tree has changes')
    const branches=(await execute(top,['for-each-ref','--format=%(refname:short)','refs/heads'])).split(/\r?\n/)
    if(!branches.includes(branch))throw problem(404,'local branch not found')
    await execute(top,['switch','--',branch]);return {}
   }
   case 'worktree':{
    const branch=safeBranch(body.branch)
    // Locally configured root, generated path: the caller cannot choose arbitrary destination.
    const parent=permitted.find(r=>r!==top&&inside(r,top)&&!inside(top,r))
    if(!parent)throw problem(403,'allow the parent folder of this repository to create an isolated worktree outside it')
    const container=path.join(parent,'.agentlink-worktrees')
    await fs.mkdir(container,{recursive:true})
    if(await fs.realpath(container)!==container)throw problem(403,'invalid worktree directory')
    const target=path.join(container,crypto.randomUUID())
    await execute(top,['worktree','add','-b',branch,target,'HEAD'])
    return {path:target,branch}
   }
   default:throw problem(400,'unsupported Git operation')
  }
 })
}
module.exports={inventory,inside,readText,writeText,gitAction,listFiles,safeRelative,safeBranch}
