'use strict'
const {test}=require('node:test')
const assert=require('node:assert/strict')
const {benchmark}=require('./llm-control')
test('Ollama benchmark uses actual timing, not output length',async()=>{
 const fetchImpl=async(url,init)=>{
  const data=url.endsWith('/v1/models')?{data:[]}:url.endsWith('/api/tags')?{models:[{name:'test'}]}:{eval_count:60,eval_duration:2000000000,prompt_eval_count:20,prompt_eval_duration:1000000000}
  if(url.endsWith('/api/generate'))assert.equal(JSON.parse(init.body).options.num_predict,64)
  return {status:200,text:async()=>JSON.stringify(data)}
 }
 const result=await benchmark('ollama','test',{fetchImpl})
 assert.equal(result.ok,true);assert.equal(result.generationPerSecond,30);assert.equal(result.promptPerSecond,20)
})
