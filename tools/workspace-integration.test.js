'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const {execFileSync}=require('node:child_process')
const {inventory,gitAction,readText,writeText}=require('./git-workspace')
test('Git worktree and file revision integration',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-workspace-'))
 const project=path.join(dir,'project')
 try{
  await fs.mkdir(project)
  const git=(...args)=>execFileSync('git',['-C',project,...args],{stdio:'pipe'})
  git('init');git('config','user.name','AgentLink test');git('config','user.email','test@example.invalid')
  await fs.writeFile(path.join(project,'a.ts'),'const a=1\n');git('add','a.ts');git('commit','-m','initial')
  const options={roots:[dir]},initial=await readText(project,'a.ts',options)
  const updated=await writeText(project,'a.ts','const a=2\n',initial.revision,options)
  assert.notEqual(updated.revision,initial.revision)
  await assert.rejects(writeText(project,'a.ts','oops',initial.revision,options),{status:409})
  await assert.rejects(readText(project,'../a.ts',options),{status:400})
  await gitAction(project,{action:'stage',file:'a.ts'},options)
  await gitAction(project,{action:'commit',message:'update'},options)
  const tree=await gitAction(project,{action:'worktree',branch:'test-isolation'},options)
  assert.notEqual(tree.path,project)
  assert.equal((await inventory(project,options)).worktrees.length,2)
  await fs.writeFile(path.join(tree.path,'a.ts'),'const a=3\n')
  assert.equal((await readText(project,'a.ts',options)).text,'const a=2\n')
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})

test('Git metadata and unsafe paths cannot escape configured roots',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-root-'))
 const outside=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-outside-'))
 const {safeRelative}=require('./git-workspace')
 try{
  const project=path.join(root,'project');await fs.mkdir(project)
  const git=(...args)=>execFileSync('git',['-C',project,...args],{stdio:'pipe'})
  git('init');git('config','user.name','Test');git('config','user.email','test@example.invalid')
  await fs.writeFile(path.join(project,'a.ts'),'a');git('add','a.ts');git('commit','-m','init')
  for(const name of ['../a.ts','.git/config','.git./config','a.ts:ads','NUL','x\\y'])assert.throws(()=>safeRelative(name),{status:400})
  await assert.rejects(gitAction(project,{action:'worktree',branch:'no-parent'},{roots:[project]}),{status:403})
  const tree=path.join(outside,'worktree');git('worktree','add','-b','outside',tree)
  await assert.rejects(inventory(tree,{roots:[outside]}),{status:403})
  if(process.platform!=='win32'){
    await fs.writeFile(path.join(outside,'private'),'test')
    await fs.symlink(path.join(outside,'private'),path.join(project,'link'))
    await assert.rejects(readText(project,'link',{roots:[root]}),{status:403})
    await fs.link(path.join(outside,'private'),path.join(project,'hard'))
    await assert.rejects(readText(project,'hard',{roots:[root]}),{status:400})
  }
 }finally{await fs.rm(outside,{recursive:true,force:true});await fs.rm(root,{recursive:true,force:true})}
})
