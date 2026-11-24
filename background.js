// 后台：用带登录态的请求拉 JSON。原版问题就是匿名 fetch 被 Cloudflare 拦（403 / challenge），
// 这里 credentials:'include' 会带上 linux.do 的登录 cookie + cf_clearance，比匿名请求容易通过。
async function applyPanelBehavior() {
  try {
    const r = await chrome.storage.local.get('ld_settings');
    const s = r.ld_settings || {};
    // 默认：点工具栏图标直接开 Chrome 浏览器侧边栏，不在页面里加侧栏。
    // 只有用户在设置里明确取消勾选才弹小窗。
    const openOnClick = s.openSidebarOnClick !== false;
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openOnClick });
    }
  } catch (e) {}
}
// 安装或更新时：绝不覆盖用户已有设置；若 local 为空则尝试从 chrome.storage.sync 恢复备份
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const r = await chrome.storage.local.get('ld_settings');
    let existing = r && r.ld_settings;
    if (!existing || !Object.keys(existing).length) {
      try {
        const sr = await chrome.storage.sync.get('ld_settings_backup');
        if (sr && sr.ld_settings_backup && Object.keys(sr.ld_settings_backup).length) {
          existing = sr.ld_settings_backup;
        }
      } catch (e) {}
    }
    if (existing && Object.keys(existing).length) {
      await chrome.storage.local.set({ ld_settings: existing });
    }
  } catch (e) {}
  applyPanelBehavior();
});
chrome.runtime.onStartup.addListener(applyPanelBehavior);
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === 'local' && ch.ld_settings) applyPanelBehavior();
});


// 后台自动过 CF（单飞锁 + 3 分钟冷却）：仅在直接 fetch 被 CF 拦截且无已打开论坛页时触发
let cfPassPromise = null;
let lastCfPassAt = 0;

async function runAutoPassCF(kind) {
  const now = Date.now();
  if (cfPassPromise) return cfPassPromise;
  if (now - lastCfPassAt < 180000) {
    return { ok: false, error: '刚刚已尝试后台过验证，请稍后再点刷新或手动打开论坛' };
  }
  lastCfPassAt = now;
  cfPassPromise = (async () => {
    let tab = null;
    try {
      tab = await chrome.tabs.create({ url: 'https://linux.do/', active: false });
      const deadline = Date.now() + 9000;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 900));
        // 先试让该页面直接拉 JSON（带完整 CF 上下文）
        try {
          const via = await chrome.tabs.sendMessage(tab.id, { type: 'fetch-via-page', kind: kind || 'top' });
          if (via && via.ok) return via;
        } catch (e) {}
        // 再试后台 fetch（此时 cf_clearance cookie 可能已经写入）
        try {
          const url = kind === 'new' ? 'https://linux.do/latest.json' : 'https://linux.do/top.json';
          const r = await fetch(url, { credentials: 'include', cache: 'no-store', headers: { 'Accept': 'application/json' } });
          if (r.ok) {
            const text = await r.text();
            if (!text.trim().startsWith('<')) return { ok: true, data: JSON.parse(text) };
          }
        } catch (e) {}
      }
      return { ok: false, error: '后台未能自动通过 Cloudflare（可能需要人工点击人机验证或更换节点）' };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    } finally {
      if (tab && tab.id) { try { await chrome.tabs.remove(tab.id); } catch (e) {} }
      cfPassPromise = null;
    }
  })();
  return cfPassPromise;
}


// 扩展自身更新检测：优先查 GitHub Releases latest，没有 Release 时回退查 main 分支 manifest.json
const EXT_REPO = 'Luvroxanne/linuxdo-lite';

function compareSemver(a, b) {
  const pa = String(a || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

async function checkExtensionUpdate() {
  const currentVersion = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '0.0.0';
  const relUrl = `https://api.github.com/repos/${EXT_REPO}/releases/latest`;
  const rawUrl = `https://raw.githubusercontent.com/${EXT_REPO}/main/manifest.json`;
  const repoUrl = `https://github.com/${EXT_REPO}`;
  let latestVersion = '';
  let downloadUrl = `${repoUrl}/releases/latest`;
  let releaseUrl = `${repoUrl}/releases/latest`;
  let notes = '';
  let source = 'release';

  try {
    const r = await fetch(relUrl, { cache: 'no-store', headers: { 'Accept': 'application/vnd.github+json' } });
    if (r.ok) {
      const j = await r.json();
      latestVersion = String(j.tag_name || j.name || '').replace(/^v/i, '');
      releaseUrl = j.html_url || releaseUrl;
      notes = String(j.body || '').slice(0, 300);
      const zipAsset = (j.assets || []).find(a => a && /\.zip$/i.test(a.name || ''));
      downloadUrl = (zipAsset && zipAsset.browser_download_url) || j.zipball_url || releaseUrl;
    }
  } catch (e) {}

  if (!latestVersion) {
    source = 'manifest';
    const r2 = await fetch(rawUrl, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if (!r2.ok) throw new Error('无法连接 GitHub（HTTP ' + r2.status + '）');
    const j2 = await r2.json();
    latestVersion = String(j2.version || '').replace(/^v/i, '');
    downloadUrl = `${repoUrl}/archive/refs/heads/main.zip`;
    releaseUrl = repoUrl;
  }

  if (!latestVersion) throw new Error('未解析到远端版本号');
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
  return { ok: true, currentVersion, latestVersion, hasUpdate, downloadUrl, releaseUrl, notes, source };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'check-ext-update') { checkExtensionUpdate().then(sendResponse).catch(e => sendResponse({ ok: false, error: String(e.message || e) })); return true; }
  if (msg.type === 'auto-pass-cf') { runAutoPassCF(msg.kind).then(sendResponse); return true; }
  if (msg.type === 'set-panel-behavior') { applyPanelBehavior().then(() => sendResponse({ ok: true })); return true; }
  // Connect 精确数据：后台直接拉 https://connect.linux.do/（带登录态），
  // 侧边栏再用 DOMParser 解析那张“信任级别 3 的要求”卡片。之前用 /summary.json
  // 全周期数当参考是错的：比如 R0xanne 全周期已读 55,909，100 天内只有 13,128/20,000，
  // 全周期看是“已达标”，Connect 看是未达到，还差浏览帖子这一项。
  if (msg.type === 'fetch-connect') {
    fetch('https://connect.linux.do/', { credentials: 'include', headers: { 'Accept': 'text/html,application/xhtml+xml' } })
      .then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); sendResponse({ ok: true, html: await r.text() }); })
      .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // LDC：官方实时积分脚本就是调这个接口：GET https://credit.linux.do/api/v1/oauth/user-info，
  // 返回 data.available_balance（可用）、data.community_balance（社区积分底数）等。
  // 再拿 /u/{用户名}.json 里的 gamification_score 减 community_balance，就是今日实时新增（未结转）。
  if (msg.type === 'fetch-ldc') {
    fetch('https://credit.linux.do/api/v1/oauth/user-info', { credentials: 'include', cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(async r => {
        const text = await r.text();
        if (r.status === 401) throw new Error('未登录 credit.linux.do');
        if (text.trim().startsWith('<')) throw new Error('被 Cloudflare 拦截（HTTP ' + r.status + '）');
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = JSON.parse(text);
        sendResponse({ ok: true, data: j });
      })
      .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // LDC 链接自动取标题：后台拉一下页面，取 <title> 当名字。读不到就由调用方用域名兜底。
  if (msg.type === 'fetch-title') {
    fetch(msg.url, { credentials: 'omit', headers: { 'Accept': 'text/html,application/xhtml+xml' } })
      .then(async r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const html = await r.text();
        const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = m ? m[1].replace(/\s+/g, ' ').trim() : '';
        if (!title) throw new Error('没有 title');
        sendResponse({ ok: true, title });
      })
      .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  // AI 总结：key 只存在本地 chrome.storage.local，调用时才发给用户自己选的服务商。
  // 只支持 OpenAI 兼容的 /chat/completions（OpenAI / DeepSeek / Grok 等都兼容）。
  if (msg.type === 'ai-test') {
    (async () => {
      try {
        const s = (await chrome.storage.local.get('ld_settings')).ld_settings || {};
        if (!s.aiKey) throw new Error('先在设置里填 key');
        const base = (s.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        // 先试 /models。很多本地中转只提供 /chat/completions，没有 /models，
        // /models 404 不代表服务不通，所以 /models 失败时再试一次最小的聊天请求。
        let lastErr = '';
        try {
          const r = await fetch(base + '/models', { headers: { 'Authorization': 'Bearer ' + s.aiKey } });
          if (r.ok) { sendResponse({ ok: true }); return; }
          lastErr = 'GET /models 返回 HTTP ' + r.status;
        } catch (e) { lastErr = '连不上 ' + base + '：' + (e.message || e) + '（服务没在跑、端口不对、或扩展没权限访问本地地址）'; }
        try {
          const r2 = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.aiKey }, body: JSON.stringify({ model: s.aiModel || 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }) });
          if (r2.ok) { sendResponse({ ok: true }); return; }
          throw new Error('POST /chat/completions 返回 HTTP ' + r2.status + '：' + (await r2.text()).slice(0, 200));
        } catch (e) { throw new Error(lastErr + '；聊天接口也失败：' + (e.message || e)); }
      } catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
    })();
    return true;
  }
  if (msg.type === 'ai-summarize') {
    (async () => {
      try {
        const s = (await chrome.storage.local.get('ld_settings')).ld_settings || {};
        if (!s.aiKey) throw new Error('先在设置里填 key');
        const base = (s.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        const model = s.aiModel || 'gpt-4o-mini';
        const text = String(msg.text || '').slice(0, 8000);
        if (!text.trim()) throw new Error('没拿到帖子正文（先打开一个帖子页）');
        const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.aiKey }, body: JSON.stringify({ model, temperature: 0.3, messages: [{ role: 'system', content: '用中文简要总结以下论坛帖子：先给一句话结论，再列 3-5 条要点。只总结，不发帖。' }, { role: 'user', content: text }] }) });
        if (!r.ok) throw new Error('HTTP ' + r.status + '：' + (await r.text()).slice(0, 200));
        const j = await r.json();
        sendResponse({ ok: true, summary: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '' });
      } catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
    })();
    return true;
  }
  if (msg.type === 'fetch-upstream') {
    fetch('https://raw.githubusercontent.com/czm15053/linuxdo-idea-ui/main/linuxdo-im.user.js', { headers: { 'Accept': 'text/plain' } })
      .then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); const text = await r.text(); const m = text.match(/@version\s+([0-9.]+)/); sendResponse({ ok: true, text, version: m ? m[1] : '' }); })
      .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
  if (msg.type !== 'fetch-topics') return;
  // “最新”走 /latest.json（公开的）。/new.json 要登录，匿名直接 403，就是之前老报 403 的原因之一。
  const url = msg.kind === 'new' ? 'https://linux.do/latest.json' : 'https://linux.do/top.json';
  fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } })
    .then(async r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const text = await r.text();
      // Cloudflare 验证页是 HTML，不是 JSON，直接报出来，别当成“网络异常”糊弄
      if (text.trim().startsWith('<')) throw new Error('Cloudflare 验证页（先打开 linux.do 首页过一次验证）');
      sendResponse({ ok: true, data: JSON.parse(text) });
    })
    .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
  return true; // 异步回复
});
