# 上游原版引用说明

本扩展的钉钉 / 飞书 / 企业微信 IM 外观，**不是我们自己写的简化版**，是原样捆绑的上游开源代码。

- 项目：czm15053/linuxdo-idea-ui
- 文件：`linuxdo-im.user.js`（IM 三合一：钉钉 / 飞书 / 企业微信）
- 版本：**1.3.7**
- 上游提交：507549bcc61ad91dac9b7ec177b6e423e8a37433（2026-11-19）
- 来源：https://github.com/czm15053/linuxdo-idea-ui/raw/main/linuxdo-im.user.js
- 协议：MIT，见本目录 `LICENSE`，版权 (c) 2026 czm15053
- SHA-256：`3f4c983280f1c8d07cba4489842f87acf9eb23e6472275b0d973c43a53e51577`
- 体积：877 KB，19,500 行（构建后的单文件）

## 为什么能原样嵌

上游全文件只用到了一个油猴 API：`GM_xmlhttpRequest`，只在拉
`https://connect.linux.do/` 信任级别卡片时用一次。
其余全部是 `localStorage` + DOM + fetch，和普通网页脚本一样。
所以扩展里用 `upstream/gm-shim.js` 给它补一个 fetch 版的
`GM_xmlhttpRequest` 就能跑，不用改上游代码一行。

唯一降级：`connect.linux.do` 是跨域，页面里的 fetch 会被 CORS 拦，
那一个信任级别功能在扩展里可能会失败，上游代码是 reject 后降级，
不影响皮肤本身。油猴版用 GM_xmlhttpRequest 可以跨域，所以那一个
功能在油猴里能跑，在扩展里不一定。

旧的独立版 `linuxdo-dingtalk.user.js`（0.5.0）和
`linuxdo-feishu.user.js`（0.3.0）上游已停止更新，README 明确说
改用 IM 三合一，所以这里没捆绑旧版，只捆了三合一。

## 版本更新

上游更新时，有两种更新办法：

1. **扩展里点更新（不用重装扩展）**：侧边栏设置里点
   “检查上游更新”，扩展后台去拉最新的 raw 文件，存到
   `chrome.storage.local` 的 `upstream_im_code` 里，下次进论坛
   就用新版。原版文件还在包里当兜底。
2. **我重新打包**：让我重新从 GitHub 拉一份，打个新版 zip 给你，
   覆盖安装就行。

注意：你本地网络访问不了 GitHub，所以办法 1 在你那边
（0dcloud / 直连被拦时）也可能拉不到，那时就用办法 2，
我这边能访问 GitHub，拉下来打进包里给你。

---

## LINUXDO ReadBoost（自动读帖脚本）

本扩展同时原样捆绑了自动读帖油猴脚本，未修改其核心逻辑：

- 项目：LINUXDO ReadBoost（作者：Do）
- 文件：`upstream/linuxdo-readboost.user.js`
- 版本：**2.2**
- Greasy Fork 来源：https://greasyfork.org/zh-CN/scripts/519843-linuxdo-readboost
- GitHub 仓库：https://github.com/dosomethingspace/LINUXDO_ReadBoost
- 兼容层：`upstream/gm-readboost-shim.js`（在页面主世界提供 `GM_getValue`、`GM_setValue`、`GM_registerMenuCommand`，把配置存到 `localStorage` 的 `ld_readboost_*` 键，并在页面顶栏与扩展侧边栏提供“开始执行 / 停止执行 / 设置”入口）
