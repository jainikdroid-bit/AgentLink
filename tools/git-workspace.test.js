'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const fs=require('node:fs/promises')
const os=require('node:os')
const path=require('node:path')
const {inventory,inside}=require('./git-workspace.js')
test('path boundaries reject siblings',()=>{const root=path.resolve('project');assert.ok(inside(root,path.join(root,'src')));assert.equal(inside(root,root+'-other'),false)})
test('Git inventory refuses disabled roots and escaping projects',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentlink-git-'))
 try{
 const root=path.join(dir,'root'),other=path.join(dir,'other');await fs.mkdir(root);await fs.mkdir(other)
 await assert.rejects(inventory(root,{roots:[]}),{status:403})
 await assert.rejects(inventory(other,{roots:[root]}),{status:403})
 await assert.rejects(inventory(root,{roots:[root],execute:async()=>other}),{status:403})
 }finally{await fs.rm(dir,{recursive:true,force:true})}
})
