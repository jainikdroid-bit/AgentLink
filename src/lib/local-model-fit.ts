// Conservative screening, not a promise that a model will load.
// Requires actual file size and available device memory; KV/compute overhead
// must be estimated from GGUF architecture and requested context separately.
export interface ModelFitInput { fileBytes:number; availableRamBytes:number; freeStorageBytes:number; estimatedRuntimeExtraBytes?:number; reserveBytes?:number }
export type ModelFit = {status:"unknown"|"fits-estimate"|"tight"|"too-large"; reason:"missing"|"storage"|"memory"|"headroom"|"estimate"}
export function screenModelFit(input:ModelFitInput):ModelFit {
 const {fileBytes,availableRamBytes,freeStorageBytes,estimatedRuntimeExtraBytes,reserveBytes=768*1024**2}=input
 if(![fileBytes,availableRamBytes,freeStorageBytes,reserveBytes].every(x=>Number.isFinite(x)&&x>=0)||fileBytes<=0)return {status:"unknown",reason:"missing"}
 if(freeStorageBytes<fileBytes+reserveBytes)return {status:"too-large",reason:"storage"}
 if(availableRamBytes<fileBytes+reserveBytes)return {status:"too-large",reason:"memory"}
 if(estimatedRuntimeExtraBytes===undefined||!Number.isFinite(estimatedRuntimeExtraBytes)||estimatedRuntimeExtraBytes<0)return {status:"unknown",reason:"missing"}
 const required=fileBytes+estimatedRuntimeExtraBytes+reserveBytes
 if(required>availableRamBytes)return {status:"too-large",reason:"memory"}
 if(required>availableRamBytes*.8)return {status:"tight",reason:"headroom"}
 return {status:"fits-estimate",reason:"estimate"}
}
