import {test} from "node:test"
import assert from "node:assert/strict"
import {parseGitStatus,previewAddress,previewNavigationAllowed,highlightLine} from "./workspace-pure.ts"
test("Git rename and Unicode paths",()=>assert.deepEqual(parseGitStatus("## main\0R  new name.ts\0old.ts\0?? файл.ts\0"),[{status:"R ",path:"new name.ts",original:"old.ts"},{status:"??",path:"файл.ts"}]))
test("preview never accepts arbitrary public host or privileged port",()=>{assert.equal(previewAddress("http://100.92.64.1:4096",3000),"http://100.92.64.1:3000/");for(const u of ["https://example.com","http://169.254.169.254","http://user:pass@192.168.1.1","http://127.0.0.1"])assert.equal(previewAddress(u,3000),null);assert.equal(previewAddress("http://10.0.0.1",80),null)})
test("highlight preserves source exactly",()=>{const line='const x = "42"; // hi';const tokens=highlightLine(line);assert.equal(tokens.map(t=>t.text).join(""),line);assert.equal(tokens[0].kind,"keyword");assert.equal(tokens.at(-1)?.kind,"comment")})

test("embedded preview allows same origin only",()=>{const url="http://127.0.0.1:3000/";assert.equal(previewNavigationAllowed(url,url+"docs"),true);for(const dest of ["https://127.0.0.1:3000","http://127.0.0.1:4096","http://example.com","file:///etc/passwd","http://user:pass@127.0.0.1:3000"])assert.equal(previewNavigationAllowed(url,dest),false)})
