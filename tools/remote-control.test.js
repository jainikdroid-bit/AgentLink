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
