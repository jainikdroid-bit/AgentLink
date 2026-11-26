import {test} from "node:test"
import assert from "node:assert/strict"
import {modelFiles,validModel} from "./phone-models.ts"
const sha="a".repeat(64),revision="b".repeat(40),repo="owner/models"
test("only immutable single-file GGUF with a digest",()=>{
 const result=modelFiles(repo,{sha:revision,siblings:[{rfilename:"good.gguf",lfs:{size:100,sha256:sha}},{rfilename:"split-00001-of-00002.gguf",lfs:{size:100,sha256:sha}},{rfilename:"../evil.gguf",lfs:{size:100,sha256:sha}},{rfilename:"unverified.gguf",size:100},null]})
 assert.equal(result.length,1);assert.equal(result[0].file,"good.gguf")
 assert.equal(validModel(null),false)
 assert.equal(validModel({...result[0],revision:"main"}),false)
 assert.deepEqual(modelFiles(repo,{sha:revision,gated:"manual",siblings:[]}),[])
})
