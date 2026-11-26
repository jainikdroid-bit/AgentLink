// Inspired by multi-machine attention centers; implementation is local to AgentLink.
export interface AttentionRun { id:string;agent:string;name:string;cwd:string;exited:boolean;busy?:boolean;pendingPermissions?:number;lastActivity?:number;startedAt:number }
export interface AttentionHost {id:string;error?:string;running?:AttentionRun[]}
export function attentionRows(hosts:AttentionHost[]){
 return hosts.flatMap(host=>host.error?[]:(host.running||[]).filter(run=>!run.exited).map(run=>({
  connectionId:host.id,run,kind:(run.pendingPermissions??0)>0?"approval":run.busy?"busy":run.busy===false?"idle":"unknown"
 } as const))).sort((a,b)=>{
 const rank={approval:0,busy:1,idle:2,unknown:3}
 return rank[a.kind]-rank[b.kind]||(b.run.lastActivity??b.run.startedAt)-(a.run.lastActivity??a.run.startedAt)
 })
}
