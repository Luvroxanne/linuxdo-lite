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
  let downloadKind = 'release';
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
      const zipAsset = (j.assets || []).find(a => a && /^linuxdo-lite\.zip$/i.test(a.name || ''))
        || (j.assets || []).find(a => a && /\.zip$/i.test(a.name || ''));
      // 固定用 Release 附件名 linuxdo-lite.zip；没有附件才退回同标签的固定下载地址，
      // 不要用 zipball（会下成 linuxdo-lite-<hash>.zip，还不是可直接加载的目录结构）。
      downloadUrl = (zipAsset && zipAsset.browser_download_url)
        || (latestVersion ? `${repoUrl}/releases/download/v${latestVersion}/linuxdo-lite.zip` : `${repoUrl}/releases/latest/download/linuxdo-lite.zip`);
    }
  } catch (e) {}

  if (!latestVersion) {
    source = 'manifest';
    const r2 = await fetch(rawUrl, { cache: 'no-store', headers: { 'Accept': 'application/json' } });
    if (!r2.ok) throw new Error('无法连接 GitHub（HTTP ' + r2.status + '）');
    const j2 = await r2.json();
    latestVersion = String(j2.version || '').replace(/^v/i, '');
    // Releases API 被限流/被墙时，先确认对应标签的 Release 包是否存在：
    // 存在就下 linuxdo-lite.zip；只有真的没有 Release 才退到 main 源码包。
    const zipUrl = `${repoUrl}/releases/download/v${latestVersion}/linuxdo-lite.zip`;
    let hasZip = false;
    try {
      const h = await fetch(zipUrl, { method: 'HEAD', cache: 'no-store' });
      hasZip = !!(h && h.ok);
    } catch (e) {}
    if (hasZip || !latestVersion) {
      downloadUrl = zipUrl;
      downloadKind = 'release';
    } else {
      downloadUrl = `${repoUrl}/archive/refs/heads/main.zip`;
      downloadKind = 'source';
    }
    releaseUrl = repoUrl;
  }

  if (!latestVersion) throw new Error('未解析到远端版本号');
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0;
  return { ok: true, currentVersion, latestVersion, hasUpdate, downloadUrl, downloadKind, releaseUrl, notes, source };
}

// ---------- AI 速读 ----------
// 长帖先分段速读（并发 3 段），再汇总成最终速读卡；最终一步流式返回，边生成边显示。
// 只在后台调用户自己配置的 OpenAI 兼容接口，Key 不发往任何第三方。
const AI_MAX_CHARS = 30000;
const AI_CHUNK_CHARS = 6000;
const AI_MAX_CHUNKS = 6;
const AI_CONCURRENCY = 3;

const AI_MAP_SYSTEM = '你在为一篇较长的中文论坛帖做分段速读。把这一段压缩成 4-8 条要点，每条一行，只保留事实、结论、方法、争议和可操作信息；不要寒暄，不要编造。';

function aiSystemPrompt(style) {
  const parts = [
    '你是论坛速读助手，把帖子压缩成 30 秒能读完的速读卡。用简体中文，严格按下面的 Markdown 结构输出，不要寒暄、不要复述要求、不要编造内容：',
    '## 一句话结论',
    '（不超过 40 字，讲清这篇帖子在说什么、结论是什么）',
    '## 核心要点',
    '- 3~6 条，每条不超过 50 字，只保留事实、结论和可操作信息'
  ];
  if (style === 'deep') {
    parts.push('## 关键细节');
    parts.push('- 3~5 条技术细节、参数、踩坑或成本数据；没有就写“文中未提供”');
  }
  parts.push('## 讨论与分歧');
  parts.push('- 2~4 条评论区有价值的补充、反对意见或纠正；没有就写“评论区无明显分歧”');
  parts.push('## 值不值得读');
  parts.push('一句话说明适合谁读、能不能跳过；文中如果有链接、代码、工具或资源，直接点名');
  return parts.join('\n');
}

function aiChunk(text, maxChars) {
  const max = maxChars || AI_CHUNK_CHARS;
  const paragraphs = String(text || '').split(/\n{2,}/);
  const chunks = [];
  let cur = '';
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (p.length > max) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let j = 0; j < p.length; j += max) chunks.push(p.slice(j, j + max));
      continue;
    }
    if (cur && cur.length + p.length + 2 > max) { chunks.push(cur); cur = p; }
    else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function aiConfig() {
  const s = (await chrome.storage.local.get('ld_settings')).ld_settings || {};
  if (!s.aiKey) throw new Error('还没配置 AI Key：打开侧边栏 → 设置 → AI 总结，填一个 Key 就行');
  return {
    key: s.aiKey,
    base: String(s.aiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model: s.aiModel || 'gpt-4o-mini'
  };
}

function aiHttpError(status, body, base) {
  if (status === 401) return 'API Key 无效或没有权限（401），检查设置里的 Key';
  if (status === 403) return '接口拒绝访问（403），检查 Key 的模型权限或地区限制';
  if (status === 404) return '接口地址或模型名不对（404）：' + base;
  if (status === 429) return '请求太频繁或额度用尽（429），稍后重试或换模型';
  if (status >= 500) return '服务端错误（' + status + '），稍后重试';
  return 'HTTP ' + status + '：' + String(body || '').slice(0, 200);
}

// 同时兼容 SSE 流式与非流式中转：有些反代忽略 stream=true 直接回 JSON。
async function aiChat(req) {
  const r = await fetch(req.base + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + req.key },
    body: JSON.stringify({
      model: req.model,
      temperature: typeof req.temperature === 'number' ? req.temperature : 0.25,
      max_tokens: req.maxTokens || 1200,
      stream: !!req.stream,
      messages: req.messages
    }),
    signal: req.signal
  });
  if (!r.ok) throw new Error(aiHttpError(r.status, await r.text().catch(function () { return ''; }), req.base));

  const ct = String((r.headers && r.headers.get && r.headers.get('content-type')) || '').toLowerCase();
  if (!req.stream || !r.body || (ct && ct.indexOf('text/event-stream') < 0)) {
    const j = await r.json();
    const text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (!text.trim()) throw new Error('接口没有返回内容');
    if (req.onDelta) req.onDelta(text);
    return { text: text, usage: j.usage || null };
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let full = '';
  let usage = null;
  let done = false;
  while (!done) {
    const part = await reader.read();
    if (part.done) break;
    buf = (buf + dec.decode(part.value, { stream: true })).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = block.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('data:') !== 0) continue;
        const data = lines[i].slice(5).trim();
        if (data === '[DONE]') { done = true; break; }
        if (!data) continue;
        let j;
        try { j = JSON.parse(data); } catch (e) { continue; }
        if (j.usage) usage = j.usage;
        const d = (j.choices && j.choices[0] && ((j.choices[0].delta && j.choices[0].delta.content) || (j.choices[0].message && j.choices[0].message.content))) || '';
        if (d) { full += d; if (req.onDelta) req.onDelta(d); }
      }
      if (done) break;
    }
  }
  if (!full.trim()) throw new Error('接口没有返回内容');
  return { text: full, usage: usage };
}

async function aiMapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = [];
  const n = Math.min(limit, items.length);
  for (let w = 0; w < n; w++) {
    workers.push((async function () {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i], i);
      }
    })());
  }
  await Promise.all(workers);
  return results;
}

async function runAiSummary(opts) {
  const send = opts.send || function () {};
  const cfg = await aiConfig();
  const style = opts.style === 'deep' ? 'deep' : 'brief';
  const full = String(opts.text || '').slice(0, AI_MAX_CHARS);
  if (!full.trim()) throw new Error('没拿到帖子正文，确认当前打开的是帖子页');

  const chunks = aiChunk(full, AI_CHUNK_CHARS).slice(0, AI_MAX_CHUNKS);
  const sys = aiSystemPrompt(style);
  const titleLine = opts.title ? '标题：' + opts.title + '\n\n' : '';
  let messages;

  if (chunks.length <= 1) {
    send({ type: 'stage', text: '正在生成速读卡…' });
    messages = [
      { role: 'system', content: sys },
      { role: 'user', content: titleLine + '正文：\n' + full }
    ];
  } else {
    send({ type: 'stage', text: '长帖分段速读：共 ' + chunks.length + ' 段…' });
    const partials = await aiMapLimit(chunks, AI_CONCURRENCY, async function (chunk, i) {
      const part = await aiChat({
        key: cfg.key,
        base: cfg.base,
        model: cfg.model,
        messages: [
          { role: 'system', content: AI_MAP_SYSTEM },
          { role: 'user', content: '第 ' + (i + 1) + '/' + chunks.length + ' 段：\n' + chunk }
        ],
        maxTokens: 500,
        stream: false,
        signal: opts.signal
      });
      send({ type: 'stage', text: '已速读 ' + (i + 1) + '/' + chunks.length + ' 段…' });
      return part.text.trim();
    });
    messages = [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: titleLine + '以下是长帖按原文顺序分段速读后的要点，请据此汇总成最终速读卡：\n\n' +
          partials.map(function (p, i) { return '【第' + (i + 1) + '段】\n' + p; }).join('\n\n')
      }
    ];
    send({ type: 'stage', text: '正在汇总成速读卡…' });
  }

  const started = Date.now();
  const out = await aiChat({
    key: cfg.key,
    base: cfg.base,
    model: cfg.model,
    messages: messages,
    maxTokens: style === 'deep' ? 1600 : 1100,
    stream: opts.stream !== false,
    signal: opts.signal,
    onDelta: function (d) { send({ type: 'delta', text: d }); }
  });
  send({ type: 'stage', text: '' });
  return {
    text: out.text,
    meta: { model: cfg.model, style: style, chunks: chunks.length, chars: full.length, ms: Date.now() - started, usage: out.usage }
  };
}

// 流式通道：内容页 / 侧边栏 connect 进来，后台边拉模型边回传 delta。
chrome.runtime.onConnect.addListener(function (port) {
  if (port.name !== 'ld-ai-summarize') return;
  let controller = null;
  port.onDisconnect.addListener(function () {
    if (controller) { try { controller.abort(); } catch (e) {} }
  });
  port.onMessage.addListener(function (msg) {
    if (!msg || msg.type !== 'summarize') return;
    controller = new AbortController();
    const send = function (m) { try { port.postMessage(m); } catch (e) {} };
    runAiSummary({ text: msg.text, style: msg.style, title: msg.title, signal: controller.signal, send: send, stream: true })
      .then(function (res) { send({ type: 'done', meta: res.meta }); })
      .catch(function (e) {
        if (controller.signal.aborted) send({ type: 'error', error: '已停止' });
        else send({ type: 'error', error: String(e.message || e) });
      });
  });
});

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
  // 非流式兜底：流式通道不可用（扩展刚更新、连接被中断）时仍能出结果。
  if (msg.type === 'ai-summarize') {
    (async () => {
      try {
        const res = await runAiSummary({ text: msg.text, style: msg.style, title: msg.title, stream: false });
        sendResponse({ ok: true, summary: res.text, meta: res.meta });
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
