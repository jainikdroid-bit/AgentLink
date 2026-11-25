import {test} from "node:test"
import assert from "node:assert/strict"
import {ollamaRates,llamaRates,contextUsage,quotaFromReport} from "./model-metrics.ts"
test("Ollama durations are nanoseconds",()=>assert.deepEqual(ollamaRates({eval_count:100,eval_duration:2e9,prompt_eval_count:200,prompt_eval_duration:1e9}),{generationPerSecond:50,promptPerSecond:200}))
test("llama.cpp durations are milliseconds",()=>assert.deepEqual(llamaRates({timings:{predicted_n:90,predicted_ms:3000,prompt_per_second:120}}),{generationPerSecond:30,promptPerSecond:120}))
test("missing metrics remain unknown",()=>{assert.equal(ollamaRates({eval_count:10,eval_duration:0}).generationPerSecond,null);assert.equal(llamaRates({}).generationPerSecond,null);assert.equal(contextUsage(5,0),null);assert.deepEqual(quotaFromReport(undefined,100),{kind:"unknown"})})
test("context and real quota are distinct",()=>{assert.equal(contextUsage(20,100),.2);assert.deepEqual(quotaFromReport(10,100,123),{kind:"reported",remaining:10,limit:100,resetAt:123});assert.deepEqual(quotaFromReport(200,100),{kind:"unknown"})})
