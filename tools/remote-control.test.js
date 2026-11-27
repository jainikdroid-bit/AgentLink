'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto')
const {createRemoteControl,privateAddress,relative}=require('./remote-control')
test('private addresses only, no path aliases or traversal',()=>{
 for(const ip of ['127.0.0.1','192.168.0.1','100.64.0.1','::ffff:10.0.0.2'])assert.equal(privateAddress(ip),true)
 for(const ip of ['8.8.8.8','100.128.0.1','169.254.1.1','10..0.1','0.0.0.0'])assert.equal(privateAddress(ip),false)
 for(const name of ['../file','a/../b','C:/file','x\\y','NUL','a.','a:stream',''])assert.throws(()=>relative(name),{status:400})
})
test('remote permissions, real binary transfer, checksum, overwrite and command replay',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-remote-'))
 const root=path.join(dir,'project');await fs.mkdir(root)
 let mode='lan',now=1700000000000
 const req={socket:{remoteAddress:'192.168.0.12'}}
 const service=createRemoteControl({dir,readState:()=>({mode}),clock:()=>now})
 const configure=async(p)=>fs.writeFile(path.join(dir,'remote-control.json'),JSON.stringify({until:now+3600000,roots:[root],shell:false,files:true,desktop:false,...p}))
 const action=body=>service.act(req,body)
 try{
  assert.equal((await service.status(req)).enabled,false)
  await assert.rejects(action({action:'list',root:0,path:''}),{status:403})
  await configure({})
  const data=Buffer.from([0,1,255,4,5]),sha256=crypto.createHash('sha256').update(data).digest('hex')
  const body={action:'upload',root:0,path:'sample.bin',base64:data.toString('base64'),sha256}
  await assert.rejects(action({...body,sha256:'bad'}),{status:400})
  await action(body)
  await assert.rejects(action(body),{status:409})
  assert.deepEqual((await action({action:'list',root:0,path:''})).entries,[{name:'sample.bin',directory:false}])
  const downloaded=await action({action:'download',root:0,path:'sample.bin'})
  assert.equal(downloaded.sha256,sha256);assert.deepEqual(Buffer.from(downloaded.base64,'base64'),data)
  await assert.rejects(action({...body,path:'../secret'}),{status:400})
  if(process.platform!=='win32'){await fs.symlink(path.join(root,'sample.bin'),path.join(root,'link'));await assert.rejects(action({action:'download',root:0,path:'link'}),{status:403})}
  const command={action:'shell',root:0,path:'',id:crypto.randomUUID(),command:process.platform==='win32'?'Write-Output agentlink-test':'printf agentlink-test'}
  await assert.rejects(action(command),{status:403})
  await configure({shell:true})
  const result=await action(command);assert.equal(result.exitCode,0);assert.match(result.stdout,/agentlink-test/)
  await assert.rejects(action(command),{status:409})
  mode='tunnel';await assert.rejects(service.status(req),{status:403});mode='lan'
  await assert.rejects(service.status({socket:{remoteAddress:'8.8.8.8'}}),{status:403})
  now+=3600001;assert.equal((await service.status(req)).enabled,false)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})

test('launcher cannot auto-restart while an approved remote operation is active',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-active-'))
 try{
  await fs.writeFile(path.join(dir,'remote-control.json'),JSON.stringify({until:Date.now()+60000,roots:[dir],shell:true,files:false,desktop:false}))
  const service=createRemoteControl({dir,readState:()=>({mode:'lan'})})
  const req={socket:{remoteAddress:'127.0.0.1'}}
  const command=process.platform==='win32'?'Start-Sleep -Milliseconds 300; Write-Output done':'sleep 0.3; printf done'
  const task=service.act(req,{action:'shell',root:0,path:'',id:crypto.randomUUID(),command})
  assert.equal(service.isWorking(),true)
  const result=await task
  assert.equal(result.exitCode,0)
  assert.equal(service.isWorking(),false)
  await assert.rejects(service.act(req,{action:'invalid'}),{status:400})
  assert.equal(service.isWorking(),false)
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})

test('chunked download beyond legacy limit, integrity, mutation and permission revocation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-chunked-'))
 try{
  const root=path.join(dir,'project');await fs.mkdir(root)
  const file=path.join(root,'large.bin'),data=crypto.randomBytes(5*1024*1024+123)
  await fs.writeFile(file,data)
  const policyFile=path.join(dir,'remote-control.json')
  await fs.writeFile(policyFile,JSON.stringify({until:Date.now()+60000,roots:[root],files:true}))
  const service=createRemoteControl({dir,readState:()=>({mode:'lan'})})
  const req={socket:{remoteAddress:'192.168.0.2'}}
  const action=(action,extra={})=>service.act(req,{action,root:0,path:'large.bin',...extra})
  const info=await action('download_info')
  assert.equal(info.bytes,data.length)
  assert.equal(info.sha256,crypto.createHash('sha256').update(data).digest('hex'))
  assert.equal(info.chunkBytes,512*1024)
  assert.equal((await service.status(req)).maxDownloadBytes,256*1024*1024)
  await assert.rejects(action('download'),{status:413})
  await assert.rejects(action('download_chunk',{version:info.version,offset:1}),{status:400})
  await assert.rejects(action('download_chunk',{version:'stale',offset:0}),{status:409})
  const hash=crypto.createHash('sha256')
  for(let offset=0;offset<data.length;offset+=info.chunkBytes){
   const chunk=await action('download_chunk',{version:info.version,offset})
   const decoded=Buffer.from(chunk.base64,'base64')
   assert.equal(chunk.offset,offset)
   assert.equal(chunk.version,info.version)
   assert.equal(chunk.sha256,crypto.createHash('sha256').update(decoded).digest('hex'))
   assert.deepEqual(decoded,data.subarray(offset,offset+info.chunkBytes))
   hash.update(decoded)
  }
  assert.equal(hash.digest('hex'),info.sha256)
  await fs.appendFile(file,'changed')
  await assert.rejects(action('download_chunk',{version:info.version,offset:0}),{status:409})
  await fs.writeFile(path.join(root,'empty'),'')
  const empty=await action('download_info',{path:'empty'})
  assert.equal(empty.bytes,0)
  assert.equal(empty.sha256,crypto.createHash('sha256').digest('hex'))
  await fs.rm(policyFile)
  await assert.rejects(action('download_info'),{status:403})
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})

test('staged upload beyond legacy limit, checksum, exclusive publish and cancellation',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-upload-'))
 try{
  const root=path.join(dir,'project');await fs.mkdir(root)
  const policyFile=path.join(dir,'remote-control.json')
  const grant={until:Date.now()+60000,roots:[root],files:true}
  await fs.writeFile(policyFile,JSON.stringify(grant))
  const service=createRemoteControl({dir,readState:()=>({mode:'lan'})})
  const req={socket:{remoteAddress:'192.168.0.2'}}
  const data=crypto.randomBytes(5*1024*1024+33),hash=b=>crypto.createHash('sha256').update(b).digest('hex')
  const sha256=hash(data)
  let transferId=crypto.randomUUID(),name='large.bin'
  const action=(action,extra={})=>service.act(req,{action,root:0,path:name,transferId,...extra})
  const begin=()=>action('upload_begin',{bytes:data.length,sha256})
  assert.equal((await service.status(req)).maxUploadBytes,256*1024*1024)
  await begin()
  assert.equal(service.isWorking(),true)
  await assert.rejects(fs.stat(path.join(root,name)),{code:'ENOENT'})
  await assert.rejects(action('upload_finish'),{status:409})
  transferId=crypto.randomUUID();await begin()
  const first=data.subarray(0,512*1024)
  await assert.rejects(action('upload_chunk',{offset:0,base64:first.toString('base64'),sha256:'0'.repeat(64)}),{status:400})
  await assert.rejects(action('upload_finish'),{status:409})
  transferId=crypto.randomUUID();await begin()
  for(let offset=0;offset<data.length;offset+=512*1024){
   const part=data.subarray(offset,offset+512*1024)
   const result=await action('upload_chunk',{offset,base64:part.toString('base64'),sha256:hash(part)})
   assert.equal(result.offset,offset+part.length)
  }
  assert.deepEqual(await action('upload_finish'),{bytes:data.length,sha256})
  assert.equal(service.isWorking(),false)
  assert.deepEqual(await fs.readFile(path.join(root,name)),data)
  transferId=crypto.randomUUID()
  await assert.rejects(begin(),{status:409})
  name='cancelled.bin';transferId=crypto.randomUUID();await begin()
  assert.equal((await action('upload_cancel')).cancelled,true)
  assert.equal(service.isWorking(),false)
  await assert.rejects(action('upload_finish'),{status:409})
  assert.deepEqual(await fs.readdir(path.join(dir,'remote-upload-staging')),[])
  await assert.rejects(fs.stat(path.join(root,name)),{code:'ENOENT'})
  name='race.bin';transferId=crypto.randomUUID()
  const emptyHash=hash(Buffer.alloc(0))
  await action('upload_begin',{bytes:0,sha256:emptyHash})
  await fs.writeFile(path.join(root,name),'existing')
  await assert.rejects(action('upload_finish'),{status:409})
  assert.equal(await fs.readFile(path.join(root,name),'utf8'),'existing')
  name='empty.bin';transferId=crypto.randomUUID()
  await action('upload_begin',{bytes:0,sha256:emptyHash})
  assert.deepEqual(await action('upload_finish'),{bytes:0,sha256:emptyHash})
  name='revoked.bin';transferId=crypto.randomUUID()
  await action('upload_begin',{bytes:0,sha256:emptyHash})
  await fs.writeFile(policyFile,JSON.stringify({...grant,until:grant.until+1}))
  await assert.rejects(action('upload_finish'),{status:403})
  await assert.rejects(fs.stat(path.join(root,name)),{code:'ENOENT'})
  assert.deepEqual(await fs.readdir(path.join(dir,'remote-upload-staging')),[])
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
