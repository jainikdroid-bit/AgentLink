import {test} from "node:test"
import assert from "node:assert/strict"
import {attentionRows} from "./attention.ts"
const run={id:"same",agent:"test",name:"Test",cwd:"/w",exited:false,startedAt:10}
test("approval first, host identities distinct, offline and exited omitted",()=>{
 const rows=attentionRows([{id:"a",running:[{...run,busy:true}]},{id:"b",running:[{...run,pendingPermissions:1}]},{id:"c",error:"offline",running:[run]},{id:"d",running:[{...run,exited:true}]},{id:"e",running:[run]}])
 assert.deepEqual(rows.map(r=>[r.connectionId,r.kind]),[["b","approval"],["a","busy"],["e","unknown"]])
})
