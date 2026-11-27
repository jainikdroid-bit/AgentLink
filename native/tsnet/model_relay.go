package tsnetbridge

// Private, loopback-only relay for model catalog/download requests. The app
// retains its normal checksum and resume checks. This never proxies arbitrary
// URLs or exposes a LAN HTTP proxy.
import (
 "context"
 "crypto/rand"
 "crypto/subtle"
 "encoding/hex"
 "fmt"
 "io"
 "net"
 "net/http"
 "net/url"
 "strings"
 "time"

 "tailscale.com/tsnet"
)

var modelRelay *http.Server
var modelRelayTransport *http.Transport
var modelRelayAddress string
var modelRelayOwner *tsnet.Server

func closeModelRelay(){
 if modelRelay!=nil{_ = modelRelay.Close()}
 if modelRelayTransport!=nil{modelRelayTransport.CloseIdleConnections()}
 modelRelay=nil;modelRelayTransport=nil;modelRelayAddress="";modelRelayOwner=nil
}

func trustedModelURL(raw string) (*url.URL,error) {
 if len(raw)>16384{return nil,fmt.Errorf("model URL too long")}
 u,err:=url.Parse(raw)
 if err!=nil||u.Scheme!="https"||u.User!=nil||u.Fragment!=""||u.Opaque!=""||(u.Port()!=""&&u.Port()!="443"){return nil,fmt.Errorf("untrusted model URL")}
 host:=strings.ToLower(u.Hostname())
 if host!="huggingface.co"&&!strings.HasSuffix(host,".huggingface.co")&&!strings.HasSuffix(host,".hf.co"){return nil,fmt.Errorf("untrusted model host")}
 return u,nil
}

// ModelRelayURL returns an empty string if no exit node was selected. Once
// selected, failure is an error, never an implicit direct Internet fallback.
func ModelRelayURL() (string,error) {
 exitMu.Lock();defer exitMu.Unlock()
 if selectedExit==""{return "",nil}
 s,err:=currentExitServer();if err!=nil{return "",err}
 lc,err:=s.LocalClient();if err!=nil{return "",err}
 ctx,cancel:=context.WithTimeout(context.Background(),8*time.Second);defer cancel()
 st,err:=lc.Status(ctx);if err!=nil{return "",err}
 if st.ExitNodeStatus==nil||string(st.ExitNodeStatus.ID)!=selectedExit||!st.ExitNodeStatus.Online{return "",fmt.Errorf("selected exit node unavailable")}
 if modelRelay!=nil&&modelRelayOwner==s{return modelRelayAddress,nil}
 closeModelRelay()
 ln,err:=net.Listen("tcp4","127.0.0.1:0");if err!=nil{return "",err}
 var secret [32]byte
 if _,err=rand.Read(secret[:]);err!=nil{ln.Close();return "",err}
 token:="/"+hex.EncodeToString(secret[:])
 transport:=&http.Transport{
  Proxy:nil,DialContext:s.Dial,DisableCompression:true,
  TLSHandshakeTimeout:15*time.Second,ResponseHeaderTimeout:30*time.Second,
  IdleConnTimeout:30*time.Second,MaxIdleConns:4,MaxConnsPerHost:2,
 }
 client:=&http.Client{Transport:transport,CheckRedirect:func(*http.Request,[]*http.Request)error{return http.ErrUseLastResponse}}
 slots:=make(chan struct{},2)
 handler:=http.HandlerFunc(func(w http.ResponseWriter,r *http.Request){
  w.Header().Set("Cache-Control","no-store")
  if r.Method!="GET"||subtle.ConstantTimeCompare([]byte(r.URL.Path),[]byte(token))!=1{http.Error(w,"not found",404);return}
  select{case slots<-struct{}{}:defer func(){<-slots}();default:http.Error(w,"busy",429);return}
  dest,err:=trustedModelURL(r.URL.Query().Get("url"));if err!=nil{http.Error(w,"invalid model URL",400);return}
  request,err:=http.NewRequestWithContext(r.Context(),"GET",dest.String(),nil);if err!=nil{http.Error(w,"invalid request",400);return}
  request.Header.Set("Accept-Encoding","identity")
  if v:=r.Header.Get("Range");v!=""{
   if !strings.HasPrefix(v,"bytes=")||len(v)>80||strings.Contains(v,","){http.Error(w,"invalid range",400);return}
   request.Header.Set("Range",v)
  }
  response,err:=client.Do(request);if err!=nil{http.Error(w,"exit node request failed",502);return}
  defer response.Body.Close()
  for _,key:=range []string{"Content-Length","Content-Range","Content-Type","Content-Encoding","Accept-Ranges","ETag","Location"}{
   if v:=response.Header.Get(key);v!=""{w.Header().Set(key,v)}
  }
  w.WriteHeader(response.StatusCode)
  _,_=io.Copy(w,response.Body)
 })
 server:=&http.Server{Handler:handler,ReadHeaderTimeout:5*time.Second,IdleTimeout:30*time.Second,MaxHeaderBytes:32*1024}
 modelRelay=server;modelRelayTransport=transport;modelRelayOwner=s
 modelRelayAddress="http://"+ln.Addr().String()+token
 go func(){_ = server.Serve(ln)}()
 return modelRelayAddress,nil
}
