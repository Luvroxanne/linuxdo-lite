$dir = "$env:USERPROFILE\linuxdo-lite"
$url = "https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip"
$zip = "$dir\linuxdo-lite.zip"
Write-Host "正在下载最新版到 $dir ..."
New-Item -ItemType Directory -Force $dir | Out-Null
Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
if (-not (Test-Path $zip)) { Write-Host "下载失败，请检查网络 / 梯子后重试"; pause; exit 1 }
Write-Host "下载完成，正在解压..."
Expand-Archive -Force $zip $dir
Remove-Item $zip -ErrorAction SilentlyContinue
if (-not (Test-Path "$dir\manifest.json")) { Write-Host "解压失败，$dir 里没有 manifest.json"; pause; exit 1 }
Write-Host "已解压到 $dir"
Write-Host "接下来请在打开的扩展页里：开开发者模式，点 加载已解压的扩展程序，选 $dir"
$chrome = "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
if (Test-Path $chrome) { Start-Process $chrome "chrome://extensions/" } else { Start-Process "chrome://extensions/" }
pause
