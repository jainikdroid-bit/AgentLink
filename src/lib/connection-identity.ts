// Do not reuse credentials or discovered routes across different endpoints.
// Deliberately conservative: only trim whitespace and trailing slash.
export function sameEndpoint(a: string, b: string): boolean {
  return a.trim().replace(/\/+$/, "") === b.trim().replace(/\/+$/, "")
}
export function endpointChanged(previous: {url:string}, updates: {url?:string}): boolean {
  return updates.url !== undefined && !sameEndpoint(previous.url, updates.url)
}
export function clearOldRoute<T extends {url:string; api?:unknown; serverVersion?:string; lanHost?:string; launcherPort?:number; tunnelTopic?:string; lastConnected?:number; directory?:string; username?:string}>(previous:T, updates:Partial<T>):T {
  const merged={...previous,...updates}
  if(!endpointChanged(previous,updates))return merged
  return {...merged,api:undefined,serverVersion:undefined,lanHost:undefined,launcherPort:undefined,tunnelTopic:undefined,lastConnected:undefined,directory:updates.directory,username:updates.username}
}
