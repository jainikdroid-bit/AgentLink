package tsnetbridge

// Explicit exit-node controls on this app's dedicated tsnet node. This is NOT
// an Android system VPN. Internet sharing requires an approved tailnet route.
import (
 "context"
 "encoding/json"
 "fmt"
 "net/netip"
 "sync"
 "time"

 "tailscale.com/ipn"
 "tailscale.com/tailcfg"
 "tailscale.com/tsnet"
)

var exitMu sync.Mutex
var shareUntil time.Time
var shareTimer *time.Timer
var selectedExit string

func currentExitServer() (*tsnet.Server,error) {
 g.mu.Lock()
 defer g.mu.Unlock()
 if g.srv==nil || !g.ready { return nil,fmt.Errorf("built-in Tailscale is not connected") }
 return g.srv,nil
}

func resetExitPrefs(s *tsnet.Server) error {
 lc,err:=s.LocalClient()
 if err!=nil{return err}
 ctx,cancel:=context.WithTimeout(context.Background(),8*time.Second)
 defer cancel()
 prefs,err:=lc.GetPrefs(ctx)
 if err!=nil{return err}
 prefs.SetAdvertiseExitNode(false)
 // Explicitly remove stale default routes even on a build without advertising support.
 routes:=prefs.AdvertiseRoutes[:0]
 for _,r:=range prefs.AdvertiseRoutes{if r.Bits()!=0{routes=append(routes,r)}}
 prefs.AdvertiseRoutes=routes
 _,err=lc.EditPrefs(ctx,&ipn.MaskedPrefs{
  Prefs:ipn.Prefs{AdvertiseRoutes:prefs.AdvertiseRoutes},
  AdvertiseRoutesSet:true,ExitNodeIDSet:true,ExitNodeIPSet:true,AutoExitNodeSet:true,
 })
 return err
}

// Called before publishing ready=true; never resume an old sharing grant after restart.
func resetExitForStart(s *tsnet.Server) error {
 exitMu.Lock()
 defer exitMu.Unlock()
 g.mu.Lock();same:=g.srv==s;g.mu.Unlock()
 if !same{return fmt.Errorf("node was stopped")}
 if shareTimer!=nil {shareTimer.Stop();shareTimer=nil}
 shareUntil=time.Time{}
 selectedExit=""
 closeModelRelay()
 return resetExitPrefs(s)
}

func ExitInfo() (string,error) {
 exitMu.Lock()
 defer exitMu.Unlock()
 s,err:=currentExitServer()
 if err!=nil{return "",err}
 lc,err:=s.LocalClient();if err!=nil{return "",err}
 ctx,cancel:=context.WithTimeout(context.Background(),8*time.Second);defer cancel()
 st,err:=lc.Status(ctx);if err!=nil{return "",err}
 prefs,err:=lc.GetPrefs(ctx);if err!=nil{return "",err}
 type peer struct {ID string `json:"id"`;Name string `json:"name"`;IP string `json:"ip"`;Online bool `json:"online"`}
 peers:=[]peer{}
 for _,p:=range st.Peer {
  if p==nil||!p.ExitNodeOption{continue}
  ip:="";for _,a:=range p.TailscaleIPs {if a.Is4(){ip=a.String();break}}
  peers=append(peers,peer{string(p.ID),p.HostName,ip,p.Online})
 }
 until:=int64(0);if !shareUntil.IsZero(){until=shareUntil.UnixMilli()}
 online:=false
 if st.ExitNodeStatus!=nil{online=st.ExitNodeStatus.Online}
 raw,err:=json.Marshal(map[string]any{"peers":peers,"selected":string(prefs.ExitNodeID),"online":online,"sharing":prefs.AdvertisesExitNode(),"until":until})
 return string(raw),err
}

// mode=off|receive|share. Sharing expires after one hour; no auto-renewal.
// Only a currently online, approved exit peer may be chosen.
func SetExitMode(mode,id string) error {
 exitMu.Lock()
 defer exitMu.Unlock()
 s,err:=currentExitServer();if err!=nil{return err}
 if mode!="off"&&mode!="receive"&&mode!="share"{return fmt.Errorf("invalid exit mode")}
 lc,err:=s.LocalClient();if err!=nil{return err}
 ctx,cancel:=context.WithTimeout(context.Background(),10*time.Second);defer cancel()
 prefs,err:=lc.GetPrefs(ctx);if err!=nil{return err}
 var chosen tailcfg.StableNodeID
 if mode=="receive" {
  st,err:=lc.Status(ctx);if err!=nil{return err}
  for _,p:=range st.Peer {if p!=nil&&p.Online&&p.ExitNodeOption&&string(p.ID)==id{chosen=p.ID;break}}
  if chosen==""{return fmt.Errorf("exit node not online or approved")}
 }
 prefs.SetAdvertiseExitNode(mode=="share")
 if mode=="share"&&!prefs.AdvertisesExitNode(){return fmt.Errorf("exit node advertisement unsupported in this build")}
 updated,err:=lc.EditPrefs(ctx,&ipn.MaskedPrefs{
  Prefs:ipn.Prefs{AdvertiseRoutes:prefs.AdvertiseRoutes,ExitNodeID:chosen,ExitNodeIP:netip.Addr{},ExitNodeAllowLANAccess:true},
  AdvertiseRoutesSet:true,ExitNodeIDSet:true,ExitNodeIPSet:true,AutoExitNodeSet:true,ExitNodeAllowLANAccessSet:true,
 })
 if err!=nil{return err}
 closeModelRelay()
 selectedExit=string(chosen)
 if shareTimer!=nil {shareTimer.Stop();shareTimer=nil}
 shareUntil=time.Time{}
 if mode=="share"{
  if updated==nil||!updated.AdvertisesExitNode(){return fmt.Errorf("exit route was not applied")}
  shareUntil=time.Now().Add(time.Hour)
  deadline:=shareUntil
  shareTimer=time.AfterFunc(time.Hour,func(){
   exitMu.Lock();defer exitMu.Unlock()
   if !shareUntil.Equal(deadline){return}
   g.mu.Lock();same:=g.srv==s;g.mu.Unlock()
   if same{
    if err:=resetExitPrefs(s);err!=nil{
     // Fail closed: stop serving tailnet routes if withdrawal fails.
     g.mu.Lock();g.ready=false;g.mu.Unlock()
     setErr("exit sharing expired; node stopped")
     _=s.Close()
    }
   }
   shareUntil=time.Time{}
  })
 }
 return nil
}
