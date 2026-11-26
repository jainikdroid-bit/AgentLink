// Local model control for the launcher: is the llama.cpp server (router mode) up, which models does it
// know, which are loaded in memory, and load/unload one. The phone calls the launcher (password checked
// there); this module only talks to the model server on the computer itself.
//   GET  <base>/v1/models          -> { data: [{ id, status: { value: "loaded" | "unloaded" | "loading" } }] }
//   POST <base>/models/load|unload -> { success: true }
'use strict'

const DEFAULT_BASE = process.env.OPENCODE_CONNECT_LLM_URL || 'http://127.0.0.1:8080'
const STATUS_TIMEOUT_MS = 3000
const ACTION_TIMEOUT_MS = 120_000 // loading a big model from disk can take a minute

async function call(fetchImpl, url, init, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { ...init, redirect:'error', signal: controller.signal })
    const text = await response.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { /* not JSON */ }
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

/** { available: false } when no model server answers; otherwise the models and their memory state. */
async function llmStatus({ fetchImpl = fetch, base = DEFAULT_BASE } = {}) {
  try {
    const { status, body } = await call(fetchImpl, `${base}/v1/models`, { method: 'GET' }, STATUS_TIMEOUT_MS)
    if (status !== 200 || !body || !Array.isArray(body.data)) return { available: false }
    const models = body.data
      .filter((m) => m && typeof m.id === 'string')
      .map((m) => ({ id: m.id, state: m.status && typeof m.status.value === 'string' ? m.status.value : 'unknown' }))
    return { available: true, models }
  } catch {
    return { available: false }
  }
}

/** Loads or unloads one model. Only ids the server itself reports are accepted. */
async function llmAction(action, model, { fetchImpl = fetch, base = DEFAULT_BASE } = {}) {
  if (action !== 'load' && action !== 'unload') return { ok: false, error: 'unknown action' }
  const current = await llmStatus({ fetchImpl, base })
  if (!current.available) return { ok: false, error: 'no model server' }
  if (!current.models.some((m) => m.id === model)) return { ok: false, error: 'unknown model' }
  try {
    const { status, body } = await call(fetchImpl, `${base}/models/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) }, ACTION_TIMEOUT_MS)
    if (status >= 200 && status < 300 && (!body || body.success !== false)) return { ok: true }
    return { ok: false, error: (body && (body.error && (body.error.message || body.error))) || `model server answered ${status}` }
  } catch (error) {
    return { ok: false, error: error && error.name === 'AbortError' ? 'timeout' : String(error && error.message || error) }
  }
}

const OLLAMA_BASE=process.env.AGENTLINK_OLLAMA_URL||'http://127.0.0.1:11434'
function rate(n,ms,scale){return typeof n==='number'&&Number.isFinite(n)&&n>=0&&typeof ms==='number'&&Number.isFinite(ms)&&ms>0?n*scale/ms:null}
async function benchmarkModels({fetchImpl=fetch,base=DEFAULT_BASE,ollama=OLLAMA_BASE}={}){
 const result=[]
 const llama=await llmStatus({fetchImpl,base})
 if(llama.available)for(const model of llama.models)result.push({engine:'llama.cpp',id:model.id,state:model.state})
 try{
  const {status,body}=await call(fetchImpl,ollama+'/api/tags',{method:'GET'},STATUS_TIMEOUT_MS)
  if(status===200&&Array.isArray(body?.models))for(const model of body.models)if(typeof model.name==='string')result.push({engine:'ollama',id:model.name,state:'unknown'})
 }catch{}
 return result
}
let benchmarking=false
async function benchmark(engine,model,{fetchImpl=fetch,base=DEFAULT_BASE,ollama=OLLAMA_BASE}={}){
 if(benchmarking)return {ok:false,error:'benchmark already running'}
 if(!['llama.cpp','ollama'].includes(engine)||typeof model!=='string'||model.length>300)return {ok:false,error:'invalid model'}
 benchmarking=true
 try{
  const models=await benchmarkModels({fetchImpl,base,ollama})
  if(!models.some(m=>m.engine===engine&&m.id===model))return {ok:false,error:'unknown model'}
  const prompt='Explain in plain words why testing small functions helps software quality. Continue with examples.'
  const init=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
  const start=Date.now()
  const {status,body}=engine==='ollama'
    ?await call(fetchImpl,ollama+'/api/generate',init({model,prompt,stream:false,options:{num_predict:64,temperature:0}}),120000)
    :await call(fetchImpl,base+'/completion',init({model,prompt,n_predict:64,stream:false,temperature:0}),120000)
  if(status!==200||!body)return {ok:false,error:'model benchmark failed (HTTP '+status+')'}
  const t=body.timings||{}
  return {ok:true,engine,model,at:Date.now(),elapsedMs:Date.now()-start,
   promptPerSecond:engine==='ollama'?rate(body.prompt_eval_count,body.prompt_eval_duration,1e9):(typeof t.prompt_per_second==='number'&&Number.isFinite(t.prompt_per_second)?t.prompt_per_second:rate(t.prompt_n,t.prompt_ms,1000)),
   generationPerSecond:engine==='ollama'?rate(body.eval_count,body.eval_duration,1e9):(typeof t.predicted_per_second==='number'&&Number.isFinite(t.predicted_per_second)?t.predicted_per_second:rate(t.predicted_n,t.predicted_ms,1000))}
 }catch{return {ok:false,error:'model benchmark unavailable or timed out'}}finally{benchmarking=false}
}
module.exports = { llmStatus, llmAction, DEFAULT_BASE, benchmarkModels, benchmark }
