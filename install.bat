@echo off
chcp 65001 >nul
setlocal EnableExtensions
set "DEFAULT_DIR=%USERPROFILE%\linuxdo-lite"
set "DIR=%DEFAULT_DIR%"
set "URL=https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip"
set "EXISTING="
set "UPDATE_MODE="

echo ==============================================
echo  LinuxDo Lite 安装器
echo ==============================================
echo.

rem 查找浏览器里已经加载的 LinuxDo Lite 目录；原地更新才能保留扩展 ID 和配置。
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "$hits=@(); $roots=@(($env:LOCALAPPDATA+'\Google\Chrome\User Data'),($env:LOCALAPPDATA+'\Microsoft\Edge\User Data'),($env:LOCALAPPDATA+'\Google\Chrome Beta\User Data'),($env:LOCALAPPDATA+'\Microsoft\Edge Beta\User Data')); foreach($r in $roots){ if(Test-Path $r){ Get-ChildItem $r -Directory -ErrorAction SilentlyContinue | ForEach-Object { foreach($f in @('Secure Preferences','Preferences')){ $p=Join-Path $_.FullName $f; if(Test-Path $p){ try{ $j=ConvertFrom-Json ([IO.File]::ReadAllText($p)); if($j.extensions -and $j.extensions.settings){ foreach($prop in $j.extensions.settings.PSObject.Properties){ $e=$prop.Value; if($e.location -eq 4 -and $e.path -and (Test-Path (Join-Path $e.path 'manifest.json'))){ $n=''; if($e.manifest -and $e.manifest.name){$n=$e.manifest.name}; if(($n -like '*LinuxDo*') -or ($e.path -like '*linuxdo-lite*')){ $hits += $e.path } } } } }catch{} } } } } }; $hits | Select-Object -Unique | Select-Object -First 1" 2^>nul`) do if not defined EXISTING set "EXISTING=%%P"

if defined EXISTING set "DIR=%EXISTING%"
if defined EXISTING set "UPDATE_MODE=1"

rem 优先用你已经下载的 zip：拖到 bat 上、放在 bat 同目录、当前目录，或 Downloads 下的 linuxdo-lite*.zip。
set "USING_LOCAL="
set "DOWNLOADED="
set "LOCAL_ZIP="
if not "%~1"=="" if exist "%~1" set "LOCAL_ZIP=%~1"
if not defined LOCAL_ZIP for /f "delims=" %%Z in ('dir /b /o-d "%~dp0linuxdo-lite*.zip" 2^>nul') do if not defined LOCAL_ZIP set "LOCAL_ZIP=%~dp0%%Z"
if not defined LOCAL_ZIP for /f "delims=" %%Z in ('dir /b /o-d "%CD%\linuxdo-lite*.zip" 2^>nul') do if not defined LOCAL_ZIP set "LOCAL_ZIP=%CD%\%%Z"
if not defined LOCAL_ZIP for /f "delims=" %%Z in ('dir /b /o-d "%USERPROFILE%\Downloads\linuxdo-lite*.zip" 2^>nul') do if not defined LOCAL_ZIP set "LOCAL_ZIP=%USERPROFILE%\Downloads\%%Z"

if not defined UPDATE_MODE goto install_fresh
echo 已找到现有安装："%DIR%"
echo 将原地覆盖更新，配置和 AI Key 都会保留。
echo 如果扩展页里有多个 LinuxDo Lite，请删除旧的或报错的那个。
goto install_msg_done
:install_fresh
echo 没有找到现有安装，将安装到："%DIR%"
:install_msg_done
echo.
if not exist "%DIR%" mkdir "%DIR%"

if not defined LOCAL_ZIP goto download
set "ZIP=%LOCAL_ZIP%"
tar -tf "%ZIP%" 2>nul | findstr /i /c:"manifest.json" >nul
if errorlevel 1 goto local_bad
echo 使用本地安装包："%ZIP%"
echo 跳过下载。
set "USING_LOCAL=1"
call :extract_zip
if exist "%DIR%\manifest.json" goto unpack_ok
:local_bad
echo 本地 zip 无效或不完整，改为联网下载……
set "LOCAL_ZIP="
set "USING_LOCAL="

:download
set "ZIP=%DIR%\linuxdo-lite.zip"
echo 正在下载最新版……
curl.exe -L --fail --retry 2 --connect-timeout 15 -o "%ZIP%" "%URL%"
if errorlevel 1 goto dl_fail
if not exist "%ZIP%" goto dl_fail
set "DOWNLOADED=1"
echo 下载完成，正在解压……
call :extract_zip
if not exist "%DIR%\manifest.json" goto unpack_fail

:unpack_ok
if defined DOWNLOADED del "%ZIP%" >nul 2>&1
if not exist "%DIR%\manifest.json" goto unpack_fail
echo.
echo 已安装到 %DIR%
echo.
if defined UPDATE_MODE goto update_done

echo 接下来在扩展页里：
echo  1. 打开右上角“开发者模式”
echo  2. 点“加载已解压的扩展程序”
echo  3. 选择 %DIR%
echo.
echo 正在打开扩展页……
goto open_browser

:update_done
echo 更新完成。请在扩展页对 “LinuxDo Lite” 点一次刷新按钮。
echo 不要再点“加载已解压的扩展程序”，否则会多出一个空配置副本。
echo.
echo 正在打开扩展页……
goto open_browser

:open_browser
set "CHROME="
set "EDGE="
call :find_browser
set "CHROME_RUN="
set "EDGE_RUN="
tasklist /fi "imagename eq chrome.exe" 2>nul | find /i "chrome.exe" >nul && set "CHROME_RUN=1"
tasklist /fi "imagename eq msedge.exe" 2>nul | find /i "msedge.exe" >nul && set "EDGE_RUN=1"
if defined CHROME if defined EDGE if not defined CHROME_RUN if defined EDGE_RUN goto launch_edge
if defined CHROME goto launch_chrome
if defined EDGE goto launch_edge
goto launch_manual

:launch_chrome
set "PROFILE="
call :last_profile "%LOCALAPPDATA%\Google\Chrome\User Data"
if not defined PROFILE goto chrome_plain
echo 正在打开 Chrome（配置文件：%PROFILE%）
echo 提示：有多个账号时，先在 Chrome 右上角切换配置文件，再刷新扩展。
start "" "%CHROME%" --profile-directory="%PROFILE%" "chrome://extensions/"
goto done

:chrome_plain
echo 正在打开 Chrome……
start "" "%CHROME%" "chrome://extensions/"
goto done

:launch_edge
set "PROFILE="
call :last_profile "%LOCALAPPDATA%\Microsoft\Edge\User Data"
if not defined PROFILE goto edge_plain
echo 正在打开 Microsoft Edge（配置文件：%PROFILE%）
echo 提示：有多个账号时，先在 Edge 右上角切换配置文件，再刷新扩展。
start "" "%EDGE%" --profile-directory="%PROFILE%" "edge://extensions/"
goto done

:edge_plain
echo 正在打开 Microsoft Edge……
start "" "%EDGE%" "edge://extensions/"
goto done

:launch_manual
echo 没有找到 Chrome 或 Edge，请手动打开 chrome://extensions/ 或 edge://extensions/
goto done

:find_browser
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
if not defined CHROME if exist "%ProgramFiles%\Google\Chrome Beta\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome Beta\Application\chrome.exe"
if not defined CHROME for /f "delims=" %%P in ('where chrome 2^>nul') do if not defined CHROME set "CHROME=%%P"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "EDGE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
if not defined EDGE if exist "%ProgramFiles(x86)%\Microsoft\Edge Beta\Application\msedge.exe" set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge Beta\Application\msedge.exe"
exit /b 0

:last_profile
set "PROFILE="
if not exist "%~1\Local State" exit /b 0
for /f "usebackq delims=" %%P in (`powershell -NoProfile -Command "try{(ConvertFrom-Json ([IO.File]::ReadAllText('%~1\Local State'))).profile.last_used}catch{}" 2^>nul`) do set "PROFILE=%%P"
exit /b 0

:extract_zip
tar -xf "%ZIP%" -C "%DIR%"
if exist "%DIR%\manifest.json" exit /b 0
echo tar 解压失败，改用 PowerShell 解压……
powershell -NoProfile -Command "Expand-Archive -Force '%ZIP%' '%DIR%'"
exit /b 0

:done
echo.
pause
exit /b 0
:dl_fail
echo.
echo 下载失败。如果你已经有 zip，请把 linuxdo-lite.zip 放到 bat 旁边再双击一次，
echo 安装器会直接使用本地包，不再联网下载。
echo.
pause
exit /b 1
:unpack_fail
echo.
echo 解压失败：%DIR% 里没有 manifest.json
echo 请删除该目录后重新双击 bat。
echo.
pause
exit /b 1
