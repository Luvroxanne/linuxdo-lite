# LinuxDo 看帖 Lite

[![Download Latest Release](https://img.shields.io/badge/一键下载最新版-linuxdo--lite.zip-0ea5e9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip)
[![Releases](https://img.shields.io/github/v/release/Luvroxanne/linuxdo-lite?style=for-the-badge&label=版本)](https://github.com/Luvroxanne/linuxdo-lite/releases/latest)

轻量、低内存的 Chrome / Edge 浏览器扩展，专为 [LINUX DO](https://linux.do) 打造：侧边栏刷帖、信任等级与 LDC 积分进度、多套摸鱼/IM 外观、自动读帖、AI 帖子总结与全场景屏蔽过滤。

## 一键下载与安装

> 由于未上架 Chrome 网上应用店，浏览器安全策略要求通过“加载已解压的扩展程序”安装。点击上方蓝色按钮或下方链接即可直接下载最新构建包：

👉 **[点此一键下载最新版 `linuxdo-lite.zip`](https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip)**

### 方式一：手动安装（30 秒）
1. 点击上方链接下载 `linuxdo-lite.zip`，解压到一个**固定文件夹**（例如 `D:\linuxdo-lite`）。
2. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），开启右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择刚才解压的文件夹即可。

### 方式二：命令行一键下载 / 覆盖更新（保留全部本地设置）

**Windows (PowerShell)：**
```powershell
$dir="$env:USERPROFILE\linuxdo-lite"; New-Item -ItemType Directory -Force $dir | Out-Null; Invoke-WebRequest "https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip" -OutFile "$dir\pkg.zip"; Expand-Archive -Force "$dir\pkg.zip" $dir; Remove-Item "$dir\pkg.zip"; Write-Host "已更新到 $dir，请在 chrome://extensions/ 点击刷新按钮"
```

**macOS / Linux：**
```bash
mkdir -p ~/linuxdo-lite && curl -fsSL "https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip" -o /tmp/linuxdo-lite.zip && unzip -oq /tmp/linuxdo-lite.zip -d ~/linuxdo-lite && rm -f /tmp/linuxdo-lite.zip && echo "已更新到 ~/linuxdo-lite，请在 chrome://extensions/ 点击刷新按钮"
```

## 扩展内自动检查更新

1. 打开侧边栏 → **设置 → 版本与更新** → 点击 **检查更新**。
2. 扩展会自动查询本仓库的 GitHub Releases（若尚未发布 Release 则自动回退检查 `main` 分支的 `manifest.json`）。
3. 发现新版本后点击 **下载 vX.Y.Z**，将压缩包解压覆盖到原目录，并在 `chrome://extensions/` 点击刷新按钮（↻）即可完成无缝升级，所有本地设置、AI Key 和自定义链接均会保留。

## 核心功能

- **侧边栏看帖与已读隐藏**：支持最热/最新切换、收藏夹、自动隐藏已读帖子，以及被 Cloudflare 拦截时的后台静默过验证（带 3 分钟冷却，可在设置关闭）。
- **等级与 LDC 积分看板**：展示当前信任等级、Connect 近 100 天进度、LDC 可用余额与自定义快捷链接，访问过 `connect.linux.do` / `credit.linux.do` 时自动静默缓存，绝不自动弹窗。
- **ReadBoost 自动读帖**：原样集成 [LINUXDO ReadBoost v2.2](https://greasyfork.org/zh-CN/scripts/519843-linuxdo-readboost)（作者 Do），支持帖子页顶栏 `▶`/`⏹` 及侧边栏一键启停与参数配置。
- **外观主题与摸鱼增强**：支持默认原版、钉钉/飞书/企微 IM（原样集成 [czm15053/linuxdo-idea-ui](https://github.com/czm15053/linuxdo-idea-ui) v1.3.7，MIT）、暗黑、护眼绿、摸鱼灰；提供老板键 `Alt+M`、隐私模式、只看楼主、楼层号、快捷回复与全场景用户/关键词屏蔽。
- **AI 帖子总结**：支持任意 OpenAI 兼容接口（OpenAI / DeepSeek / 本地反代），API Key 仅保存在本地并同步备份至 `chrome.storage.sync`。

## 本地测试与发版

```bash
# 运行自动化测试（验证版本号比对、Release/Manifest 更新检测与资源完整性）
node tests/update-check.test.js

# 推送标签自动触发 GitHub Actions 打包并发布 Release
git tag v1.6.15 && git push origin v1.6.15
```
