import {test} from "node:test"
import assert from "node:assert/strict"
import {sameEndpoint,endpointChanged,clearOldRoute} from "./connection-identity.ts"
test("reuse only on same endpoint",()=>{
 assert.ok(sameEndpoint(" http://host:4096/ ","http://host:4096"))
 for(const url of ["https://host:4096","http://host:4097","http://other:4096","http://host:4096/api"])assert.ok(endpointChanged({url:"http://host:4096"},{url}))
})
test("changing server removes stale route and probe",()=>{
 const previous={url:"http://old",api:"v2",serverVersion:"1",lanHost:"192.168.1.1",launcherPort:4095,tunnelTopic:"old",lastConnected:1,directory:"/old",username:"old"}
 const result=clearOldRoute(previous,{url:"http://new"})
 assert.equal(result.url,"http://new")
 for(const key of ["api","serverVersion","lanHost","launcherPort","tunnelTopic","lastConnected","directory","username"] as const)assert.equal(result[key],undefined)
 assert.deepEqual(clearOldRoute(previous,{url:"http://old/"}),{...previous,url:"http://old/"})
})
