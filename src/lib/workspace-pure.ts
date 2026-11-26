export function parseGitStatus(raw:string):{status:string;path:string;original?:string}[]{
 const rows=raw.split("\0"),out:{status:string;path:string;original?:string}[]=[]
 for(let i=0;i<rows.length;i++){
  const row=rows[i]
  if(!row||row.startsWith("##")||row.length<4)continue
  const status=row.slice(0,2),path=row.slice(3)
  const original=/[RC]/.test(status)?rows[++i]:undefined
  if(path)out.push({status,path,...(original?{original}:{})})
 }
 return out
}
// Only preview a private address of an already paired host; never send AgentLink credentials.
export function previewAddress(server:string,port:number):string|null{
 if(!Number.isInteger(port)||port<1024||port>65535)return null
 try{
  const u=new URL(server),parts=u.hostname.split(".").map(Number)
  if(!["http:","https:"].includes(u.protocol)||u.username||u.password||parts.length!==4||parts.some(n=>!Number.isInteger(n)||n<0||n>255))return null
  const [a,b]=parts
  if(!(a===10||a===192&&b===168||a===172&&b>=16&&b<=31||a===100&&b>=64&&b<=127))return null
  return "http://"+u.hostname+":"+port+"/"
 }catch{return null}
}
export type HighlightToken={text:string;kind:"keyword"|"string"|"comment"|"number"|"plain"}
export function highlightLine(line:string):HighlightToken[]{
 // Lightweight lexical preview, not a parser; preserve every character.
 const re=/(\/\/.*|#.*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|function|return|if|else|for|while|class|import|export|from|def|async|await|try|catch|new|true|false|null|None|public|private|interface|type)\b|\b\d+(?:\.\d+)?\b)/g
 let last=0;const tokens:HighlightToken[]=[]
 for(const m of line.matchAll(re)){
  const at=m.index!,text=m[0]
  if(at>last)tokens.push({text:line.slice(last,at),kind:"plain"})
  tokens.push({text,kind:text.startsWith("//")||text.startsWith("#")?"comment":/^[`"']/.test(text)?"string":/^\d/.test(text)?"number":"keyword"});last=at+text.length
 }
 if(last<line.length)tokens.push({text:line.slice(last),kind:"plain"})
 return tokens
}

/** For a trusted development server only: restrict top-level navigation to its origin. */
export function previewNavigationAllowed(initial:string,next:string):boolean{
 try{
  const a=new URL(initial),b=new URL(next)
  return ["http:","https:"].includes(a.protocol)&&!a.username&&!a.password&&!b.username&&!b.password&&a.origin===b.origin
 }catch{return false}
}
