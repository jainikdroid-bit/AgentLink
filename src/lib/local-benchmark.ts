export type LocalPreset="eco"|"balanced"|"quality"
export function localPreset(preset:LocalPreset,cores:number,availableRamBytes:number){
 const usable=Number.isFinite(cores)?Math.max(1,Math.floor(cores)):1
 const ram=Number.isFinite(availableRamBytes)?availableRamBytes:0
 const context=preset==="eco"?1024:preset==="quality"&&ram>=6*1024**3?4096:2048
 return {context,threads:Math.min(usable,preset==="eco"?2:preset==="quality"?6:4),limit:preset==="eco"?128:256}
}
export interface LocalBenchmark {model:string;hash:string;at:number;soc:string;context:number;threads:number;promptPerSecond:number|null;generationPerSecond:number|null;elapsedMs:number}
export function validBenchmark(value:unknown):value is LocalBenchmark{
 if(!value||typeof value!=="object")return false
 const b=value as LocalBenchmark
 const rate=(v:unknown)=>v===null||typeof v==="number"&&Number.isFinite(v)&&v>=0
 return typeof b.model==="string"&&typeof b.hash==="string"&&/^[a-f0-9]{64}$/i.test(b.hash)&&typeof b.soc==="string"&&Number.isFinite(b.at)&&[1024,2048,4096].includes(b.context)&&Number.isInteger(b.threads)&&b.threads>=1&&b.threads<=8&&Number.isFinite(b.elapsedMs)&&b.elapsedMs>=0&&rate(b.promptPerSecond)&&rate(b.generationPerSecond)
}
export function appendBenchmark(history:LocalBenchmark[],value:LocalBenchmark){return validBenchmark(value)?[value,...history].slice(0,50):history}
export const BENCHMARK_PROMPT="Explain the difference between a stack and a queue in programming. Give two examples of each, and explain when to use them."
