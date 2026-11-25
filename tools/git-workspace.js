'use strict'
// Read-only Git inventory. Opt-in on the computer via AGENTLINK_GIT_ROOTS
// (path.delimiter-separated absolute roots). No arbitrary shell or remote URL.
const fs=require('node:fs/promises')
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
 const {stdout}=await run('git',['-c','core.fsmonitor=false','-c','core.hooksPath='+path.join(cwd,'.git','agentlink-no-hooks'),'-c','core.quotePath=false','-C',cwd,...args],{encoding:'utf8',timeout:8000,maxBuffer:2*1024*1024,windowsHide:true,env})
 return stdout
}
async function inventory(requested,{roots=allowedRoots(),execute=git}={}){
 if(!roots.length)throw problem(403,'Git workspace access is not enabled on this computer')
 if(typeof requested!=='string'||!path.isAbsolute(requested)||requested.includes('\0'))throw problem(400,'absolute project path required')
 const actual=await fs.realpath(requested).catch(()=>{throw problem(404,'project folder not found')})
 const permitted=(await Promise.all(roots.map(r=>fs.realpath(r).catch(()=>null)))).filter(Boolean)
 if(!permitted.some(r=>inside(r,actual)))throw problem(403,'project outside configured roots')
 if(!(await fs.stat(actual)).isDirectory())throw problem(400,'project folder required')
 let top
 try{top=await fs.realpath((await execute(actual,['rev-parse','--show-toplevel'])).trim())}catch{throw problem(400,'not a Git working tree')}
 if(!permitted.some(r=>inside(r,top)))throw problem(403,'repository outside configured roots')
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
module.exports={inventory,inside}
