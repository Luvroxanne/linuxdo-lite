# LinuxDo 看帖 Lite

[![Download Latest Release](https://img.shields.io/badge/下载最新版-linuxdo--lite.zip-0ea5e9?style=for-the-badge&logo=googlechrome&logoColor=white)](https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip)
[![Releases](https://img.shields.io/github/v/release/Luvroxanne/linuxdo-lite?style=for-the-badge&label=版本)](https://github.com/Luvroxanne/linuxdo-lite/releases/latest)

轻量、低内存的 Chrome / Edge 浏览器扩展，专为 [LINUX DO](https://linux.do) 打造：侧边栏刷帖、信任等级与 LDC 积分进度、多套摸鱼/IM 外观、自动读帖、AI 速读与全场景屏蔽过滤。

当前版本：v1.7.8

## 下载与安装

> 未上架 Chrome 网上应用店，Chrome 的安全策略不允许从 GitHub 点一下就装进浏览器。所以这里能做到的是“一键下载”，安装仍需手动“加载已解压的扩展程序”，30 秒，全程不用命令行。

### 下载最新版

👉 **[下载最新版 `linuxdo-lite.zip`](https://github.com/Luvroxanne/linuxdo-lite/releases/latest/download/linuxdo-lite.zip)**

备用下载（还没发新版、上面链接 404 时用）：[下载 main 分支源码 zip](https://github.com/Luvroxanne/linuxdo-lite/archive/refs/heads/main.zip)，解压后是 `linuxdo-lite-main` 文件夹，安装时选这个内层文件夹。

### 安装（30 秒）

1. 下载上面的 `linuxdo-lite.zip`，解压到一个**固定文件夹**（例如 `D:\linuxdo-lite`），之后不要移动、不要删除这个文件夹。
2. 打开 `chrome://extensions/`（Edge 为 `edge://extensions/`），开启右上角 **开发者模式**。
3. 点击 **加载已解压的扩展程序**，选择刚才解压的文件夹即可。

### 手动更新（保留全部配置）

Chrome 对“加载已解压的扩展”是按文件夹识别 ID 的，换目录等于换扩展，配置不会跟过去。所以更新前先备份：

1. 侧边栏 → **设置 → 版本与更新 → 导出配置备份**（会得到一个 `linuxdo-lite-backup.json`，里面包含 AI Key、屏蔽规则、主题、快捷回复、收藏和已读记录）。
2. 下载最新 `linuxdo-lite.zip` 并解压。
3. **推荐：覆盖当前扩展所在的文件夹**（保持路径不变），然后到扩展页点一次刷新。扩展 ID 不变，配置自然还在。
4. 如果解压到了新文件夹：加载新文件夹后，打开 **设置 → 版本与更新 → 导入配置备份**，选择刚才的 JSON 即可恢复全部配置。
5. 点“下载新版 ZIP”时，扩展也会自动先导出一份配置备份，防止忘记。

### 一键下载并覆盖更新（已装过之后用）

> 先按上面的“手动更新”导出一份配置备份；下面命令会覆盖固定目录并保留扩展 ID，所以配置通常不受影响。

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

- **侧边栏看帖与已读隐藏**：支持最热/最新切换、收藏夹、自动隐藏已读帖子。被 Cloudflare 拦截时会自动开一个不激活的后台页过验证，取完即关；只打开插件、不打开 L 站也能刷新列表。
- **等级与 LDC 积分看板**：打开等级页自动同步成员信息、Connect 近 100 天进度和 LDC 可用余额，无需手动刷新，也不用先打开 `connect.linux.do` / `credit.linux.do`；首次同步会自动开一个后台页过 Cloudflare。上次结果会缓存，下次打开先秒显再更新。
- **ReadBoost 自动读帖**：原样集成 [LINUXDO ReadBoost v2.2](https://greasyfork.org/zh-CN/scripts/519843-linuxdo-readboost)（作者 Do），支持帖子页顶栏 `▶`/`⏹` 及侧边栏一键启停与参数配置。
- **外观主题与摸鱼增强**：支持默认原版、钉钉/飞书/企微 IM（原样集成 [czm15053/linuxdo-idea-ui](https://github.com/czm15053/linuxdo-idea-ui) v1.3.7，MIT）、暗黑、护眼绿、摸鱼灰；提供老板键 `Alt+M`、隐私模式、只看楼主、楼层号、快捷回复与全场景用户/关键词屏蔽。
- **AI 速读（v1.7 重做）**：在任意 linux.do 帖子页点右下角 **AI 速读**（或按 `Alt+S`）直接弹出速读卡，侧边栏也有入口。自动抓取标题、楼主正文和前 20 楼评论，长帖先分段速读再汇总；结果流式输出、Markdown 排版，给出「一句话结论 / 核心要点 / 讨论与分歧 / 值不值得读」。支持速读与深度两种风格，同一帖 7 天内命中本地缓存秒开，可复制、停止和重新生成。接口支持任意 OpenAI 兼容服务（OpenAI / DeepSeek / 本地反代），API Key 仅保存在本地并同步备份至 `chrome.storage.sync`。

## 本地测试与发版

```bash
# 运行自动化测试（验证版本号比对、Release/Manifest 更新检测与资源完整性）
node tests/update-check.test.js

# 推送标签自动触发 GitHub Actions 打包并发布 Release
git tag v1.7.0 && git push origin v1.7.0
```

也可以在 GitHub 网页上发版：Actions → Build & Release LinuxDo Lite → Run workflow → Branch 选 main → Run workflow。
