package tsnetbridge

import "testing"

func TestTrustedModelURL(t *testing.T) {
 for _,raw:=range []string{
  "https://huggingface.co/api/models?filter=gguf",
  "https://huggingface.co/owner/model/resolve/main/file.gguf",
  "https://cdn-lfs.huggingface.co/file",
  "https://cas-bridge.xethub.hf.co/file?signature=abc",
 } {
  if _,err:=trustedModelURL(raw);err!=nil{t.Errorf("rejected trusted model URL: %s",raw)}
 }
 for _,raw:=range []string{
  "http://huggingface.co/api/models",
  "https://huggingface.co.evil.example/",
  "https://evil.example@huggingface.co/",
  "https://huggingface.co@127.0.0.1/",
  "https://huggingface.co:8080/",
  "https://169.254.169.254/",
  "file:///etc/passwd",
  "https://huggingface.co/model#fragment",
  "https://hf.co/",
 } {
  if _,err:=trustedModelURL(raw);err==nil{t.Errorf("accepted forbidden URL: %s",raw)}
 }
}
