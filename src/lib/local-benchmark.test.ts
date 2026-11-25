import {test} from "node:test"
import assert from "node:assert/strict"
import {localPreset,appendBenchmark,validBenchmark} from "./local-benchmark.ts"
test("profiles use available RAM and never exceed CPU count",()=>{
 assert.deepEqual(localPreset("eco",1,1),{context:1024,threads:1,limit:128})
 assert.equal(localPreset("quality",8,2*1024**3).context,2048)
 assert.equal(localPreset("quality",8,8*1024**3).context,4096)
 assert.equal(localPreset("balanced",3,8*1024**3).threads,3)
})
test("history stays bounded and rejects fictitious or invalid readings",()=>{
 const value={model:"a",hash:"a".repeat(64),at:1,soc:"test",context:2048,threads:2,promptPerSecond:null,generationPerSecond:20,elapsedMs:1000}
 assert.ok(validBenchmark(value));assert.equal(validBenchmark({...value,generationPerSecond:Infinity}),false)
 assert.equal(validBenchmark({...value,promptPerSecond:-1}),false)
 assert.equal(appendBenchmark(Array(50).fill(value),value).length,50)
})
