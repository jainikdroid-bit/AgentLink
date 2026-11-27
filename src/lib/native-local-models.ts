import {NativeModules,Platform} from "react-native"
import type {HfFile} from "./phone-models"
import {validModel} from "./phone-models"
export interface PhoneStats {engine:boolean;availableRamBytes:number;totalRamBytes:number;freeStorageBytes:number;cores:number;abi:string;soc:string;thermal:number}
export interface LocalProgress {busy:boolean;operation:string;bytes:number;total:number;text:string}
type Result={text:string;metrics:string}
export type LocalMessage={role:"user"|"assistant";content:string}
interface LocalNative {
 vaultRead(name:string):Promise<string|null>
 vaultWrite(name:string,value:string):Promise<void>
 vaultRemove(name:string):Promise<void>
 stats():Promise<PhoneStats>
 progress():Promise<LocalProgress>
 cancel():Promise<void>
 download(repo:string,revision:string,name:string,hash:string,size:number):Promise<string>
 remove(hash:string):Promise<void>
 installed(hash:string):Promise<boolean>
 generate(hash:string,prompt:string,context:number,threads:number,limit:number):Promise<Result>
}
function engine():LocalNative {
 const n=Platform.OS==="android"?NativeModules.AgentLinkLocalModels as LocalNative|undefined:undefined
 if(!n)throw Error("Native local-model module is unavailable in this build")
 return n
}
export const phoneStats=async ()=>engine().stats()
export const localProgress=async ()=>engine().progress()
export const cancelLocal=async ()=>engine().cancel()
export const installedModel=async (m:HfFile)=>engine().installed(m.sha256)
export async function downloadModel(m:HfFile){if(!validModel(m))throw Error("Invalid GGUF metadata");return engine().download(m.repo,m.revision,m.file,m.sha256,m.bytes)}
export const removeModel=async (m:HfFile)=>engine().remove(m.sha256)
export async function generateLocal(m:HfFile,prompt:string|LocalMessage[],context:number,threads:number,limit=256){
 if(!validModel(m))throw Error("Invalid GGUF metadata")
 const result=await engine().generate(m.sha256,JSON.stringify(typeof prompt==="string"?[{role:"user",content:prompt}]:prompt),context,threads,limit)
 const raw=JSON.parse(result.metrics)
 const rate=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0?v:null
 return {text:result.text,promptPerSecond:rate(raw.promptPerSecond),generationPerSecond:rate(raw.generationPerSecond),cancelled:raw.cancelled===true}
}

export async function vaultRead<T>(name:string):Promise<T|null>{const data=await engine().vaultRead(name);return data===null?null:JSON.parse(data) as T}
export async function vaultWrite(name:string,value:unknown){await engine().vaultWrite(name,JSON.stringify(value))}
export async function vaultRemove(name:string){await engine().vaultRemove(name)}
