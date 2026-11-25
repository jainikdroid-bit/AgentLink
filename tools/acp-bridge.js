'use strict'
// ACP bridge: lets the phone talk to other coding agents on this computer (Claude Code, Codex, Gemini CLI,
// Goose, OpenCode, ...) through the Agent Client Protocol (https://agentclientprotocol.com): JSON-RPC over the
// agent's stdin/stdout. The bridge is a dumb pipe plus a replay log; the phone is the ACP client.
//
// Served by the launcher (tools/launcher.js) behind the same password, so it is reachable exactly like the
// launcher: at home directly, away through Tailscale. Routes (all under /acp/):
//   GET  /acp/agents              which known agents are installed, which are running
//   POST /acp/start {agent, cwd}  start one -> {id, cwd}
//   GET  /acp/<id>/events?from=N  Server-Sent Events: everything the agent said (and the phone sent) from
//                                 sequence N on, then "live", then new messages as they come
//   POST /acp/<id>/send <json>    one JSON-RPC message for the agent's stdin
//   POST /acp/<id>/stop           stop the agent
//
// It still runs no arbitrary commands: only agents from the table below, with fixed arguments (the third-party
// adapters are pinned to the versions the ACP registry lists), in a folder that must already exist.
// The log lets the phone close the app and come back to a running agent: a replay rebuilds the whole chat.

const { spawn, spawnSync, execFileSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const crypto = require('node:crypto')

const WIN = process.platform === 'win32'
const MAX_RUNNING = 4
const MAX_LOG_MESSAGES = 5000
const MAX_LOG_BYTES = 16 * 1024 * 1024
const MAX_SEND_BYTES = 8 * 1024 * 1024 // a prompt can carry images
const MAX_START_BYTES = 4096
const MAX_LINE_BYTES = 16 * 1024 * 1024
const STDERR_TAIL_BYTES = 4096
const HEARTBEAT_MS = 15_000
const SWEEP_MS = 60_000
const IDLE_STOP_MS = 6 * 3600_000 // nobody attached and nothing said for this long: stop it
const EXITED_KEEP_MS = 30 * 60_000 // a finished agent stays listed, so the phone can still read why it ended
const DETECT_TTL_MS = 60_000

/** The agents the phone may start. `bin` is what must be on PATH; `cmd` is what runs (npx for the adapters). */
const AGENTS = [
  { id: 'opencode', name: 'OpenCode', bin: 'opencode', cmd: 'opencode', args: ['acp'] },
  { id: 'claude', name: 'Claude Code', bin: 'claude', cmd: 'npx', args: ['-y', '@agentclientprotocol/claude-agent-acp@0.107.0'] },
  { id: 'codex', name: 'Codex', bin: 'codex', cmd: 'npx', args: ['-y', '@agentclientprotocol/codex-acp@2.6.0'] },
  { id: 'gemini', name: 'Gemini CLI', bin: 'gemini', cmd: 'gemini', args: ['--acp'] },
  { id: 'goose', name: 'Goose', bin: 'goose', cmd: 'goose', args: ['acp'] },
  { id: 'qwen', name: 'Qwen Code', bin: 'qwen', cmd: 'qwen', args: ['--acp'] },
  { id: 'copilot', name: 'GitHub Copilot', bin: 'copilot', cmd: 'copilot', args: ['--acp'] },
  // Added in 0.16.1; flags from each vendor's ACP docs (cursor.com/docs/cli/acp, kimi.com kimi-acp,
  // docs.mistral.ai vibe, docs.augmentcode.com/cli/acp, Factory droid, kiro.dev/docs/cli/acp).
  { id: 'cursor', name: 'Cursor', bin: 'cursor-agent', cmd: 'cursor-agent', args: ['acp'] },
  { id: 'kimi', name: 'Kimi Code', bin: 'kimi', cmd: 'kimi', args: ['acp'] },
  { id: 'vibe', name: 'Mistral Vibe', bin: 'vibe-acp', cmd: 'vibe-acp', args: [] },
  { id: 'auggie', name: 'Augment (Auggie)', bin: 'auggie', cmd: 'auggie', args: ['--acp'] },
  { id: 'droid', name: 'Factory Droid', bin: 'droid', cmd: 'droid', args: ['exec', '--output-format', 'acp'] },
  { id: 'kiro', name: 'Kiro', bin: 'kiro-cli', cmd: 'kiro-cli', args: ['acp'] },
]

/** Is a program on PATH? (where.exe on Windows, command -v elsewhere.) */
function onPath(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return false
  try {
    const r = WIN ? spawnSync('where.exe', [name], { stdio: 'ignore', windowsHide: true }) : spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' })
    return r.status === 0
  } catch { return false }
}

/** Kill a process and its children. */
function killTree(child) {
  if (!child || child.exitCode !== null || child.signalCode) return
  try {
    if (WIN) execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true })
    else { child.kill('SIGTERM'); setTimeout(() => { try { child.kill('SIGKILL') } catch { /* gone */ } }, 3000).unref() }
  } catch { /* already gone */ }
}

const keyOf = (id) => JSON.stringify(id)

/**
 * deps (all optional, for tests): agents (table), detect(agent) -> boolean, now() -> ms.
 * Entries with `direct: true` run `cmd` as it is (no cmd.exe wrapper).
 */
/** Same place connect.js and phone-mcp.js keep the state (password, state.json). */
function connectStateDir(env = process.env) {
  if (env.OPENCODE_CONNECT_DIR) return env.OPENCODE_CONNECT_DIR
  if (process.platform === 'win32') return path.join(env.LOCALAPPDATA || os.homedir(), 'opencode-connect')
  return path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opencode-connect')
}

/** The phone MCP server to hand to agents: only when the installer was run with phone tools and phone-mcp.js is next to us. */
function detectPhoneMcp() {
  try {
    const script = path.join(__dirname, 'phone-mcp.js')
    if (!fs.existsSync(script)) return null
    const dir = connectStateDir()
    const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8').replace(/^﻿/, ''))
    return state && state.phoneTools ? { script, dir } : null
  } catch { return null }
}

/** Adds the phone MCP server to a session/new or session/load request (once); anything else passes through unchanged. */
function withPhoneMcp(message, phone) {
  if (!phone || !message || (message.method !== 'session/new' && message.method !== 'session/load')) return message
  const params = message.params && typeof message.params === 'object' && !Array.isArray(message.params) ? message.params : {}
  const servers = Array.isArray(params.mcpServers) ? params.mcpServers : []
  if (servers.some((x) => x && x.name === 'phone')) return message
  const entry = { name: 'phone', command: process.execPath, args: [phone.script], env: phone.dir ? [{ name: 'OPENCODE_CONNECT_DIR', value: phone.dir }] : [] }
  return { ...message, params: { ...params, mcpServers: [...servers, entry] } }
}

// Durable, bounded metadata inbox (not a transcript, no prompt or tool arguments).
// Optional FCM HTTP v1: administrator configures a local service-account file
// and the phone's copied registration token. No credentials leave this host
// other than the signed OAuth assertion to Google's official endpoints.
function createInbox(file,clock=Date.now){
 let events=[]
 if(file)try{const saved=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(saved))events=saved.filter(e=>e&&typeof e.id==='string'&&typeof e.at==='number').slice(-500)}catch{}
 function record(category,session){
  const item={id:crypto.randomUUID(),at:clock(),category,agent:session.agent,bridgeId:session.id}
  events.push(item);events=events.slice(-500)
  if(file){
   const tmp=file+'.'+crypto.randomUUID()+'.tmp'
   try{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(tmp,JSON.stringify(events),{mode:0o600,flag:'wx'});fs.renameSync(tmp,file)}
   catch{try{fs.rmSync(tmp,{force:true})}catch{}}
  }
  return item
 }
 return {record,list:()=>events.slice(),}
}
function createPushSender({accountPath=process.env.AGENTLINK_FCM_SERVICE_ACCOUNT,registration=process.env.AGENTLINK_FCM_TOKEN,fetchImpl=globalThis.fetch}={}){
 let access=null,until=0,queue=Promise.resolve(),pending=0
 const enabled=!!(accountPath&&registration)
 async function token(){
  if(access&&Date.now()<until)return access
  const account=JSON.parse(fs.readFileSync(accountPath,'utf8'))
  if(!account.client_email||!account.private_key||!account.project_id||!(/^[a-z0-9-]+$/).test(account.project_id))throw Error('invalid push configuration')
  const at=Math.floor(Date.now()/1000)
  const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url')
  const assertion=enc({alg:'RS256',typ:'JWT'})+'.'+enc({iss:account.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:at,exp:at+3600})
  const signed=assertion+'.'+crypto.sign('RSA-SHA256',Buffer.from(assertion),account.private_key).toString('base64url')
  const response=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed}),signal:AbortSignal.timeout(10000),redirect:'error'})
  if(!response.ok)throw Error('push OAuth failed')
  const data=await response.json();if(!data.access_token)throw Error('push token missing')
  access={value:data.access_token,project:account.project_id};until=Date.now()+Math.max(0,(Number(data.expires_in)||3600)-60)*1000
  return access
 }
 function send(event){
  if(!enabled||pending>=20)return
  pending++
  queue=queue.then(async()=>{
   try{
    const auth=await token()
    const response=await fetchImpl('https://fcm.googleapis.com/v1/projects/'+auth.project+'/messages:send',{method:'POST',headers:{Authorization:'Bearer '+auth.value,'Content-Type':'application/json'},body:JSON.stringify({message:{token:registration,notification:{title:'AgentLink',body:({permissions:'Agent needs approval',completed:'Agent finished a turn',errors:'Agent reported an error',connection:'Agent disconnected'})[event.category]||'Agent activity'},data:{category:event.category,sessionId:'',eventId:event.id},android:{priority:'high',notification:{channel_id:'prompts',tag:event.id}}}}),signal:AbortSignal.timeout(10000),redirect:'error'})
    if(response.status===401)until=0
    // Inbox remains available even when push fails. Never log OAuth or FCM responses.
   }catch{}finally{pending--}
  })
 }
 return {enabled,send}
}

// Metadata only; the provider owns the actual conversation. Atomic bounded catalog.
function createSessionCatalog(file, clock=Date.now) {
  let entries=[]
  const valid=e=>e&&typeof e.agent==='string'&&typeof e.cwd==='string'&&typeof e.sessionId==='string'&&e.sessionId.length>0&&e.sessionId.length<=512&&Number.isFinite(e.at)
  if(file)try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));if(Array.isArray(raw))entries=raw.filter(valid).slice(-200)}catch{}
  function remember(session){
    const item={agent:session.agent,cwd:session.cwd,sessionId:session.protocolSessionId,at:clock(),loadSession:session.loadSession===true}
    if(!valid(item))return
    entries=entries.filter(e=>!(e.agent===item.agent&&e.cwd===item.cwd&&e.sessionId===item.sessionId))
    entries.push(item);entries=entries.slice(-200)
    if(file){
      const tmp=file+'.'+crypto.randomUUID()+'.tmp'
      try{fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});fs.writeFileSync(tmp,JSON.stringify(entries),{flag:'wx',mode:0o600});fs.renameSync(tmp,file)}
      catch{try{fs.rmSync(tmp,{force:true})}catch{}}
    }
  }
  return {remember,list:()=>entries.slice().reverse()}
}
function createAcpBridge(deps = {}) {
  const agents = deps.agents || AGENTS
  const now = deps.now || (() => Date.now())
  const phoneMcp = deps.phoneMcp || detectPhoneMcp
  const sessions = new Map()
  const inbox = createInbox(deps.inboxFile,now)
  const catalog = createSessionCatalog(deps.catalogFile,now)
  const push = deps.push || {enabled:false,send:()=>{}}
  const notify=(category,session)=>{ const item=inbox.record(category,session); try{push.send(item)}catch{} }
  let detected = { at: 0, ids: new Set() }

  function installedIds() {
    if (now() - detected.at < DETECT_TTL_MS) return detected.ids
    const ids = new Set()
    const check = deps.detect || ((agent) => onPath(agent.bin) && (agent.cmd === agent.bin || onPath(agent.cmd)))
    for (const agent of agents) { try { if (check(agent)) ids.add(agent.id) } catch { /* not installed */ } }
    detected = { at: now(), ids }
    return ids
  }

  const send = (res, code, body) => {
    const text = JSON.stringify(body)
    res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' })
    res.end(text)
  }

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []
      let size = 0
      req.on('data', (chunk) => {
        size += chunk.length
        if (size > limit) { reject(Object.assign(new Error('body too large'), { code: 413 })); req.destroy(); return }
        chunks.push(chunk)
      })
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { reject(Object.assign(new Error('not JSON'), { code: 400 })) } })
      req.on('error', (e) => reject(e))
    })
  }

  // ----- one running agent -----

  function frame(entry) {
    return `id: ${entry.seq}\n${entry.kind === 'sent' ? 'event: sent\n' : ''}data: ${entry.text}\n\n`
  }

  function add(session, kind, text, reqKey) {
    const entry = { seq: session.nextSeq++, kind, text, reqKey: reqKey || null }
    session.log.push(entry)
    session.bytes += text.length
    while (session.log.length > MAX_LOG_MESSAGES || session.bytes > MAX_LOG_BYTES) session.bytes -= session.log.shift().text.length
    session.lastActivity = now()
    for (const client of session.clients) {
      // Do not buffer an unbounded transcript for a stalled mobile client.
      if (client.writableLength > 1024*1024) { session.clients.delete(client); client.destroy(); continue }
      client.write(frame(entry))
    }
  }

  /** An agent's request the phone already answered is not worth showing again after a reconnect. */
  const stale = (session, entry) => entry.reqKey !== null && session.answered.has(entry.reqKey)

  function onLine(session, line) {
    const text = line.trim()
    if (!text) return
    let message
    try { message = JSON.parse(text) } catch { message = null }
    if (!message || typeof message !== 'object' || Array.isArray(message)) {
      session.stderr = (session.stderr + text + '\n').slice(-STDERR_TAIL_BYTES) // stray output: keep it for diagnosis
      return
    }
    const isRequest = typeof message.method === 'string' && message.id !== undefined && message.id !== null
    add(session, 'out', text, isRequest ? keyOf(message.id) : null)
    if(isRequest){
      const key=keyOf(message.id)
      session.pending.add(key);session.answered.delete(key)
      if(message.method==='session/request_permission')notify('permissions',session)
    }
    if(!message.method&&message.id!==undefined){
      const key=keyOf(message.id),request=session.requests.get(key)
      session.requests.delete(key)
      if(request&&!message.error){
        if(request.method==='initialize')session.loadSession=message.result?.agentCapabilities?.loadSession===true
        if(request.method==='session/new'||request.method==='session/load'){
          const id=request.method==='session/load'?request.sessionId:message.result?.sessionId
          if(typeof id==='string'&&id.length>0&&id.length<=512){session.protocolSessionId=id;catalog.remember(session)}
        }
        if(request.method==='session/prompt'&&session.protocolSessionId)catalog.remember(session)
      }
    }
    if(!message.method&&message.id!==undefined&&session.prompts.has(keyOf(message.id))){
      session.prompts.delete(keyOf(message.id))
      if(message.error)notify('errors',session)
      else if(message.result?.stopReason==='end_turn')notify('completed',session)
    }
  }

  function start(agent, cwd) {
    const env={...process.env,NO_COLOR:'1'}
    // Host-owned push credentials aren't needed by child agents.
    delete env.AGENTLINK_FCM_SERVICE_ACCOUNT;delete env.AGENTLINK_FCM_TOKEN
    const options = { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env }
    const child = WIN && !agent.direct ? spawn('cmd.exe', ['/c', agent.cmd, ...agent.args], options) : spawn(agent.cmd, agent.args, options)
    const session = {
      id: crypto.randomBytes(9).toString('base64url'), agent: agent.id, name: agent.name, cwd, startedAt: now(), lastActivity: now(),
      child, prompts: new Set(), pending: new Set(), requests: new Map(), sentIds: new Map(), protocolSessionId: null, loadSession: false, log: [], bytes: 0, nextSeq: 1, clients: new Set(), answered: new Set(), stderr: '', exited: null,
    }
    let partial = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      partial += chunk
      let at
      while ((at = partial.indexOf('\n')) >= 0) { onLine(session, partial.slice(0, at)); partial = partial.slice(at + 1) }
      if (partial.length > MAX_LINE_BYTES) { partial = ''; killTree(child) }
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => { session.stderr = (session.stderr + chunk).slice(-STDERR_TAIL_BYTES) })
    child.stdin.on('error', () => { /* the agent is gone: the exit handler reports it */ })
    child.on('error', (error) => { session.stderr = (session.stderr + String(error.message || error)).slice(-STDERR_TAIL_BYTES) })
    child.on('close', (code, signal) => {
      if (partial.trim()) onLine(session, partial)
      session.exited = { code, signal, stderr: session.stderr, at: now() }
      if(code!==0&&code!==null)notify('errors',session)
      const text = `event: exit\ndata: ${JSON.stringify({ code, signal, stderr: session.stderr })}\n\n`
      for (const client of session.clients) { client.write(text); client.end() }
      session.clients.clear()
    })
    sessions.set(session.id, session)
    return session
  }

  // ----- routes -----

  function agentsRoute(res) {
    const installed = installedIds()
    send(res, 200, {
      ok: true,
      agents: agents.map((a) => ({ id: a.id, name: a.name, installed: installed.has(a.id) })),
      running: [...sessions.values()].map((s) => ({ id: s.id, agent: s.agent, name: s.name, cwd: s.cwd, startedAt: s.startedAt, exited: !!s.exited })),
    })
  }

  async function startRoute(req, res) {
    const body = await readBody(req, MAX_START_BYTES)
    const agent = agents.find((a) => a.id === (body && body.agent))
    if (!agent) return send(res, 400, { ok: false, error: 'unknown agent' })
    if (!installedIds().has(agent.id)) return send(res, 404, { ok: false, error: `${agent.name} is not installed on this computer` })
    let cwd = os.homedir()
    if (body.cwd !== undefined && body.cwd !== null && body.cwd !== '') {
      if (typeof body.cwd !== 'string' || !path.isAbsolute(body.cwd)) return send(res, 400, { ok: false, error: 'the folder must be an absolute path' })
      try { if (!fs.statSync(body.cwd).isDirectory()) throw new Error('not a folder') } catch { return send(res, 400, { ok: false, error: 'that folder does not exist on the computer' }) }
      cwd = path.resolve(body.cwd)
    }
    if ([...sessions.values()].filter((s) => !s.exited).length >= MAX_RUNNING) return send(res, 429, { ok: false, error: `at most ${MAX_RUNNING} agents at once: stop one first` })
    const session = start(agent, cwd)
    send(res, 200, { ok: true, id: session.id, agent: agent.id, name: agent.name, cwd })
  }

  function eventsRoute(req, res, session, query) {
    const fromHeader = Number(req.headers['last-event-id'])
    const from = Math.max(1, Number.isInteger(Number(query.get('from'))) && query.get('from') ? Number(query.get('from')) : Number.isInteger(fromHeader) && fromHeader > 0 ? fromHeader + 1 : 1)
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    if (res.socket) { res.socket.setNoDelay(true); res.socket.setTimeout(0) }
    const first = session.log.length ? session.log[0].seq : session.nextSeq
    if (from < first) res.write(`event: gap\ndata: ${JSON.stringify({ firstSeq: first })}\n\n`)
    for (const entry of session.log) if (entry.seq >= from && !stale(session, entry)) res.write(frame(entry))
    res.write('event: live\ndata: {}\n\n')
    if (session.exited) {
      res.write(`event: exit\ndata: ${JSON.stringify({ code: session.exited.code, signal: session.exited.signal, stderr: session.exited.stderr })}\n\n`)
      return res.end()
    }
    session.clients.add(res)
    const beat = setInterval(() => { try { res.write(': hb\n\n') } catch { /* closed */ } }, HEARTBEAT_MS)
    req.on('close', () => { clearInterval(beat); session.clients.delete(res); session.lastActivity = now() })
  }

  async function sendRoute(req, res, session) {
    if (session.exited) return send(res, 409, { ok: false, error: 'the agent has stopped' })
    const message = await readBody(req, MAX_SEND_BYTES)
    const isRequest = message && message.jsonrpc === '2.0' && typeof message.method === 'string'
    const isResponse = message && message.jsonrpc === '2.0' && message.id !== undefined && message.id !== null && typeof message.method !== 'string' && ('result' in message || 'error' in message)
    if (!isRequest && !isResponse) return send(res, 400, { ok: false, error: 'not a JSON-RPC message' })
    const text = JSON.stringify(message)
    const key=message.id===undefined||message.id===null?null:keyOf(message.id)
    if(key!==null && (typeof message.id!=='string'&&typeof message.id!=='number'||key.length>512))return send(res,400,{ok:false,error:'invalid RPC id'})
    if(isResponse){
      if(session.answered.has(key))return send(res,200,{ok:true,duplicate:true})
      if(!session.pending.has(key))return send(res,409,{ok:false,error:'request no longer pending'})
    }else if(key!==null){
      const hash=crypto.createHash('sha256').update(text).digest('hex')
      if(session.sentIds.has(key))return send(res,session.sentIds.get(key)===hash?200:409,session.sentIds.get(key)===hash?{ok:true,duplicate:true}:{ok:false,error:'RPC id already used'})
      if(session.sentIds.size>=20000)return send(res,409,{ok:false,error:'session request limit reached; resume in a new agent'})
      session.sentIds.set(key,hash)
      session.requests.set(key,{method:message.method,sessionId:message.method==='session/load'?message.params?.sessionId:undefined})
    }
    if (isResponse) {session.answered.add(key);session.pending.delete(key)}
    if(message.method==='session/prompt'&&key!==null)session.prompts.add(key)
    // The agent gets the phone's MCP server on session/new|load; the replay log keeps what the phone sent.
    add(session, 'sent', text)
    session.child.stdin.write(JSON.stringify(withPhoneMcp(message, phoneMcp())) + '\n')
    send(res, 200, { ok: true, seq: session.nextSeq - 1 })
  }

  /** Returns true when the route is ours (the launcher has already checked the password). */
  async function handle(req, res, route) {
    const url = new URL(req.url || '/', 'http://x')
    try {
      if (route === '/acp/saved' && req.method === 'GET') return send(res,200,{ok:true,sessions:catalog.list()}),true
      if (route === '/acp/inbox' && req.method === 'GET') return send(res,200,{ok:true,events:inbox.list(),pushConfigured:push.enabled}),true
      if (route === '/acp/agents' && req.method === 'GET') return agentsRoute(res), true
      if (route === '/acp/start' && req.method === 'POST') return await startRoute(req, res), true
      const m = /^\/acp\/([A-Za-z0-9_-]{6,32})\/(events|send|stop)$/.exec(route)
      if (!m) return send(res, 404, { ok: false, error: 'not found' }), true
      const session = sessions.get(m[1])
      if (!session) return send(res, 404, { ok: false, error: 'no such agent (it may have been stopped)' }), true
      if (m[2] === 'events' && req.method === 'GET') return eventsRoute(req, res, session, url.searchParams), true
      if (m[2] === 'send' && req.method === 'POST') return await sendRoute(req, res, session), true
      if (m[2] === 'stop' && req.method === 'POST') { killTree(session.child); return send(res, 200, { ok: true }), true }
      send(res, 405, { ok: false, error: 'wrong method' })
    } catch (error) {
      if (!res.headersSent) send(res, Number(error && error.code) >= 400 && Number(error.code) < 600 ? Number(error.code) : 500, { ok: false, error: String(error && error.message ? error.message : error) })
    }
    return true
  }

  // Idle agents with nobody attached are stopped; finished ones are forgotten after a while.
  const sweep = setInterval(() => {
    for (const [id, s] of sessions) {
      if (s.exited) { if (now() - s.exited.at > EXITED_KEEP_MS) sessions.delete(id) }
      else if (s.clients.size === 0 && s.prompts.size === 0 && s.pending.size === 0 && now() - s.lastActivity > IDLE_STOP_MS) killTree(s.child)
    }
  }, SWEEP_MS)
  sweep.unref()

  return {
    handle,
    list: () => [...sessions.values()],
    stopAll() { clearInterval(sweep); for (const s of sessions.values()) killTree(s.child) },
  }
}

module.exports = { createSessionCatalog, createInbox, createPushSender, createAcpBridge, AGENTS, onPath, withPhoneMcp }
