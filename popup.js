// LinuxDo 看帖 Lite v1.2 - popup.js（弹窗和侧边栏共用）
// 看帖：最热/最新 + 收藏；设置：主题/摸鱼/屏蔽/快捷回复/自定义CSS/导入导出
let kind = 'top';
const $ = id => document.getElementById(id);
const listEl = $('list'), statusEl = $('status');
const DEFAULTS = {
  theme: 'default', newTab: true, showTime: true, showFloor: false,
  hideSignature: true, hideImages: false, onlyOP: false, privacy: false,
  blockUsers: '', blockKeywords: '', quickReplies: '感谢分享！\n学习了，收藏了\n+1，支持一下',
  customCSS: '', bossKey: true, openSidebarOnClick: true, floatSidebar: false, floatOpen: false,
  upstreamIM: false, upstreamSkin: 'dingtalk', upstreamVersion: '1.3.7', hideRead: true, readBoost: true, autoCF: true,
  aiProvider: 'openai', aiKey: '', aiModel: 'gpt-4o-mini', aiBaseUrl: 'https://api.openai.com/v1',
  ldcLinks: 'LDC 余额|https://credit.linux.do\nLD士多|https://ldcstore.com/\nHUB 站|https://hub.linux.do\n排行榜|https://linux.do/leaderboard/1'
};
let settings = { ...DEFAULTS };
let settingsLoaded = false;
let showRead = false; // 临时开关：点“显示已读”就把已读的也列出来，不存设置

function relTime(s) {
  if (!s) return '';
  const d = (Date.now() - new Date(s).getTime()) / 1000;
  if (d < 60) return '刚刚';
  if (d < 3600) return Math.floor(d / 60) + '分钟前';
  if (d < 86400) return Math.floor(d / 3600) + '小时前';
  return Math.floor(d / 86400) + '天前';
}
function showStatus(msg, isErr) { if (!statusEl) return; statusEl.textContent = msg; statusEl.className = 'show' + (isErr ? ' err' : ''); }
function hideStatus() { if (!statusEl) return; statusEl.className = ''; statusEl.textContent = ''; }

let toastTimer = null;
function showToast(msg) {
  const el = $('set-saved');
  if (!el || !msg) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}


// ---------- 收藏 ----------
async function getFavs() { const r = await chrome.storage.local.get('ld_favorites'); return r.ld_favorites || []; }
async function toggleFav(t) {
  let favs = await getFavs();
  const i = favs.findIndex(f => f.id === t.id);
  if (i >= 0) favs.splice(i, 1); else favs.unshift({ id: t.id, title: t.title, url: `https://linux.do/t/${t.slug || 'topic'}/${t.id}` });
  await chrome.storage.local.set({ ld_favorites: favs });
  renderFavs(); load(); // 刷新星星状态
}
async function renderFavs() {
  const el = $('fav-list'); if (!el) return;
  const emptyEl = $('fav-empty');
  const favs = await getFavs();
  el.innerHTML = '';
  if (emptyEl) emptyEl.hidden = favs.length > 0;
  if (!favs.length) return;
  favs.forEach(f => {
    const wrap = document.createElement('div'); wrap.className = 'item';
    const a = document.createElement('a'); a.style.flex = '1'; a.style.color = 'inherit'; a.href = f.url; a.target = '_blank';
    a.innerHTML = `<div class="t"></div>`;
    a.querySelector('.t').textContent = f.title;
    a.addEventListener('click', e => { e.preventDefault(); chrome.tabs.create({ url: f.url }); });
    const rm = document.createElement('button'); rm.className = 'item-star on'; rm.textContent = '★'; rm.title = '取消收藏';
    rm.onclick = () => toggleFav({ id: f.id, title: f.title, slug: 'topic' });
    wrap.appendChild(a); wrap.appendChild(rm); el.appendChild(wrap);
  });
}

// ---------- 已读：点开过的帖子就从最热/最新里消失（跟原版 linuxdo-scripts 一样） ----------
// 已读存在 chrome.storage.local 的 ld_read_topics 里：{帖子id: 时间戳}，只存 id，不存标题。
// 论坛页里点开帖子也会记（content.js 里记），所以在论坛里看过的，下次进侧边栏也不再出现。
async function getRead() { const r = await chrome.storage.local.get('ld_read_topics'); return r.ld_read_topics || {}; }
async function markRead(id) {
  if (!id) return;
  const read = await getRead(); read[String(id)] = Date.now();
  // 只留最近 300 条，减少存储与内存占用
  const keys = Object.keys(read);
  if (keys.length > 300) {
    keys.sort((a, b) => read[b] - read[a]).slice(300).forEach(k => delete read[k]);
  }
  await chrome.storage.local.set({ ld_read_topics: read });
}
async function clearRead() { await chrome.storage.local.set({ ld_read_topics: {} }); showRead = false; updateReadBar(0); load(); }
function updateReadBar(hiddenCount) {
  const bar = $('read-bar'); if (!bar) return;
  if (!settings.hideRead) { bar.innerHTML = ''; return; }
  if (hiddenCount <= 0 && !showRead) { bar.innerHTML = ''; return; }
  bar.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = showRead ? `正在显示已读（共 ${hiddenCount} 个已读）` : `已隐藏 ${hiddenCount} 个看过的帖子`;
  const btn = document.createElement('button');
  btn.textContent = showRead ? '只看未读' : '显示已读';
  btn.onclick = () => { showRead = !showRead; load(); };
  const clr = document.createElement('button');
  clr.textContent = '清空已读';
  clr.onclick = clearRead;
  bar.appendChild(span); bar.appendChild(btn); bar.appendChild(clr);
}

// ---------- 等级：升三级进度（只看进度，不自动刷帖） ----------
// 目标数字抄的是 Discourse 信任等级 + 上游 linuxdo-idea-ui 里 SEC_TL1/2/3 的口径，
// 也是 connect.linux.do 上那张卡的口径。注意：升三级考核是近 100 天滚动窗口，
// Discourse 的 /summary.json 只给全周期总数，所以这里标“参考”，精确数以 Connect 为准。
// 每天凌晨 4 点统计一次，突击刷没用，100 天窗口会把它稀释掉，掉下来过三回的都是阅读量不够。
const TL_NAMES = ['新用户', '基本用户', '成员', '常客', '领导者'];
const TL_SECTIONS = {
  0: [{ title: '活跃', items: [{ label: '浏览话题', target: 5, v: s => s.topics_entered }, { label: '已读帖子', target: 30, v: s => s.posts_read_count }] }, { title: '互动', items: [{ label: '阅读时间', target: 10, unit: '分钟', v: s => Math.floor((s.time_read || 0) / 60) }] }],
  1: [{ title: '活跃', items: [{ label: '访问天数', target: 15, v: s => s.days_visited }, { label: '浏览话题', target: 20, v: s => s.topics_entered }, { label: '已读帖子', target: 100, v: s => s.posts_read_count }] }, { title: '互动', items: [{ label: '给出赞', target: 1, v: s => s.likes_given }, { label: '获得赞', target: 1, v: s => s.likes_received }, { label: '回复话题', target: 3, approx: true, v: s => Math.max(0, (s.post_count || 0) - (s.topic_count || 0)) }, { label: '阅读时间', target: 60, unit: '分钟', v: s => Math.floor((s.time_read || 0) / 60) }] }],
  2: [{ title: '活跃（近 100 天，参考）', items: [{ label: '访问天数', target: 50, approx: true, v: s => s.days_visited }, { label: '浏览话题', target: 500, approx: true, v: s => s.topics_entered }, { label: '浏览帖子', target: 20000, approx: true, v: s => s.posts_read_count }] }, { title: '互动', items: [{ label: '回复话题', target: 10, approx: true, v: s => Math.max(0, (s.post_count || 0) - (s.topic_count || 0)) }, { label: '点赞', target: 30, approx: true, v: s => s.likes_given }, { label: '获赞', target: 20, approx: true, v: s => s.likes_received }, { label: '浏览话题（全周期）', target: 200, v: s => s.topics_entered }, { label: '已读帖子（全周期）', target: 500, v: s => s.posts_read_count }] }]
};
async function fetchLevelData() {
  const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
  for (const tab of tabs) {
    try { const res = await chrome.tabs.sendMessage(tab.id, { type: 'get-level-data' }); if (res && res.ok) return res; } catch (e) {}
  }
  return { ok: false, error: '先打开 linux.do 登录，再点刷新' };
}
// 解析 connect.linux.do 的卡片：照抄上游 IM 的 parseConnectCard 做法。
// 之前我的写法是全卡片里按标签找数字，标签带图标/空格就找不到，
// 所以解析失败、静默退回全周期数，还显示“已达标”。
// 上游做法：先按“活跃程度 / 互动参与 / 合规记录”分区，再在分区里按标签找“当前 / 目标”。
function parseConnect(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const card = [...doc.querySelectorAll('div.card, .card')].find(d => /信任级别.*的要求/.test(((d.querySelector('h2, [class*=\"card-title\"]') || {}).textContent) || ''));
    if (!card) return null;
    const title = ((card.querySelector('h2, [class*=\"card-title\"]') || {}).textContent) || '';
    const m = title.match(/信任级别\s*(\d+)/);
    const targetLevel = m ? Number(m[1]) : null;
    const achieved = /已达到|已达标/.test(((card.querySelector('.badge, [class*=\"badge\"]') || {}).textContent) || '');
    const num = x => parseFloat(String(x ?? '0').replace(/[,\s]/g, '')) || 0;
    const leafByText = (scope, text) => [...scope.querySelectorAll('*')].find(el => !el.children.length && el.textContent.trim() === text);
    const sectionOf = title2 => { const leaf = leafByText(card, title2); return (leaf && leaf.nextElementSibling) || null; };
    const pairOf = (scope, label) => {
      if (!scope) return null;
      let node = (leafByText(scope, label) || {}).parentElement;
      while (node && node !== card) {
        const mm = (node.textContent || '').match(/([\d,]+)\s*\/\s*([\d,]+)/);
        if (mm) return { label, cur: num(mm[1]), target: num(mm[2]) };
        node = node.parentElement;
      }
      return null;
    };
    const activity = sectionOf('活跃程度');
    const interaction = sectionOf('互动参与');
    const compliance = sectionOf('合规记录');
    if (!activity || !interaction) return null;
    return {
      targetLevel, achieved,
      activity: ['访问天数', '浏览话题', '浏览帖子'].map(l => pairOf(activity, l)).filter(Boolean),
      interaction: ['回复话题', '点赞', '获赞', '获赞天数', '获赞用户'].map(l => pairOf(interaction, l)).filter(Boolean),
      quota: compliance ? ['被举报帖子', '举报用户'].map(l => pairOf(compliance, l)).filter(Boolean) : [],
    };
  } catch (e) { return null; }
}
// 经 Connect 页本身取数：先试后台 fetch，不行就用已打开的 connect.linux.do 页，
// 还没有就悄悄开一个不激活的页，等它加载完、取完 HTML 再关掉。
// 后台 fetch 经常被 Cloudflare / 登录态拦住，这是之前等级页总退回全周期数的原因。
// 仅复用已打开的 connect.linux.do 标签页，绝不自动新建或关闭窗口
async function fetchConnectViaTab() {
  const tabs = await chrome.tabs.query({ url: 'https://connect.linux.do/*' });
  const tab = tabs[0];
  if (!tab) return null;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-page-html' });
    if (r && r.ok && r.html && r.html.length > 1000) return { html: r.html, tabId: tab.id };
  } catch (e) {}
  return null;
}
// 仅复用已打开的 credit.linux.do 标签页，绝不自动新建或关闭窗口
async function fetchLdcViaTab() {
  const tabs = await chrome.tabs.query({ url: 'https://credit.linux.do/*' });
  const tab = tabs[0];
  if (!tab) return null;
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'same-origin-fetch', url: 'https://credit.linux.do/api/v1/oauth/user-info', accept: 'application/json' });
    if (r && r.ok && r.text) { const j = JSON.parse(r.text); if (j && j.data) return j.data; }
  } catch (e) {}
  return null;
}
async function renderLevel() {
  const el = $('level-body'); if (!el) return;
  el.innerHTML = '加载中…';
  // 1) Connect 精确数（100 天窗口）：先后台 fetch，不行再读已打开的 Connect 页，最后回退本地缓存（不自动弹窗）
  let connect = null, connectErr = '';
  try { const r = await chrome.runtime.sendMessage({ type: 'fetch-connect' }); if (r && r.ok) connect = parseConnect(r.html); else connectErr = (r && r.error) || '后台未获取'; } catch (e) { connectErr = String(e.message || e); }
  if (!connect) {
    try { const via = await fetchConnectViaTab(); if (via) connect = parseConnect(via.html); } catch (e) {}
  }
  if (connect) {
    chrome.storage.local.set({ cache_level_connect: { data: connect, at: Date.now() } }).catch(() => {});
  } else {
    try {
      const cr = await chrome.storage.local.get(['cache_level_connect', 'cache_connect_html']);
      if (cr.cache_connect_html && cr.cache_connect_html.html) connect = parseConnect(cr.cache_connect_html.html);
      if (!connect && cr.cache_level_connect && cr.cache_level_connect.data) connect = cr.cache_level_connect.data;
    } catch (e) {}
  }
  const res = await fetchLevelData();
  if (!res || !res.ok) { el.innerHTML = '<div class="empty">拉不到等级数据：' + (res && res.error || '未知') + '。先打开 linux.do 登录。</div>'; return; }
  const d = res.data, s = d.summary || {}, level = d.trust_level || 0;
  const read = await getRead();
  const today = Object.values(read).filter(x => new Date(x).toDateString() === new Date().toDateString()).length;
  // LDC：先后台调官方接口，不行再经已打开的 credit 页，最后回退本地缓存，并显示真实失败原因
  let ldcData = null, ldcErr = '', ldcFromCache = false;
  try {
    const lr = await chrome.runtime.sendMessage({ type: 'fetch-ldc' });
    if (lr && lr.ok && lr.data) {
      ldcData = lr.data.data || (lr.data.available_balance != null ? lr.data : null);
      if (!ldcData) ldcErr = '接口返回格式变更';
    } else if (lr && lr.error) {
      ldcErr = lr.error;
    }
  } catch (e) { ldcErr = String(e.message || e); }
  if (!ldcData) { try { ldcData = await fetchLdcViaTab(); } catch (e) {} }
  if (ldcData) {
    chrome.storage.local.set({ cache_level_ldc: { data: ldcData, at: Date.now() } }).catch(() => {});
  } else {
    try {
      const c = (await chrome.storage.local.get('cache_level_ldc')).cache_level_ldc;
      if (c && c.data) { ldcData = c.data; ldcFromCache = true; }
    } catch (e) {}
  }
  let ldcLine = '';
  if (ldcData) {
    const avail = ldcData.available_balance ?? ldcData.balance, comm = ldcData.community_balance;
    const inc = (d.gamification_score && comm != null) ? Math.max(0, d.gamification_score - comm) : null;
    ldcLine = '可用 ' + (avail != null ? avail : '—') + (inc != null ? ' · 今日约 +' + inc : '') + (ldcFromCache ? '（缓存）' : '');
  } else {
    ldcLine = ldcErr ? ('未获取：' + ldcErr + '，点下方 LDC 余额登录一次即可同步') : '未获取，点下方 LDC 余额登录一次即可同步';
  }
  // LDC 链接：可展开，默认 4 个，设置里可以自己加（名字|网址，每行一个）
  const ldcLinks = parseLdcLinks(settings.ldcLinks);
  const ldcLinksHtml = ldcLinks.map(l => `<a class="lvl-link-chip" href="${l.url}" target="_blank">${l.name}</a>`).join('');
  let items, sourceNote, exact = false;
  if (connect && ((connect.activity && connect.activity.length) || (connect.interaction && connect.interaction.length))) {
    exact = true;
    items = [...(connect.activity || []), ...(connect.interaction || [])].map(it => ({ ...it, invert: false }));
    (connect.quota || []).forEach(it => items.push({ ...it, invert: true }));
    sourceNote = '精确数（Connect，近 100 天）';
  } else {
    const secs = TL_SECTIONS[level] || TL_SECTIONS[2];
    items = [];
    secs.forEach(sec => sec.items.forEach(it => { const cur = Number(it.v(s)) || 0; items.push({ label: it.label, cur, target: it.target, invert: false }); }));
    sourceNote = '参考数（全周期，不是 100 天）';
  }
  const isPass = it => it.invert ? it.cur <= it.target : it.cur >= it.target;
  const failing = items.filter(it => !isPass(it));
  const passing = items.filter(it => isPass(it));
  const row = it => {
    const pct = Math.max(0, Math.min(100, it.cur / it.target * 100));
    const bad = !isPass(it);
    return `<div class="lvl-row"><div class="lvl-head"><span>${it.label}</span><b>${it.cur.toLocaleString()} / ${it.target.toLocaleString()}</b></div><div class="lvl-bar"><i class="${bad ? 'warn' : ''}" style="width:${pct}%"></i></div></div>`;
  };
  // 关键：拉不到精确数时，全周期数再好看也不能说“已达标”，只能说“未确认”。
  const pill = exact ? (failing.length ? '未达到' : '已达标') : '未确认';
  const next = level >= 3 ? 'Lv3 保持中：不达标会降回 Lv2。' : (exact
    ? (failing.length ? `还差 ${failing.length} 项：${failing.map(f => f.label + ' ' + f.cur.toLocaleString() + '/' + f.target.toLocaleString()).join('，')}。` : '已达标，等每天凌晨 4 点统计。')
    : `未同步到 Connect 100 天数据，当前显示全周期参考（打开 <a href="https://connect.linux.do" target="_blank">connect.linux.do</a> 登录后点刷新即可同步）。`);
  el.innerHTML = `
    <div class="lvl-wrap">
      <div class="card">
        <div class="lvl-head2"><span class="lvl-cur">Lv${level}</span><b>${TL_NAMES[level] || ''}</b><span style="color:var(--text-2)">${d.username || ''}</span><span class="lvl-pill ${exact && !failing.length ? 'ok' : ''}">${pill}</span></div>
        <div class="lvl-sub">${next}</div>
        <div class="lvl-sub">今日已读 ${today} 帖 · ${sourceNote}</div>
      </div>
      <div class="card">
        ${failing.map(row).join('') || '<div class="lvl-sub" style="margin-top:0">当前各项已达标</div>'}
        ${passing.length ? `<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text-2)">已达标 ${passing.length} 项</summary><div style="margin-top:6px">${passing.map(row).join('')}</div></details>` : ''}
      </div>
      <div class="card">
        <div class="lvl-head"><b>LDC</b><span style="color:var(--text-2)">${ldcLine}</span></div>
        <div class="lvl-links">${ldcLinksHtml}</div>
      </div>
      <div class="card">
        <div class="lvl-btns"><button id="lvl-go-latest">最新帖</button><button id="lvl-go-top">最热帖</button></div>
        <div class="lvl-btns" style="margin-top:8px"><button id="lvl-rb-start" class="primary">自动读帖</button><button id="lvl-rb-stop" class="danger">停止</button><button id="lvl-rb-settings">参数</button></div>
        <div class="status-msg" id="lvl-rb-msg"></div>
      </div>
    </div>`;
  const gl = $('lvl-go-latest'); if (gl) gl.onclick = () => chrome.tabs.create({ url: 'https://linux.do/latest' });
  const gt = $('lvl-go-top'); if (gt) gt.onclick = () => chrome.tabs.create({ url: 'https://linux.do/top' });
  const lrs = $('lvl-rb-start'); if (lrs) lrs.onclick = () => triggerReadBoost('start', $('lvl-rb-msg'));
  const lrp = $('lvl-rb-stop'); if (lrp) lrp.onclick = () => triggerReadBoost('stop', $('lvl-rb-msg'));
  const lrc = $('lvl-rb-settings'); if (lrc) lrc.onclick = () => triggerReadBoost('settings', $('lvl-rb-msg'));
}
function parseLdcLinks(raw) {
  const def = 'LDC 余额|https://credit.linux.do\nLD士多|https://ldcstore.com/\nHUB 站|https://hub.linux.do\n排行榜|https://linux.do/leaderboard/1';
  const lines = String(raw || def).split('\n').map(x => x.trim()).filter(Boolean);
  return lines.map(line => {
    const i = line.indexOf('|');
    if (i < 0) {
      // 只填了网址：名字先用域名顶着，点“自动取标题”会再去读网页 title 换掉它
      let host = line;
      try { host = new URL(line.startsWith('http') ? line : 'https://' + line).hostname.replace(/^www\./, ''); } catch (e) {}
      const url = /^https?:\/\//i.test(line) ? line : 'https://' + line;
      return { name: host, url };
    }
    const name = line.slice(0, i).trim(), rawUrl = line.slice(i + 1).trim();
    const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : (rawUrl ? 'https://' + rawUrl : '');
    return { name: name || url, url };
  }).filter(l => l.url);
}

// ---------- 看帖列表 ----------

// 精简缓存对象：只保留列表渲染与屏蔽所需字段，减少 ~85% 存储与内存占用
function slimTopicData(data) {
  const usersById = {};
  (data && data.users ? data.users : []).forEach(u => { if (u && u.id != null) usersById[u.id] = u.username || ''; });
  const topics = ((data && data.topic_list && data.topic_list.topics) || []).slice(0, 50).map(tp => {
    const authors = [];
    if (tp.last_poster_username) authors.push(tp.last_poster_username);
    (tp.posters || []).forEach(pr => {
      const name = pr && pr.user_id != null ? usersById[pr.user_id] : '';
      if (name && !authors.includes(name)) authors.push(name);
    });
    return {
      id: tp.id,
      slug: tp.slug || 'topic',
      title: tp.title || '',
      excerpt: tp.excerpt ? String(tp.excerpt).slice(0, 120) : '',
      posts_count: tp.posts_count || 0,
      views: tp.views || 0,
      created_at: tp.created_at || '',
      last_posted_at: tp.last_posted_at || '',
      last_poster_username: tp.last_poster_username || '',
      _authors: authors
    };
  });
  return { topic_list: { topics } };
}

async function render(data) {
  if (!listEl) return;
  const allTopicsRaw = (data && data.topic_list && data.topic_list.topics) || [];
  // 屏蔽在侧边栏列表里也要生效：关键词查标题；用户查 last_poster_username 和 posters 对应的用户名
  const usersById = {};
  (data && data.users ? data.users : []).forEach(u => { if (u && u.id != null) usersById[u.id] = (u.username || '').toLowerCase(); });
  const bUsers = (settings.blockUsers || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean);
  const bKws = (settings.blockKeywords || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean);
  const allTopics = allTopicsRaw.filter(tp => {
    const hay = ((tp.title || '') + ' ' + (tp.excerpt || '')).toLowerCase();
    if (bKws.some(k => hay.includes(k))) return false;
    if (!bUsers.length) return true;
    const names = new Set();
    if (tp.last_poster_username) names.add(tp.last_poster_username.toLowerCase());
    (tp._authors || []).forEach(a => { if (a) names.add(String(a).toLowerCase()); });
    (tp.posters || []).forEach(pr => { if (pr.user_id != null && usersById[pr.user_id]) names.add(usersById[pr.user_id]); });
    return !bUsers.some(u => [...names].some(n => n && (n === u || n.includes(u))));
  });
  const read = await getRead();
  const hiddenCount = settings.hideRead && !showRead ? allTopics.filter(t => read[String(t.id)]).length : 0;
  const topics = settings.hideRead && !showRead ? allTopics.filter(t => !read[String(t.id)]) : allTopics;
  const favs = await getFavs();
  updateReadBar(hiddenCount);
  if (!topics.length) { listEl.innerHTML = '<div class="empty">' + (hiddenCount > 0 ? '这一页的都看过了，点上面“显示已读”可以再看' : '没有拿到帖子，点右上角刷新试试') + '</div>'; return; }
  listEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  topics.slice(0, 30).forEach(t => {
    const wrap = document.createElement('div'); wrap.className = 'item';
    const a = document.createElement('a'); a.style.flex = '1'; a.style.color = 'inherit';
    a.href = `https://linux.do/t/${t.slug || 'topic'}/${t.id}`;
    const isFav = favs.some(f => f.id === t.id);
    a.innerHTML = `<div class="t"></div><div class="m">${t.posts_count || 0} 回复 · ${t.views || 0} 浏览 · ${relTime(t.last_posted_at || t.created_at)}</div>`;
    a.querySelector('.t').textContent = t.title || '(无标题)';
    a.addEventListener('click', async e => { e.preventDefault(); await markRead(t.id); wrap.remove(); const r2 = await getRead(); updateReadBar(allTopics.filter(x => r2[String(x.id)]).length); chrome.tabs.create({ url: a.href }); });
    const star = document.createElement('button'); star.className = 'item-star' + (isFav ? ' on' : ''); star.textContent = isFav ? '★' : '☆'; star.title = isFav ? '取消收藏' : '收藏';
    star.onclick = () => toggleFav(t);
    wrap.appendChild(a); wrap.appendChild(star); frag.appendChild(wrap);
  });
  listEl.appendChild(frag);
}
async function fetchViaPage(msgType) {
  const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
  for (const tab of tabs) {
    try { const res = await chrome.tabs.sendMessage(tab.id, { type: msgType || 'fetch-via-page', kind }); if (res && res.ok) return res; } catch (e) {}
  }
  return { ok: false, error: '没有已打开的 linux.do 页面可中转' };
}
// 403 时自动过验证：后台悄悄开一个不激活的 linux.do 首页，等它加载完（Cloudflare 验证过去）、
// 再通过它中转拉一次，最后把这个临时页关掉。你不用再手动点“打开 linux.do”了。
async function autoVerifyAndRetry() {
  try {
    const existing = await chrome.tabs.query({ url: 'https://linux.do/*' });
    if (!existing.length) return { ok: false, error: '请先点右上角“论坛”打开 linux.do 首页' };
    await new Promise(r => setTimeout(r, 1500));
    const via = await fetchViaPage();
    if (via && via.ok) return via;
    const dom = await fetchViaPage('fetch-via-dom');
    if (dom && dom.ok) return dom;
    return { ok: false, error: '页面未能拉取数据，请刷新论坛页后重试' };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
async function load() {
  if (!listEl) return;
  // 先把缓存的列出来（已读的照样隐藏），再在后台刷新，别先给一屏红字
  const cached = (await chrome.storage.local.get('cache_' + kind))['cache_' + kind];
  if (cached && cached.data) { render(cached.data); if ($('time')) $('time').textContent = '缓存 · ' + new Date(cached.at).toLocaleString(); }
  else { showStatus('加载中…'); listEl.innerHTML = ''; }
  // 顺序：先走论坛页中转（页面里带 Cloudflare 凭证，最容易过），再走后台，最后扒页面 DOM。
  // “最新”走 /latest.json（公开的），不走 /new.json（那个要登录，匿名直接 403）。
  let lastErr = '';
  let res = await fetchViaPage();
  if (!res || !res.ok) {
    try {
      const bg = await chrome.runtime.sendMessage({ type: 'fetch-topics', kind });
      if (bg && bg.ok) res = bg;
      else if (bg && bg.error) lastErr = bg.error;
    } catch (e) { lastErr = String(e.message || e); }
  }
  if (!res || !res.ok) {
    const dom = await fetchViaPage('fetch-via-dom');
    if (dom && dom.ok) res = dom;
  }
  if (!res || !res.ok) {
    const existingTabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
    if (existingTabs.length) {
      const auto = await autoVerifyAndRetry();
      if (auto && auto.ok) res = auto;
      else if (auto && auto.error) lastErr = auto.error;
    } else if (settings.autoCF !== false) {
      showStatus('正在后台自动过 Cloudflare 验证…');
      try {
        const cf = await chrome.runtime.sendMessage({ type: 'auto-pass-cf', kind });
        if (cf && cf.ok) res = cf;
        else if (cf && cf.error) lastErr = cf.error;
      } catch (e) { lastErr = String(e.message || e); }
    }
  }
  if (res && res.ok) {
    const slim = slimTopicData(res.data);
    hideStatus(); render(slim);
    await chrome.storage.local.set({ ['cache_' + kind]: { data: slim, at: Date.now() } });
    if ($('time')) $('time').textContent = '刚刚更新';
    return;
  }
  if (cached && cached.data) { if ($('time')) $('time').textContent = '缓存 · ' + new Date(cached.at).toLocaleString(); }
  else listEl.innerHTML = '<div class="empty">拉不到帖子</div>';
  showStatus('拉取失败：' + (lastErr || (res && res.error) || '未知'), true);
}

// ---------- 设置 ----------
async function loadSettings() {
  const r = await chrome.storage.local.get('ld_settings');
  let stored = r && r.ld_settings;
  if (!stored || !Object.keys(stored).length) {
    try {
      const sr = await chrome.storage.sync.get('ld_settings_backup');
      if (sr && sr.ld_settings_backup && Object.keys(sr.ld_settings_backup).length) {
        stored = sr.ld_settings_backup;
        await chrome.storage.local.set({ ld_settings: stored });
      }
    } catch (e) {}
  }
  settings = { ...DEFAULTS, ...(stored || {}) };
  settingsLoaded = true;
  // 回填表单（只在侧边栏设置页有这些元素）
  const set = (id, v) => { const el = $(id); if (el) el.value = v; };
  const chk = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
  set('set-theme', settings.theme); chk('set-newTab', settings.newTab); chk('set-showTime', settings.showTime);
  chk('set-showFloor', settings.showFloor); chk('set-hideSignature', settings.hideSignature);
  chk('set-hideImages', settings.hideImages); chk('set-bossKey', settings.bossKey); chk('set-privacy', settings.privacy);
  chk('set-openSidebarOnClick', settings.openSidebarOnClick !== false); chk('set-floatSidebar', !!settings.floatSidebar); chk('set-hideRead', settings.hideRead !== false); chk('set-readBoost', settings.readBoost !== false); chk('set-autoCF', settings.autoCF !== false);
  set('set-blockUsers', settings.blockUsers); set('set-blockKeywords', settings.blockKeywords);
  set('set-aiProvider', settings.aiProvider || 'openai'); set('set-aiKey', settings.aiKey || ''); set('set-aiModel', settings.aiModel || 'gpt-4o-mini'); set('set-aiBaseUrl', settings.aiBaseUrl || 'https://api.openai.com/v1');
  set('set-ldcLinks', settings.ldcLinks || '');
  set('set-quickReplies', settings.quickReplies); set('set-customCSS', settings.customCSS);
  document.body.classList.toggle('theme-dark', settings.theme === 'dark');
  syncThemeGrid(settings.theme);
  syncAllChipEditors();
  renderLdcLinkRows();
}
async function saveSettings() {
  if (!settingsLoaded) return;
  const val = id => { const el = $(id); return el ? el.value : settings[id.replace('set-', '')]; };
  const checked = id => { const el = $(id); return el ? el.checked : settings[id.replace('set-', '')]; };
  // 主题和上游 IM 的映射：钉钉/飞书/企业微信走原版，其他走我们自己的简单主题
  const oldTheme = settings.theme;
  const themeVal = val('set-theme') || settings.theme;
  const upstreamSkins = ['dingtalk', 'feishu', 'wecom'];
  const upstreamIM = upstreamSkins.includes(themeVal);
  settings = {
    theme: themeVal, upstreamIM, upstreamSkin: upstreamIM ? themeVal : (settings.upstreamSkin || 'dingtalk'),
    upstreamVersion: settings.upstreamVersion || '1.3.7',
    newTab: checked('set-newTab'), showTime: checked('set-showTime'),
    showFloor: checked('set-showFloor'), hideSignature: checked('set-hideSignature'), hideImages: checked('set-hideImages'),
    bossKey: checked('set-bossKey'), privacy: checked('set-privacy'), openSidebarOnClick: checked('set-openSidebarOnClick'), floatSidebar: checked('set-floatSidebar'), floatOpen: settings.floatOpen !== false, hideRead: checked('set-hideRead'), readBoost: checked('set-readBoost'), autoCF: checked('set-autoCF'), blockUsers: val('set-blockUsers'), blockKeywords: val('set-blockKeywords'),
    quickReplies: val('set-quickReplies'), customCSS: val('set-customCSS'), onlyOP: settings.onlyOP,
    aiProvider: val('set-aiProvider') || 'openai', aiKey: val('set-aiKey') || '', aiModel: val('set-aiModel') || 'gpt-4o-mini', aiBaseUrl: val('set-aiBaseUrl') || 'https://api.openai.com/v1',
    ldcLinks: val('set-ldcLinks') || ''
  };
  await chrome.storage.local.set({ ld_settings: settings });
  try { await chrome.storage.sync.set({ ld_settings_backup: settings }); } catch (e) {}
  try { await chrome.runtime.sendMessage({ type: 'set-panel-behavior' }); } catch (e) {}
  document.body.classList.toggle('theme-dark', settings.theme === 'dark');
  syncThemeGrid(settings.theme);
  showToast('设置已保存');
  if (listEl) load(); // 改了“看过的帖子不再显示”等开关，列表马上按新规则重排
  // 外观切换 bug 修复：换了主题就自动刷新论坛页，不用手动刷新才生效
  if (themeVal !== oldTheme) {
    const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
    for (const tab of tabs) {
      try { await chrome.tabs.sendMessage(tab.id, { type: 'apply-theme-now', skin: themeVal }); }
      catch (e) { try { await chrome.tabs.reload(tab.id); } catch (e2) {} }
    }
  }
}

// ---------- 可视化设置控件（主题网格 / 胶囊标签 / 链接列表） ----------
function syncThemeGrid(val) {
  document.querySelectorAll('#theme-grid .theme-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === val);
  });
}

function renderChipEditor(box) {
  const target = $(box.dataset.target);
  const list = box.querySelector('.chip-list');
  if (!target || !list) return;
  const items = String(target.value || '').split('\n').map(x => x.trim()).filter(Boolean);
  list.innerHTML = '';
  items.forEach((txt, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const span = document.createElement('span');
    span.textContent = txt;
    span.title = txt;
    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = '×';
    del.title = '删除';
    del.onclick = () => {
      items.splice(idx, 1);
      target.value = items.join('\n');
      renderChipEditor(box);
      saveSettings();
    };
    chip.appendChild(span);
    chip.appendChild(del);
    list.appendChild(chip);
  });
}

function syncAllChipEditors() {
  document.querySelectorAll('.chip-editor').forEach(renderChipEditor);
}

function bindVisualEditors() {
  // 主题网格
  document.querySelectorAll('#theme-grid .theme-pill').forEach(btn => {
    btn.onclick = () => {
      const sel = $('set-theme');
      if (!sel) return;
      sel.value = btn.dataset.theme;
      syncThemeGrid(btn.dataset.theme);
      saveSettings();
    };
  });
  // 胶囊标签编辑器
  document.querySelectorAll('.chip-editor').forEach(box => {
    const target = $(box.dataset.target);
    const input = box.querySelector('.chip-add input');
    const addBtn = box.querySelector('.chip-add button');
    if (!target || !input || !addBtn) return;
    const addItem = () => {
      const v = input.value.trim();
      if (!v) return;
      const items = String(target.value || '').split('\n').map(x => x.trim()).filter(Boolean);
      if (!items.includes(v)) items.push(v);
      target.value = items.join('\n');
      input.value = '';
      renderChipEditor(box);
      saveSettings();
    };
    addBtn.onclick = addItem;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } });
  });
  // LDC 链接添加按钮
  const addLinkBtn = $('ldc-link-add');
  if (addLinkBtn) {
    addLinkBtn.onclick = () => {
      const box = $('ldc-link-rows');
      if (!box) return;
      box.appendChild(createLdcRow('', ''));
      const last = box.lastElementChild && box.lastElementChild.querySelector('input');
      if (last) last.focus();
    };
  }
}

function syncLdcTextareaFromRows() {
  const box = $('ldc-link-rows');
  const ta = $('set-ldcLinks');
  if (!box || !ta) return;
  const lines = [];
  box.querySelectorAll('.link-row').forEach(row => {
    const inputs = row.querySelectorAll('input');
    const name = (inputs[0] && inputs[0].value || '').trim();
    const url = (inputs[1] && inputs[1].value || '').trim();
    if (!url) return;
    lines.push(name ? (name + '|' + url) : url);
  });
  ta.value = lines.join('\n');
  saveSettings();
}

function createLdcRow(name, url) {
  const row = document.createElement('div');
  row.className = 'link-row';
  const nameIn = document.createElement('input');
  nameIn.type = 'text';
  nameIn.placeholder = '名称';
  nameIn.value = name || '';
  const urlIn = document.createElement('input');
  urlIn.type = 'text';
  urlIn.placeholder = 'https://...';
  urlIn.value = url || '';
  const del = document.createElement('button');
  del.type = 'button';
  del.textContent = '×';
  del.title = '删除';
  let rowTimer = null;
  const syncSoon = () => { clearTimeout(rowTimer); rowTimer = setTimeout(syncLdcTextareaFromRows, 250); };
  nameIn.addEventListener('input', syncSoon);
  urlIn.addEventListener('input', syncSoon);
  nameIn.addEventListener('change', syncLdcTextareaFromRows);
  urlIn.addEventListener('change', syncLdcTextareaFromRows);
  del.onclick = () => { row.remove(); syncLdcTextareaFromRows(); };
  row.appendChild(nameIn);
  row.appendChild(urlIn);
  row.appendChild(del);
  return row;
}

function renderLdcLinkRows() {
  const box = $('ldc-link-rows');
  const ta = $('set-ldcLinks');
  if (!box || !ta) return;
  box.innerHTML = '';
  const raw = String(ta.value || '').split('\n').map(x => x.trim()).filter(Boolean);
  raw.forEach(line => {
    const i = line.indexOf('|');
    const name = i >= 0 ? line.slice(0, i).trim() : '';
    const url = (i >= 0 ? line.slice(i + 1) : line).trim();
    box.appendChild(createLdcRow(name, url));
  });
}

function bindSettings() {
  let inputSaveTimer = null;
  const saveOnInput = () => { clearTimeout(inputSaveTimer); inputSaveTimer = setTimeout(saveSettings, 250); };
  ['set-theme', 'set-newTab', 'set-showTime', 'set-showFloor', 'set-hideSignature', 'set-hideImages', 'set-bossKey', 'set-privacy', 'set-openSidebarOnClick', 'set-floatSidebar', 'set-hideRead', 'set-readBoost', 'set-autoCF', 'set-aiProvider', 'set-aiKey', 'set-aiModel', 'set-aiBaseUrl', 'set-ldcLinks',
   'set-blockUsers', 'set-blockKeywords', 'set-quickReplies', 'set-customCSS'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', saveSettings);
    if (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) {
      el.addEventListener('input', saveOnInput);
    }
  });
  const exp = $('set-export');
  if (exp) exp.onclick = async () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = 'linuxdo-lite-settings.json'; a.click(); URL.revokeObjectURL(url);
  };
  const imp = $('set-import'), file = $('set-import-file');
  if (imp && file) {
    imp.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      try {
        settings = { ...DEFAULTS, ...JSON.parse(await f.text()) };
        await chrome.storage.local.set({ ld_settings: settings });
        try { await chrome.storage.sync.set({ ld_settings_backup: settings }); } catch (e) {}
        await loadSettings();
        showToast('设置已导入');
      } catch (e) { showToast('导入失败：JSON 格式无效'); }
      file.value = '';
    };
  }
  const reset = $('set-reset');
  if (reset) reset.onclick = async () => {
    if (!confirm('确定恢复默认设置吗？自定义链接和 AI Key 也会被重置。')) return;
    settings = { ...DEFAULTS };
    await chrome.storage.local.set({ ld_settings: settings });
    try { await chrome.storage.sync.set({ ld_settings_backup: settings }); } catch (e) {}
    await loadSettings();
    showToast('已恢复默认设置');
  };
  // 上游更新：去 GitHub 拉最新的 linuxdo-im.user.js，存到 storage 里，下次进论坛就用新版。
  // 你那边访问不了 GitHub 时会拉不到，那时就告诉我，我重新打包含新版的包给你。

  // 扩展自身更新检测
  const curVerEl = $('ext-cur-ver');
  if (curVerEl && chrome.runtime && chrome.runtime.getManifest) {
    curVerEl.textContent = 'v' + chrome.runtime.getManifest().version;
  }
  const chkUpdBtn = $('ext-check-update'), dlUpdBtn = $('ext-download-update'), updStat = $('ext-update-status');
  let latestDownloadUrl = '';
  if (dlUpdBtn) {
    dlUpdBtn.onclick = () => {
      if (latestDownloadUrl) chrome.tabs.create({ url: latestDownloadUrl });
    };
  }
  if (chkUpdBtn) {
    chkUpdBtn.onclick = async () => {
      if (updStat) updStat.textContent = '正在检查 GitHub 最新版本…';
      if (dlUpdBtn) dlUpdBtn.hidden = true;
      try {
        const r = await chrome.runtime.sendMessage({ type: 'check-ext-update' });
        if (!r || !r.ok) throw new Error((r && r.error) || '检查失败');
        if (r.hasUpdate) {
          latestDownloadUrl = r.downloadUrl || r.releaseUrl;
          if (dlUpdBtn) { dlUpdBtn.hidden = false; dlUpdBtn.textContent = '下载 v' + r.latestVersion; }
          if (updStat) updStat.textContent = '发现新版本 v' + r.latestVersion + '，下载覆盖原目录后在扩展页点刷新即可保留设置。';
          showToast('发现新版本 v' + r.latestVersion);
        } else {
          if (updStat) updStat.textContent = '已是最新版本（v' + r.currentVersion + '）。';
          showToast('已是最新版本');
        }
      } catch (e) {
        const msg = '检查失败：' + (e.message || e);
        if (updStat) updStat.textContent = msg;
        showToast(msg);
      }
    };
  }

  const upd = $('set-update-upstream'), verEl = $('upstream-version');
  if (verEl) verEl.textContent = '';
  if (upd) upd.onclick = async () => {
    showToast('正在检查更新…');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'fetch-upstream' });
      if (!res || !res.ok) throw new Error(res && res.error || '拉取失败');
      if (!res.text || res.text.length < 100000 || !res.text.includes('linuxdo-im-skin')) throw new Error('拉到的文件不对');
      await chrome.storage.local.set({ upstream_im_code: res.text, upstream_im_version: res.version || settings.upstreamVersion });
      settings.upstreamVersion = res.version || settings.upstreamVersion;
      await chrome.storage.local.set({ ld_settings: settings });
      if (verEl) verEl.textContent = '上游原版：linuxdo-im.user.js v' + settings.upstreamVersion + '（已更新）';
      showToast('已更新到 v' + settings.upstreamVersion);
    } catch (e) { showToast('更新失败：' + (e.message || e)); }
  };
}

  // 自定义 CSS 示例：一键填入一段能直接看效果的例子
  const cssEx = $('set-customCSS-example');
  if (cssEx) cssEx.onclick = async () => {
    const el = $('set-customCSS');
    if (el) el.value = '.topic-list-item { background: #fffbe6; }\n.topic-list { font-size: 15px; }\n.d-header { display: none; }';
    await saveSettings();
    showToast('已填入示例 CSS');
  };
  // LDC 链接自动取标题：只填了网址的行，逐个读网页 <title> 当名字，读不到就留域名
  const ldcTitleBtn = $('set-ldcLinks-titles');
  if (ldcTitleBtn) ldcTitleBtn.onclick = async () => {
    const el = $('set-ldcLinks'); if (!el) return;
    const h = $('set-saved');
    const lines = el.value.split('\n').map(x => x.trim()).filter(Boolean);
    if (!lines.length) { showToast('请先添加链接网址'); return; }
    showToast('正在获取标题…');
    const out = [];
    for (const line of lines) {
      const i = line.indexOf('|');
      const url = (i >= 0 ? line.slice(i + 1) : line).trim();
      const oldName = i >= 0 ? line.slice(0, i).trim() : '';
      // 名字以你的为准：你已经填了名字的行，自动取标题不再覆盖它，只给没名字的行补名字
      if (oldName) { out.push(line); continue; }
      let name = '';
      try {
        const r = await chrome.runtime.sendMessage({ type: 'fetch-title', url });
        if (r && r.ok && r.title) name = r.title;
        else { try { name = new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, ''); } catch (e) { name = url; } }
      } catch (e) { name = url; }
      out.push(name + '|' + url);
    }
    el.value = out.join('\n');
    await saveSettings();
    renderLdcLinkRows(); showToast('标题已补全');
  };
  // AI 总结：API 入口。key 只存本地，点“测试”会调一次 /models 验证 key 是否有效。
  const aiTest = $('set-test-ai');
  if (aiTest) aiTest.onclick = async () => {
    await saveSettings();
    showToast('正在测试连接…');
    try { const r = await chrome.runtime.sendMessage({ type: 'ai-test' }); showToast((r && r.ok) ? 'API 连接正常' : '测试失败：' + (r && r.error || '未知')); }
    catch (e) { showToast('测试失败：' + (e.message || e)); }
  };
  // 帖子页的 AI 总结按钮：先打开一个帖子页，再点它，总结只显示在侧边栏里，不发帖。
  const aiBtn = $('ai-summary-btn'), aiOut = $('ai-summary-result');
  function renderAiBox(text) {
    if (!aiOut) return;
    aiOut.hidden = false;
    aiOut.innerHTML = '<div class="ai-head"><span>AI 总结</span><button type="button" class="ai-close" title="关闭">×</button></div><div class="ai-body"></div>';
    aiOut.querySelector('.ai-body').textContent = text;
    aiOut.querySelector('.ai-close').onclick = () => { aiOut.hidden = true; };
  }
  if (aiBtn) aiBtn.onclick = async () => {
    if (!settings.aiKey) { renderAiBox('请先在设置 → AI 总结里填写 API Key。'); return; }
    renderAiBox('正在总结当前帖子…');
    try {
      const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
      const activeFirst = [...tabs].sort((a, b) => Number(!!b.active) - Number(!!a.active));
      let text = null;
      for (const tab of activeFirst) { try { const r = await chrome.tabs.sendMessage(tab.id, { type: 'get-topic-text' }); if (r && r.ok) { text = r.text; break; } } catch (e) {} }
      if (!text) throw new Error('请先打开一个帖子页');
      const r = await chrome.runtime.sendMessage({ type: 'ai-summarize', text });
      renderAiBox((r && r.ok) ? (r.summary || '未返回内容') : '总结失败：' + (r && r.error || '未知'));
    } catch (e) { renderAiBox('总结失败：' + (e.message || e)); }
  };


// ---------- ReadBoost 自动读帖控制 ----------
async function triggerReadBoost(cmd, outEl) {
  const show = msg => {
    if (outEl) outEl.textContent = msg;
    showToast(msg);
  };
  if (settings.readBoost === false) {
    show('ReadBoost 当前已关闭，请先勾选“启用 ReadBoost 自动读帖”并刷新 linux.do 页面。');
    return;
  }
  const tabs = await chrome.tabs.query({ url: 'https://linux.do/*' });
  if (!tabs.length) {
    show('请先打开一个 linux.do 帖子页。');
    return;
  }
  const isTopic = t => /^https:\/\/linux\.do\/t\/[^/]+\/\d+/.test(t.url || '');
  // 优先选当前激活的帖子页，其次任意帖子页，最后当前激活的 linux.do 页面
  const target = tabs.find(t => t.active && isTopic(t))
    || tabs.find(t => isTopic(t))
    || tabs.find(t => t.active)
    || tabs[0];
  if (cmd === 'start' && !isTopic(target)) {
    show('当前没有打开帖子页（/t/...），请先点开一篇帖子再点开始执行。');
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(target.id, { type: 'readboost-cmd', cmd });
    if (res && res.ok) {
      const labels = { start: '已发送“开始执行”，可在帖子页顶栏查看进度。', stop: '已发送“停止执行”。', settings: '已在 linux.do 页面打开 ReadBoost 设置弹窗。' };
      show(labels[cmd] || '已执行。');
    } else {
      show('操作失败：' + ((res && res.error) || '请刷新帖子页后重试'));
    }
  } catch (e) {
    show('无法连接页面，请刷新 linux.do 帖子页后重试。');
  }
}
const rbStartBtn = $('rb-start'), rbStopBtn = $('rb-stop'), rbSetBtn = $('rb-settings');
if (rbStartBtn) rbStartBtn.onclick = () => triggerReadBoost('start', $('rb-status'));
if (rbStopBtn) rbStopBtn.onclick = () => triggerReadBoost('stop', $('rb-status'));
if (rbSetBtn) rbSetBtn.onclick = () => triggerReadBoost('settings', $('rb-status'));

// ---------- 侧边栏三个页签 ----------
function showView(name) {
  const map = { posts: 'view-posts', level: 'view-level', favs: 'view-favs', settings: 'view-settings' };
  Object.entries(map).forEach(([k, id]) => { const el = $(id); if (el) el.hidden = (k !== name); });
  ['nav-posts', 'nav-level', 'nav-favs', 'nav-settings'].forEach((id, i) => { const el = $(id); if (el) el.classList.toggle('active', ['posts', 'level', 'favs', 'settings'][i] === name); });
  chrome.storage.local.set({ ld_last_view: name });
  if (name === 'favs') renderFavs();
  if (name === 'level') renderLevel();
}
function bindNav() {
  const p = $('nav-posts'), l = $('nav-level'), f = $('nav-favs'), s = $('nav-settings');
  if (p) p.onclick = () => showView('posts');
  if (l) l.onclick = () => showView('level');
  const lr = $('level-refresh'); if (lr) lr.onclick = renderLevel;
  if (f) f.onclick = () => showView('favs');
  if (s) s.onclick = () => showView('settings');
}

// ---------- 弹窗原有按钮 ----------
if ($('tab-top')) $('tab-top').onclick = () => { kind = 'top'; $('tab-top').classList.add('active'); $('tab-new').classList.remove('active'); load(); };
if ($('tab-new')) $('tab-new').onclick = () => { kind = 'new'; $('tab-new').classList.add('active'); $('tab-top').classList.remove('active'); load(); };
if ($('refresh')) $('refresh').onclick = load;
if ($('open-site')) $('open-site').onclick = () => chrome.tabs.create({ url: 'https://linux.do/' });
const sideBtn = $('open-sidepanel');
if (sideBtn) sideBtn.onclick = async () => {
  try { const win = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: win.id }); window.close(); }
  catch (e) { showStatus('打不开侧边栏：' + (e.message || e) + '，请确认 Chrome 版本 ≥ 114', true); }
};

(async () => { bindVisualEditors(); await loadSettings(); bindSettings(); bindNav(); const r = await chrome.storage.local.get('ld_last_view'); if (r.ld_last_view) showView(r.ld_last_view); await renderFavs(); load(); })();
