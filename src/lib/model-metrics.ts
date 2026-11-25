// Use provider-reported counters; do not confuse context usage, token rate and quota.
export type TokenRates = { promptPerSecond: number | null; generationPerSecond: number | null }
function finite(value:unknown): value is number { return typeof value==="number" && Number.isFinite(value) && value>=0 }
function rate(tokens:unknown, duration:unknown, scale:number):number|null {
 return finite(tokens)&&finite(duration)&&duration>0 ? tokens*scale/duration : null
}
export function ollamaRates(data:{prompt_eval_count?:unknown;prompt_eval_duration?:unknown;eval_count?:unknown;eval_duration?:unknown}):TokenRates {
 return {promptPerSecond:rate(data.prompt_eval_count,data.prompt_eval_duration,1e9),generationPerSecond:rate(data.eval_count,data.eval_duration,1e9)}
}
export function llamaRates(data:{timings?:{prompt_per_second?:unknown;predicted_per_second?:unknown;prompt_n?:unknown;prompt_ms?:unknown;predicted_n?:unknown;predicted_ms?:unknown}}):TokenRates {
 const t=data.timings
 return {promptPerSecond:finite(t?.prompt_per_second)?t.prompt_per_second:rate(t?.prompt_n,t?.prompt_ms,1000),generationPerSecond:finite(t?.predicted_per_second)?t.predicted_per_second:rate(t?.predicted_n,t?.predicted_ms,1000)}
}
export function contextUsage(used:unknown,size:unknown):number|null {return finite(used)&&finite(size)&&size>0?Math.min(1,used/size):null}
export type Quota = {kind:"unknown"} | {kind:"reported";remaining:number;limit:number;resetAt?:number}
export function quotaFromReport(remaining:unknown,limit:unknown,resetAt?:unknown):Quota {
 return finite(remaining)&&finite(limit)&&limit>0&&remaining<=limit?{kind:"reported",remaining,limit,...(finite(resetAt)?{resetAt}:{})}:{kind:"unknown"}
}
