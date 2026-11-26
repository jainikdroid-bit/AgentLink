// Public, single-file GGUFs only. No remote code or arbitrary user-provided URL.
export type HfFile={repo:string;revision:string;file:string;bytes:number;sha256:string}
const repoPattern=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/
export function validModel(value:unknown):value is HfFile{
 if(!value||typeof value!=="object")return false
 const m=value as HfFile
 return typeof m.repo==="string"&&typeof m.revision==="string"&&typeof m.file==="string"&&typeof m.sha256==="string"&&repoPattern.test(m.repo)&&/^[a-f0-9]{40}$/i.test(m.revision)&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}\.gguf$/i.test(m.file)&&!/-\d{5}-of-\d{5}\.gguf$/i.test(m.file)&&Number.isSafeInteger(m.bytes)&&m.bytes>0&&/^[a-f0-9]{64}$/i.test(m.sha256)
}
export function modelFiles(repo:string,raw:unknown):HfFile[]{
 if(!repoPattern.test(repo)||!raw||typeof raw!=="object")return []
 const r=raw as {sha?:string;private?:boolean;gated?:boolean|string;siblings?:{rfilename?:string;size?:number;lfs?:{sha256?:string;size?:number}}[]}
 if(r.private||r.gated||!Array.isArray(r.siblings))return []
 return r.siblings.filter(f=>f&&typeof f==="object").map(f=>({repo,revision:r.sha||"",file:f.rfilename||"",bytes:f.lfs?.size??f.size??0,sha256:f.lfs?.sha256||""})).filter(validModel).sort((a,b)=>a.bytes-b.bytes)
}
