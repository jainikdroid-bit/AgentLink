// Original, offline, procedural 3D companions. No remote assets or VRM dependencies.
// The floating host uses the same mood/play/walk bridge as Cheri. Native touches remain in CheriTouch.
import * as THREE from "three"
const canvas = document.getElementById("c") as HTMLCanvasElement
const kind = (window as any).__companionKind === "orbit" ? "orbit" : "byte"
const fox = kind === "byte"
const post = (data: object) => (window as any).ReactNativeWebView?.postMessage(JSON.stringify(data))
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.8))
renderer.setClearColor(0, 0)
renderer.outputColorSpace = THREE.SRGBColorSpace
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(35, 1, .1, 30)
camera.position.set(0, 1.03, 4.8)
camera.lookAt(0, 1.02, 0)
scene.add(new THREE.HemisphereLight(0xffffff, 0x555174, 2.5))
const key = new THREE.DirectionalLight(0xffeadc, 3); key.position.set(3, 5, 5); scene.add(key)
const rim = new THREE.DirectionalLight(0x92c9ff, 2); rim.position.set(-3, 2, -3); scene.add(rim)
const root = new THREE.Group(); scene.add(root)
const mat = (c: number, metalness=0, roughness=.65) => new THREE.MeshStandardMaterial({color:c,metalness,roughness})
const base = mat(fox ? 0xe98a48 : 0x9a94e9, fox ? 0 : .25)
const cream = mat(fox ? 0xffe2b6 : 0xe4e1ff)
const dark = mat(fox ? 0x543047 : 0x25253e, .05)
const clothes = mat(fox ? 0x456d73 : 0x53538d, .15)
const blush = mat(0xf2a6ac)
const glow = new THREE.MeshStandardMaterial({color:0x93e4ff,emissive:0x93e4ff,emissiveIntensity:.45,roughness:.35})
function ell(p: THREE.Object3D, m: THREE.Material, x:number,y:number,z:number, sx:number,sy:number,sz:number){
  const o = new THREE.Mesh(new THREE.SphereGeometry(1,24,16),m); o.position.set(x,y,z); o.scale.set(sx,sy,sz); p.add(o); return o
}
function cone(p:THREE.Object3D,m:THREE.Material,x:number,y:number,z:number,r:number,h:number,angle:number){
  const o=new THREE.Mesh(new THREE.ConeGeometry(r,h,24),m);o.position.set(x,y,z);o.rotation.z=angle;p.add(o);return o
}
function pivot(p:THREE.Object3D,x:number,y:number,z:number){ const g=new THREE.Group();g.position.set(x,y,z);p.add(g);return g }
const hips=pivot(root,0,.59,0)
ell(hips,clothes,0,.18,0,.255,.32,.18)
ell(hips,cream,0,.21,.13,.16,.20,.085)
const arms=[-1,1].map(side=>{const g=pivot(hips,side*.25,.36,0);ell(g,base,0,-.16,0,.085,.20,.09);ell(g,cream,0,-.34,.015,.09,.09,.10);return g})
const legs=[-1,1].map(side=>{const g=pivot(hips,side*.115,-.08,0);ell(g,clothes,0,-.19,0,.092,.24,.10);ell(g,base,0,-.40,.06,.13,.10,.16);return g})
const head=pivot(root,0,1.28,0)
ell(head,base,0,.13,0,.37,.36,.30)
const eyes: THREE.Mesh[]=[]
if(fox){
  for(const side of [-1,1]){
    cone(head,base,side*.25,.46,-.02,.14,.35,-side*.25)
    cone(head,blush,side*.25,.47,.075,.08,.22,-side*.25)
    ell(head,cream,side*.105,.015,.23,.19,.13,.10)
    eyes.push(ell(head,dark,side*.125,.16,.275,.044,.065,.023))
    ell(head,blush,side*.235,.07,.252,.052,.025,.017)
  }
  ell(head,dark,0,.025,.333,.045,.034,.035)
}else{
  ell(head,dark,0,.13,.22,.31,.22,.12)
  for(const side of [-1,1]){
    eyes.push(ell(head,glow,side*.115,.16,.333,.047,.063,.02))
    ell(head,clothes,side*.365,.13,0,.075,.15,.12)
  }
  ell(head,glow,0,.51,0,.055,.055,.055)
  cone(head,clothes,0,.425,0,.04,.14,0)
}
const mouth=ell(head,fox?dark:glow,0,-.065,.29,.052,.018,.02)
const tail=pivot(root,.16,.62,-.13)
if(fox){const t=ell(tail,base,.23,.19,-.09,.15,.39,.14);t.rotation.z=-.65;const tip=ell(tail,cream,.40,.40,-.09,.12,.17,.13);tip.rotation.z=-.65}
else{for(const side of [-1,1])ell(tail,glow,side*.22,-.17,-.03,.055,.08,.055)}
const ring=new THREE.Mesh(new THREE.TorusGeometry(.39,.012,10,64),glow);ring.rotation.x=Math.PI/2;ring.position.y=.12;root.add(ring)
const tablet=pivot(root,0,.77,.34)
const panel=new THREE.Mesh(new THREE.BoxGeometry(.36,.24,.035),dark);tablet.add(panel)
for(let i=0;i<3;i++){const bar=new THREE.Mesh(new THREE.BoxGeometry(.22-i*.03,.012,.012),glow);bar.position.set(0,.06-i*.055,.022);tablet.add(bar)}
const spark=pivot(root,.43,1.88,0);ell(spark,glow,0,0,0,.043,.085,.043);ell(spark,glow,0,0,0,.085,.043,.043)
// Additional props: a tool for work, a message tablet for writing, and a visible error marker.
const tool=pivot(root,0,.88,.37)
if(fox){
  const keyboard=new THREE.Mesh(new THREE.BoxGeometry(.43,.055,.22),dark);tool.add(keyboard)
  for(let row=0;row<2;row++)for(let col=0;col<5;col++){
    const k=new THREE.Mesh(new THREE.BoxGeometry(.047,.018,.05),cream);k.position.set((col-2)*.07,.035,(row-.5)*.08);tool.add(k)
  }
}else{
  const gear=new THREE.Mesh(new THREE.TorusGeometry(.105,.035,10,24),glow);tool.add(gear)
  for(let i=0;i<8;i++){
    const tooth=new THREE.Mesh(new THREE.BoxGeometry(.055,.075,.05),clothes)
    const a=i*Math.PI/4;tooth.position.set(Math.sin(a)*.13,Math.cos(a)*.13,0);tooth.rotation.z=-a;tool.add(tooth)
  }
}
const errorMark=pivot(root,.35,1.86,0)
ell(errorMark,glow,0,.035,0,.035,.085,.028)
ell(errorMark,glow,0,-.08,0,.028,.028,.028)
const moods=["idle","thinking","working","writing","loading","success","error","offline"]
const colors:Record<string,number>={idle:0x93e4ff,thinking:0xffc36c,working:0x79eaff,writing:0x8eecc5,loading:0xc2aeff,success:0x68ef9e,error:0xff7188,offline:0x9ba1b3}
let mood="idle", walkDir=0, walkAt=0, playUntil=0, previousFrame=-1
function setMood(m:string){
 if(!moods.includes(m))return
 if(m!==mood){playUntil=0}
 mood=m
 if(m!=="idle"){walkDir=0;walkAt=0}
 glow.color.setHex(colors[mood]);glow.emissive.setHex(colors[mood])
}
function play(_id:string){if(mood==="idle")playUntil=performance.now()+1000}
function walk(dir:number,startAt?:number){
 if(!Number.isFinite(dir)||dir===0||mood!=="idle"){walkDir=0;walkAt=0;return}
 walkDir=Math.sign(dir);walkAt=typeof startAt==="number"&&Number.isFinite(startAt)?startAt:Date.now()
}
;(window as any).cheri={setMood,play,tap:()=>play("tap"),pet:()=>play("pet"),walk,debug:{}}
function resize(){
 const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight)
 renderer.setSize(w,h,false);camera.aspect=w/h
 // Fit extended arms and tail even in the tall/narrow native avatar window.
 const vfov=35*Math.PI/180
 camera.position.z=Math.max(4.8, .82/(Math.tan(vfov/2)*camera.aspect)+.6)
 camera.updateProjectionMatrix()
}
window.addEventListener("resize",resize);resize()
function frame(now:number){
 requestAnimationFrame(frame)
 const dt=previousFrame<0?1/60:Math.max(0,Math.min(.1,(now-previousFrame)/1000))
 previousFrame=now
 const smooth=(a:number,b:number)=>a+(b-a)*(1-Math.exp(-dt*14))
 const t=now/1000, walking=mood==="idle"&&walkDir!==0&&Date.now()>=walkAt, playful=mood==="idle"&&now<playUntil
 const sleeping=mood==="offline", working=mood==="working", writing=mood==="writing", busy=working||writing, success=mood==="success", error=mood==="error", thinking=mood==="thinking"
 const pace=walking?Math.sin(t*10):Math.sin(t*(working?8:writing?5:2.3))
 root.position.y=smooth(root.position.y,sleeping?-.035:Math.abs(pace)*(walking?.045:success?.09:fox?.025:.045))
 root.rotation.y=smooth(root.rotation.y,walking?walkDir*.85:thinking&&!fox?Math.sin(t*2.2)*.27:Math.sin(t*.8)*.10)
 hips.rotation.z=smooth(hips.rotation.z,sleeping?-.10:Math.sin(t*1.5)*.035)
 head.rotation.z=smooth(head.rotation.z,sleeping?-.22:error?-.16:thinking?(fox?.23:Math.sin(t*2)*.12):playful?Math.sin(t*11)*.14:Math.sin(t*1.6)*.045)
 head.rotation.x=smooth(head.rotation.x,sleeping?.22:error?.20:busy?.09:0)
 for(let i=0;i<2;i++){
  const side=i===0?-1:1
  legs[i].rotation.x=smooth(legs[i].rotation.x,walking?side*pace*.48:0)
  arms[i].rotation.z=smooth(arms[i].rotation.z,success?side*(1.6+Math.sin(t*(fox?8:5))*.18):thinking&&fox&&i===1?.65:busy?side*.25:side*.12)
  arms[i].rotation.x=smooth(arms[i].rotation.x,walking?-side*pace*.45:working?-.95+Math.sin(t*11+i)*.16:writing?-.72+Math.sin(t*5+i)*.08:thinking&&fox&&i===1?-1.45:0)
  eyes[i].scale.y=smooth(eyes[i].scale.y,sleeping?.009:error?.032:(t%4.7>.0&&t%4.7<.14?.008:.065))
 }
 mouth.scale.y=smooth(mouth.scale.y,error?.045:success||playful?.035:.018)
 tail.rotation.y=smooth(tail.rotation.y,sleeping?0:Math.sin(t*(working?5:success?8:2.2))*(fox?.4:.18))
 ring.visible=mood==="loading";ring.rotation.z=t*3;ring.scale.setScalar(1+Math.sin(t*4)*.08)
 tablet.visible=writing;tablet.rotation.x=-.18
 tool.visible=working;tool.rotation.z=fox?0:t*2
 spark.visible=thinking||success||playful;spark.rotation.z=t*1.5;spark.scale.setScalar(.8+Math.sin(t*5)*.25)
 errorMark.visible=error
 renderer.render(scene,camera)
}
requestAnimationFrame(frame);post({type:"ready"})
