param([string]$NodePath = 'node.exe',[string]$Core = $PSScriptRoot,[string]$DataDir = $(if ($env:OPENCODE_CONNECT_DIR) { $env:OPENCODE_CONNECT_DIR } else { Join-Path $env:LOCALAPPDATA 'opencode-connect' }),[string]$Language = [Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName)
# Runs in the signed-in user's interactive session, not as administrator.
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$ErrorActionPreference='Stop'
$ru=@{
 'AgentLink | Control Center' = 'AgentLink | Центр управления'
 'AgentLink — your computer, your rules' = 'AgentLink — управление компьютером'
 'Launcher: checking...' = 'Launcher: проверка...'
 'Address: —' = 'Адрес: —'
 'Pairing code: —' = 'Код подключения: —'
 'Connection / setup' = 'Подключение и настройка'
 'Pair / start computer connection' = 'Подключить телефон / запустить сервер'
 'Stop launcher and server' = 'Остановить Launcher и сервер'
 'Run connection diagnostics' = 'Диагностика подключения'
 'Phone agent permissions (off by default; one hour)' = 'Разрешения агента телефона (по умолчанию выключены)'
 'Choose allowed folder' = 'Выбрать разрешённую папку'
 'Allow commands as my Windows user (NOT sandboxed)' = 'Разрешить команды с правами пользователя Windows (не песочница)'
 'Allow file exchange in this folder (new files only)' = 'Разрешить обмен файлами в выбранной папке (без перезаписи)'
 'Allow visible desktop screenshots, window activation, clicks and keys' = 'Разрешить снимки экрана, управление окнами, мышью и клавишами'
 'Enable selected permissions for one hour' = 'Разрешить выбранные функции на один час'
 'Disable remote permissions immediately' = 'Запретить новые удалённые действия'
 'Internet sharing (system networking)' = 'Раздача интернета (системные настройки)'
 'Open Windows mobile hotspot settings' = 'Открыть настройки мобильного хот-спота Windows'
 'Ethernet / Wi-Fi sharing (ICS settings)' = 'Общий доступ Ethernet / Wi-Fi (ICS)'
 'Offer this PC as a Tailscale exit node' = 'Раздавать интернет через Tailscale exit node'
 'Stop offering exit node' = 'Отключить раздачу через exit node'
 'Use an approved tailnet exit node' = 'Получать интернет через exit node'
 'Stop using exit node' = 'Отключить получение интернета через exit node'
 'Another setup operation is running.' = 'Другая операция настройки уже запущена.'
 'Unable to start setup. Check Node.js and launcher installation.' = 'Не удалось запустить настройку. Проверьте Node.js и Launcher.'
 'Stop the launcher and server?' = 'Остановить Launcher и сервер?'
 'Select at least one permission.' = 'Выберите хотя бы одно разрешение.'
 'Choose an existing folder.' = 'Выберите существующую папку.'
 'Only grant access to a trusted paired device. Commands can access all files your Windows account can access, not just the selected directory. LAN transport is not encrypted; prefer Tailscale. Continue?' = 'Разрешайте доступ только доверенному телефону. Команды могут обращаться ко всем доступным пользователю Windows файлам, а не только выбранной папке. LAN HTTP не шифруется; предпочтителен Tailscale. Продолжить?'
 'Remote permissions enabled for one hour. Approve each action on the phone.' = 'Доступ разрешён на один час. Подтверждайте действия на телефоне.'
 'Could not save permissions.' = 'Не удалось сохранить разрешения.'
 'New remote actions are disabled. Already running commands may finish.' = 'Новые действия запрещены. Уже запущенные команды могут завершиться.'
 'Share your internet with authorized tailnet devices? You must approve the exit node in Tailscale administration. This may incur traffic charges.' = 'Раздавать интернет разрешённым устройствам tailnet? Выходной узел необходимо одобрить в админ-панели Tailscale. Возможен расход трафика.'
 'Install/sign in to the Windows Tailscale client first.' = 'Сначала установите Tailscale на ПК и войдите в аккаунт.'
 'Exit node advertised. Approve it in Tailscale and select it on the receiving device.' = 'Выходной узел предложен. Одобрите его в Tailscale и выберите на принимающем устройстве.'
 'Tailscale rejected the change.' = 'Tailscale не применил изменение.'
 'Exit node advertisement disabled.' = 'Раздача через выходной узел отключена.'
 'Tailscale client unavailable.' = 'Клиент Tailscale недоступен.'
 'No online approved exit nodes found.' = 'Не найдены доступные одобренные выходные узлы.'
 'Select exit node' = 'Выберите выходной узел'
 'Use selected device' = 'Использовать выбранное устройство'
 'Tailscale rejected the exit node.' = 'Tailscale не применил выбранный узел.'
 'Could not enumerate exit nodes.' = 'Не удалось получить список выходных узлов.'
 'Launcher setup not detected | Remote permissions unknown' = 'Launcher не настроен | состояние разрешений неизвестно'
}
function L([string]$value){if($Language -eq 'ru' -and $ru.ContainsKey($value)){return $ru[$value]};return $value}
$policy=Join-Path $DataDir 'remote-control.json'
$stateFile=Join-Path $DataDir 'state.json'
New-Item -ItemType Directory -Path $DataDir -Force | Out-Null
$form=New-Object Windows.Forms.Form
$form.Text=(L 'AgentLink | Control Center')
$form.Size=New-Object Drawing.Size(820,720)
$form.MinimumSize=New-Object Drawing.Size(680,620)
$form.StartPosition='CenterScreen'
$form.BackColor=[Drawing.Color]::FromArgb(19,25,35)
$form.ForeColor=[Drawing.Color]::White
$form.Font=New-Object Drawing.Font('Segoe UI',10)
$panel=New-Object Windows.Forms.FlowLayoutPanel
$panel.Dock='Fill';$panel.FlowDirection='TopDown';$panel.WrapContents=$false;$panel.AutoScroll=$true;$panel.Padding=New-Object Windows.Forms.Padding(18)
$form.Controls.Add($panel)
function Label($text,$size=10) {
 $c=New-Object Windows.Forms.Label;$c.Text=(L $text);$c.AutoSize=$false;$c.Width=720;$c.Height=([Math]::Max(30,$size+20));$c.Font=New-Object Drawing.Font('Segoe UI',$size);$c.ForeColor=$form.ForeColor;$panel.Controls.Add($c);return $c
}
function Button($text,$handler) {
 $c=New-Object Windows.Forms.Button;$c.Text=(L $text);$c.Width=350;$c.Height=38;$c.FlatStyle='Flat';$c.BackColor=[Drawing.Color]::FromArgb(34,47,65);$c.ForeColor=[Drawing.Color]::White;$c.Add_Click($handler);$panel.Controls.Add($c);return $c
}
function Check($text) {
 $c=New-Object Windows.Forms.CheckBox;$c.Text=(L $text);$c.Width=710;$c.Height=28;$c.ForeColor=$form.ForeColor;$panel.Controls.Add($c);return $c
}
function Notify($text){[void][Windows.Forms.MessageBox]::Show($form,(L $text),'AgentLink')}
function Confirm($text){return [Windows.Forms.MessageBox]::Show($form,$text,'AgentLink',[Windows.Forms.MessageBoxButtons]::YesNo,[Windows.Forms.MessageBoxIcon]::Warning) -eq [Windows.Forms.DialogResult]::Yes}
$null=Label 'AgentLink — your computer, your rules' 20
$status=Label 'Launcher: checking...' 11
$address=Label 'Address: —' 11
$pairLabel=Label 'Pairing code: —' 16
$pairLabel.ForeColor=[Drawing.Color]::FromArgb(80,210,235)
$pairFile=Join-Path $DataDir 'pair.json'
$null=Label 'Connection / setup' 13
$mode=New-Object Windows.Forms.ComboBox;$mode.DropDownStyle='DropDownList';$mode.Width=300;[void]$mode.Items.Add('tailscale');[void]$mode.Items.Add('lan');$mode.SelectedIndex=0;$panel.Controls.Add($mode)
$script:job=$null
function RunCore([string[]]$arguments){
 if($script:job -and -not $script:job.HasExited){Notify 'Another setup operation is running.';return}
 try{
  $start=New-Object Diagnostics.ProcessStartInfo
  $start.FileName=$NodePath;$start.Arguments='"'+(Join-Path $Core 'connect.js')+'" '+($arguments -join ' ')
  $start.WorkingDirectory=$Core;$start.UseShellExecute=$false;$start.CreateNoWindow=$false
  $start.EnvironmentVariables['OPENCODE_CONNECT_DIR']=$DataDir
  $script:job=[Diagnostics.Process]::Start($start)
 }catch{Notify 'Unable to start setup. Check Node.js and launcher installation.'}
}
$null=Button 'Pair / start computer connection' {RunCore @('--mode',([string]$mode.SelectedItem))}
$null=Button 'Stop launcher and server' {if(Confirm 'Stop the launcher and server?'){Remove-Item -LiteralPath $policy -Force -ErrorAction SilentlyContinue;RunCore @('--stop')}}
$null=Button 'Run connection diagnostics' {RunCore @('--doctor')}
$null=Label 'Phone agent permissions (off by default; one hour)' 13
$roots=New-Object Windows.Forms.TextBox;$roots.Width=710;$roots.Text=[Environment]::GetFolderPath('MyDocuments');$panel.Controls.Add($roots)
$null=Button 'Choose allowed folder' {$d=New-Object Windows.Forms.FolderBrowserDialog;try{if($d.ShowDialog($form) -eq 'OK'){$roots.Text=$d.SelectedPath}}finally{$d.Dispose()}}
$shell=Check 'Allow commands as my Windows user (NOT sandboxed)'
$files=Check 'Allow file exchange in this folder (new files only)'
$desktop=Check 'Allow visible desktop screenshots, window activation, clicks and keys'
$null=Button 'Enable selected permissions for one hour' {
 try{
  if(-not ($shell.Checked -or $files.Checked -or $desktop.Checked)){Notify 'Select at least one permission.';return}
  if(-not (Test-Path -LiteralPath $roots.Text -PathType Container)){Notify 'Choose an existing folder.';return}
  if(-not (Confirm 'Only grant access to a trusted paired device. Commands can access all files your Windows account can access, not just the selected directory. LAN transport is not encrypted; prefer Tailscale. Continue?')){return}
  $data=@{until=[DateTimeOffset]::UtcNow.AddHours(1).ToUnixTimeMilliseconds();roots=@((Resolve-Path -LiteralPath $roots.Text).Path);shell=$shell.Checked;files=$files.Checked;desktop=$desktop.Checked}
  $tmp=$policy+'.'+[Guid]::NewGuid().ToString('N')+'.tmp'
  [IO.File]::WriteAllText($tmp,($data|ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
  if(Test-Path -LiteralPath $policy){[IO.File]::Replace($tmp,$policy,$null)}else{[IO.File]::Move($tmp,$policy)}
  Notify 'Remote permissions enabled for one hour. Approve each action on the phone.'
 }catch{Notify 'Could not save permissions.'}
}
$null=Button 'Disable remote permissions immediately' {Remove-Item -LiteralPath $policy -Force -ErrorAction SilentlyContinue;Notify 'New remote actions are disabled. Already running commands may finish.'}
$null=Label 'Internet sharing (system networking)' 13
$null=Button 'Open Windows mobile hotspot settings' {Start-Process 'ms-settings:network-mobilehotspot'}
$null=Button 'Ethernet / Wi-Fi sharing (ICS settings)' {Start-Process 'ncpa.cpl'}
$null=Button 'Offer this PC as a Tailscale exit node' {
 if(-not(Confirm 'Share your internet with authorized tailnet devices? You must approve the exit node in Tailscale administration. This may incur traffic charges.')){return}
 $ts=Get-Command tailscale.exe -ErrorAction SilentlyContinue
 if(-not $ts){Notify 'Install/sign in to the Windows Tailscale client first.';return}
 & $ts.Source set --advertise-exit-node=true
 if($LASTEXITCODE -eq 0){Notify 'Exit node advertised. Approve it in Tailscale and select it on the receiving device.'}else{Notify 'Tailscale rejected the change.'}
}
$null=Button 'Stop offering exit node' {
 $ts=Get-Command tailscale.exe -ErrorAction SilentlyContinue
 if($ts){& $ts.Source set --advertise-exit-node=false;if($LASTEXITCODE -eq 0){Notify 'Exit node advertisement disabled.'}else{Notify 'Tailscale rejected the change.'}}
}
$null=Button 'Use an approved tailnet exit node' {
 $ts=Get-Command tailscale.exe -ErrorAction SilentlyContinue
 if(-not $ts){Notify 'Tailscale client unavailable.';return}
 try{
  $st=(& $ts.Source status --json | Out-String | ConvertFrom-Json)
  $peers=@($st.Peer.PSObject.Properties.Value | Where-Object {$_.ExitNodeOption -and $_.Online -and $_.TailscaleIPs.Count -gt 0})
  if(!$peers.Count){Notify 'No online approved exit nodes found.';return}
  $dialog=New-Object Windows.Forms.Form;$dialog.Text=(L 'Select exit node');$dialog.Size=New-Object Drawing.Size(500,400);$dialog.StartPosition='CenterParent'
  $list=New-Object Windows.Forms.ListBox;$list.Dock='Fill';foreach($peer in $peers){[void]$list.Items.Add(("$($peer.HostName) · $($peer.TailscaleIPs[0])"))}
  $ok=New-Object Windows.Forms.Button;$ok.Text=(L 'Use selected device');$ok.Dock='Bottom';$ok.DialogResult='OK'
  $dialog.Controls.Add($list);$dialog.Controls.Add($ok);$dialog.AcceptButton=$ok
  try{if($dialog.ShowDialog($form) -eq 'OK' -and $list.SelectedIndex -ge 0){$ip=[string]$peers[$list.SelectedIndex].TailscaleIPs[0];$parsed=$null;if([Net.IPAddress]::TryParse($ip,[ref]$parsed) -and (Confirm "Route Windows internet through $ip?")){& $ts.Source set "--exit-node=$ip" --exit-node-allow-lan-access=true;if($LASTEXITCODE -ne 0){Notify 'Tailscale rejected the exit node.'}}}}finally{$dialog.Dispose()}
 }catch{Notify 'Could not enumerate exit nodes.'}
}
$null=Button 'Stop using exit node' {
 $ts=Get-Command tailscale.exe -ErrorAction SilentlyContinue
 if($ts){& $ts.Source set --exit-node=;if($LASTEXITCODE -ne 0){Notify 'Tailscale rejected the change.'}}
}
$timer=New-Object Windows.Forms.Timer;$timer.Interval=2000
$timer.Add_Tick({
 try{
  $s=Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
  $p=if(Test-Path -LiteralPath $policy){Get-Content -LiteralPath $policy -Raw | ConvertFrom-Json}else{$null}
  $enabled=$p -and [long]$p.until -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $port=if($s.launcherPort){[int]$s.launcherPort}else{4095}
  $bind=if($s.launcherHost){[string]$s.launcherHost}else{'127.0.0.1'}
  $listening=@(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue|Where-Object {$_.LocalAddress -eq $bind}).Count -gt 0
  $address.Text=$(if($Language -eq 'ru'){'Адрес: '}else{'Address: '})+$s.linkHost+':'+$s.port+' | '+$(if($Language -eq 'ru'){'Порт Launcher: '}else{'Launcher port: '})+$port
  $pairLabel.Text=(L 'Pairing code: —')
  if(Test-Path -LiteralPath $pairFile){try{$pair=Get-Content -LiteralPath $pairFile -Raw|ConvertFrom-Json;if([long]$pair.expires -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -and [string]$pair.code -match '^\d{6} '+$(if($listening){'present'}else{'not detected'})+' | '+$s.mode+' | Remote: '+$(if($enabled){'enabled until '+[DateTimeOffset]::FromUnixTimeMilliseconds([long]$p.until).ToLocalTime().ToString('HH:mm')}else{'off'}))
 }catch{$status.Text=(L 'Launcher setup not detected | Remote permissions unknown');$address.Text=(L 'Address: —');$pairLabel.Text=(L 'Pairing code: —')}
})
$timer.Start()
$form.Add_FormClosed({$timer.Stop();$timer.Dispose()})
[void]$form.ShowDialog()
){$pairLabel.Text=$(if($Language -eq 'ru'){'Код подключения: '}else{'Pairing code: '})+$pair.code.Substring(0,3)+' '+$pair.code.Substring(3,3)}}catch{}}
  $status.Text=('Launcher listener: '+$(if($listening){'present'}else{'not detected'})+' | '+$s.mode+' | Remote: '+$(if($enabled){'enabled until '+[DateTimeOffset]::FromUnixTimeMilliseconds([long]$p.until).ToLocalTime().ToString('HH:mm')}else{'off'}))
 }catch{$status.Text='Launcher setup not detected | Remote permissions unknown'}
})
$timer.Start()
$form.Add_FormClosed({$timer.Stop();$timer.Dispose()})
[void]$form.ShowDialog()
