// Executes the real scene with a fake Three.js renderer and deterministic clock.
// This is a logic/animation state test, not a WebGL screenshot or Android gesture test.
const { test } = require("node:test")
const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { join } = require("node:path")
const { stripTypeScriptTypes } = require("node:module")
const source = stripTypeScriptTypes(readFileSync(join(__dirname, "../web/companions3d/scene.ts"), "utf8")).replace(/^import .*$/m, "")

class V {
  constructor(){this.x=this.y=this.z=0}
  set(x,y,z){Object.assign(this,{x,y,z})}
  setScalar(n){this.set(n,n,n)}
}
class O {
  constructor(){this.position=new V();this.rotation=new V();this.scale=new V();this.scale.setScalar(1);this.visible=true;this.children=[]}
  add(x){this.children.push(x)}
}
class Mat {
  constructor(opts){this.c=opts.color;this.e=opts.emissive;this.color={setHex:n=>this.c=n};this.emissive={setHex:n=>this.e=n}}
}
class Mesh extends O {constructor(g,m){super();this.material=m}}
class Renderer {setPixelRatio(){} setClearColor(){} setSize(){} render(){}}
class Camera extends O {lookAt(){} updateProjectionMatrix(){}}
const T={WebGLRenderer:Renderer,Scene:O,Group:O,PerspectiveCamera:Camera,HemisphereLight:O,DirectionalLight:O,MeshStandardMaterial:Mat,Mesh,SphereGeometry:class{},ConeGeometry:class{},TorusGeometry:class{},BoxGeometry:class{},SRGBColorSpace:"srgb"}
function boot(kind){
  let clock=10000,tick,resize
  const messages=[]
  const canvas={clientWidth:84,clientHeight:176}
  const w={__companionKind:kind,ReactNativeWebView:{postMessage:s=>messages.push(JSON.parse(s))},addEventListener:(name,fn)=>{if(name==="resize")resize=fn}}
  const model=new Function("THREE","window","document","devicePixelRatio","requestAnimationFrame","performance","Date",source+"\nreturn {root,head,arms,legs,eyes,mouth,tail,ring,tablet,tool,spark,errorMark,glow,camera};")(T,w,{getElementById:()=>canvas},1,f=>tick=f,{now:()=>clock},{now:()=>clock})
  const advance=(n=45)=>{for(let i=0;i<n;i++){clock+=1000/60;tick(clock)}}
  const mood=m=>{w.cheri.setMood(m);advance()}
  advance()
  return {model,api:w.cheri,advance,mood,messages,canvas,resize,now:()=>clock}
}
for(const kind of ["byte","orbit"]){
  test(kind+": ready, eight distinct status colors and expected props",()=>{
    const b=boot(kind),m=b.model,seen=new Set()
    assert.equal(b.messages[0].type,"ready")
    for(const state of ["idle","thinking","working","writing","loading","success","error","offline"]){
      b.mood(state);seen.add(m.glow.c)
      assert.equal(m.tool.visible,state==="working")
      assert.equal(m.tablet.visible,state==="writing")
      assert.equal(m.ring.visible,state==="loading")
      assert.equal(m.errorMark.visible,state==="error")
      assert.equal(m.spark.visible,state==="thinking"||state==="success")
    }
    assert.equal(seen.size,8)
    assert.ok(m.eyes[0].scale.y<.012)
  })
  test(kind+": walk both ways and stop on interruption",()=>{
    const b=boot(kind),m=b.model
    for(const dir of [-1,1]){
      b.mood("idle");b.api.walk(dir,b.now()+1000);b.advance(15)
      assert.ok(Math.abs(m.root.rotation.y)<.15)
      b.advance(90)
      assert.ok(dir*m.root.rotation.y>.6)
      b.mood("offline")
      assert.ok(Math.abs(m.legs[0].rotation.x)<.01)
      assert.ok(Math.abs(m.root.rotation.y)<.15)
      b.api.walk(dir,b.now());b.advance()
      assert.ok(Math.abs(m.root.rotation.y)<.15)
    }
  })
  test(kind+": working/writing/success/error poses are distinguishable",()=>{
    const b=boot(kind),m=b.model
    b.mood("working");const work=m.arms[0].rotation.x
    b.mood("writing");assert.ok(Math.abs(work-m.arms[0].rotation.x)>.07)
    b.mood("success");assert.ok(Math.abs(m.arms[0].rotation.z)>1.3)
    b.mood("error");assert.ok(m.head.rotation.x>.15);assert.ok(m.errorMark.visible)
    b.mood("idle");assert.ok(Math.abs(m.arms[0].rotation.z)<.2);assert.equal(m.errorMark.visible,false)
  })
  test(kind+": rapid transitions, invalid inputs and play cannot override errors",()=>{
    const b=boot(kind),m=b.model
    b.mood("idle");b.api.play("giggle");b.advance(10);assert.equal(m.spark.visible,true)
    b.mood("error");b.api.play("giggle");b.advance(10);assert.equal(m.spark.visible,false)
    const color=m.glow.c;b.api.setMood("invalid");b.api.walk(NaN);b.advance();assert.equal(m.glow.c,color)
    const states=["idle","thinking","working","writing","loading","success","error","offline"]
    for(let i=0;i<1200;i++){
      b.api.setMood(states[i%states.length]);b.advance(1)
      for(const part of [m.root,m.head,...m.arms,...m.legs,...m.eyes,m.mouth,m.tail]){
        for(const v of [part.position,part.rotation,part.scale]){
          assert.ok([v.x,v.y,v.z].every(Number.isFinite))
        }
      }
    }
  })
  test(kind+": camera adjusts to narrow viewport",()=>{
    const b=boot(kind),m=b.model
    const old=m.camera.position.z;b.canvas.clientWidth=50;b.canvas.clientHeight=200;b.resize()
    assert.ok(m.camera.position.z>old)
    assert.equal(m.camera.aspect,.25)
  })
}
