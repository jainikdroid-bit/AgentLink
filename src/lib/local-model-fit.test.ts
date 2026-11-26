import {test} from "node:test"
import assert from "node:assert/strict"
import {screenModelFit} from "./local-model-fit.ts"
const common={fileBytes:4,availableRamBytes:12,freeStorageBytes:20,estimatedRuntimeExtraBytes:2,reserveBytes:1}
test("fit uses current available memory, runtime overhead and storage",()=>{
 assert.equal(screenModelFit(common).status,"fits-estimate")
 assert.equal(screenModelFit({...common,availableRamBytes:8}).status,"tight")
 assert.equal(screenModelFit({...common,availableRamBytes:6}).reason,"memory")
 assert.equal(screenModelFit({...common,freeStorageBytes:4}).reason,"storage")
 assert.equal(screenModelFit({...common,estimatedRuntimeExtraBytes:undefined}).status,"unknown")
})
