// LinuxDo 看帖 Lite - content.js：在 linux.do 页面里做增强
// 全部开关都存在 chrome.storage.local 的 ld_settings 里，侧边栏“设置”页改。
const DEFAULTS = {
  theme: 'default', newTab: true, showTime: true, showFloor: false,
  hideSignature: true, hideImages: false, onlyOP: false, privacy: false,
  blockUsers: '', blockKeywords: '', quickReplies: '感谢分享！\n学习了，收藏了\n+1，支持一下',
  customCSS: '', bossKey: true, openSidebarOnClick: true, floatSidebar: false, floatOpen: false,
  upstreamIM: false, upstreamSkin: 'dingtalk', upstreamVersion: '1.3.7', hideRead: true, readBoost: true
};
// 已读：内存中去重，同一帖子不重复读写 storage，最多保留最近 300 条以最小化内存占用
const markedReadSession = new Set();
let lastMarkedTopic = '';
async function markReadHere(id) {
  const sid = id ? String(id) : '';
  if (!sid || markedReadSession.has(sid)) return;
  markedReadSession.add(sid);
  try {
    const r = await chrome.storage.local.get('ld_read_topics');
    const read = r.ld_read_topics || {};
    read[sid] = Date.now();
    const keys = Object.keys(read);
    if (keys.length > 300) {
      keys.sort((a, b) => read[b] - read[a]).slice(300).forEach(k => delete read[k]);
    }
    await chrome.storage.local.set({ ld_read_topics: read });
  } catch (e) {}
}
function markReadCurrentTopic() {
  const m = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
  const tid = m ? m[1] : '';
  if (tid && tid !== lastMarkedTopic) {
    lastMarkedTopic = tid;
    markReadHere(tid);
  }
}
const WORK_TITLES = ['项目进度同步', '需求评审纪要', '本周工作汇报', '接口联调记录', '测试用例评审', '上线检查清单', '技术方案讨论', '会议纪要-周会'];
let S = { ...DEFAULTS };
let onlyOPOn = false;
let cachedBlockRules = { users: [], keywords: [] };
let privacyActive = false;

function refreshBlockRules() {
  cachedBlockRules = {
    users: String(S.blockUsers || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean),
    keywords: String(S.blockKeywords || '').split('\n').map(x => x.trim().toLowerCase()).filter(Boolean)
  };
}

async function loadSettings() {
  try { const r = await chrome.storage.local.get('ld_settings'); S = { ...DEFAULTS, ...(r.ld_settings || {}) }; } catch (e) {}
  refreshBlockRules();
  applyTheme(); applyCustomCSS();
}
function applyTheme() {
  const h = document.documentElement;
  h.classList.remove('ld-theme-dark', 'ld-theme-eye', 'ld-theme-moyu', 'ld-theme-dingtalk', 'ld-theme-feishu', 'ld-im');
  if (S.theme === 'dark') h.classList.add('ld-theme-dark');
  if (S.theme === 'eye') h.classList.add('ld-theme-eye');
  if (S.theme === 'moyu') h.classList.add('ld-theme-moyu');
  // 钉钉 / 飞书 / 企业微信：现在走上游原版（upstream-loader.js 在 document-start 时注入），
  // 这里不再套我们自己的简化版，避免两层皮肤打架。只有上游关了（upstreamIM=false）时，
  // 才用下面这个简化版当兜底。
  const upstreamOn = S.upstreamIM !== false && ['dingtalk', 'feishu', 'wecom'].includes(S.theme);
  if (upstreamOn) {
    // 关键修复：上游原版看的是 localStorage 的 linuxdo-im-view，之前如果切回过“原版论坛”，
    // 这个值是 native，选了钉钉也不会变回 IM，看起来就是“右侧显示钉钉，实际还是默认”。
    // 这里选了 IM 皮肤就强制写回 im + 对应皮肤，下次刷新就生效。
    try { localStorage.setItem('linuxdo-im-skin', S.theme); localStorage.setItem('linuxdo-im-view', 'im'); } catch (e) {}
  }
  h.classList.toggle('ld-hide-sig', !!S.hideSignature);
  h.classList.toggle('ld-hide-img', !!S.hideImages);
  h.classList.toggle('ld-privacy', !!S.privacy);
  applyPrivacy();
  // 论坛页底部的皮肤切换器已删：不经常切，主题只在侧边栏设置里切。
  // 这里只负责把旧版留下的切换器清掉。
  const oldSw = document.getElementById('ld-skin-switcher'); if (oldSw) oldSw.remove();
}

// 隐私：头像换成首字圆点，标题换成随机工作标题；关掉就还原（原标题存在 dataset 里）
function applyPrivacy() {
  if (!S.privacy && !privacyActive) return;
  privacyActive = !!S.privacy;
  document.querySelectorAll('.topic-list-item a.title, .main-link a.title').forEach(a => {
    if (S.privacy) {
      if (!a.dataset.orig) a.dataset.orig = a.textContent;
      // 只换一次并记下来：以前每次 MutationObserver 跑都重新随机，标题一直闪、还触发新的 observer 循环
      if (!a.dataset.privacyTitle) a.dataset.privacyTitle = WORK_TITLES[Math.floor(Math.random() * WORK_TITLES.length)];
      a.textContent = a.dataset.privacyTitle;
    } else if (a.dataset.orig) { a.textContent = a.dataset.orig; delete a.dataset.orig; delete a.dataset.privacyTitle; }
  });
  // 隐私头像 bug：Discourse 的头像就是 <img class="avatar"> 本身，CSS 只写了
  // .avatar img（头像容器里的 img）选不到它，所以原头像一直露着，圆点还被追加
  // 在它下面。改成：直接把 img 藏起来（行内样式，优先级最高），圆点插到它前面。
  document.querySelectorAll('img.avatar').forEach(img => {
    const parent = img.parentElement;
    if (S.privacy) {
      img.style.display = 'none';
      if (parent && !parent.querySelector('.ld-privacy-avatar')) {
        const s = document.createElement('span'); s.className = 'ld-privacy-avatar';
        s.textContent = (img.alt || '工').trim().charAt(0) || '工';
        parent.insertBefore(s, img);
      }
    } else { img.style.display = ''; parent && parent.querySelectorAll('.ld-privacy-avatar').forEach(x => x.remove()); }
  });
}
// Ctrl+K 全局搜索：调 Discourse 自带 /search.json，只展示，不改数据
function openSearch() {
  if (document.getElementById('ld-search-overlay')) return;
  const ov = document.createElement('div'); ov.id = 'ld-search-overlay';
  ov.innerHTML = `<div id="ld-search-box"><input placeholder="搜帖子 / 用户，Ctrl+K 打开，Esc 关闭" autofocus><div class="res"></div><div style="color:#888;font-size:12px;margin-top:8px">回车打开第一个结果</div></div>`;
  ov.onclick = e => { if (e.target === ov) ov.remove(); };
  document.body.appendChild(ov);
  const input = ov.querySelector('input'), res = ov.querySelector('.res');
  let t = null;
  input.oninput = () => { clearTimeout(t); t = setTimeout(async () => {
    const q = input.value.trim(); if (!q) { res.innerHTML = ''; return; }
    try {
      const r = await fetch('/search.json?q=' + encodeURIComponent(q), { credentials: 'include' });
      const j = await r.json(); const topics = (j.topics || []).slice(0, 10);
      res.innerHTML = topics.map(x => `<a href="/t/${x.slug}/${x.id}">${x.title}</a>`).join('') || '<div style="padding:8px;color:#888">没搜到</div>';
    } catch (e) { res.innerHTML = '<div style="padding:8px;color:#d33">搜索失败，可能是 Cloudflare 拦了</div>'; }
  }, 300); };
  input.onkeydown = e => { if (e.key === 'Enter') { const a = res.querySelector('a'); if (a) location.href = a.getAttribute('href'); } };
}
function applyCustomCSS() {
  let el = document.getElementById('ld-custom-css');
  if (!el) { el = document.createElement('style'); el.id = 'ld-custom-css'; document.head.appendChild(el); }
  el.textContent = S.customCSS || '';
}
function esc(s) { return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }


// --- 统一屏蔽规则匹配（兼容原生 Discourse 列表/帖子 + IM 皮肤会话/消息 + 悬浮侧栏） ---
function getBlockRules() {
  return cachedBlockRules;
}
function matchBlockedUser(names, users) {
  if (!users.length || !names.length) return false;
  return users.some(u => names.some(n => n && (n === u || n.includes(u))));
}
function matchBlockedKeyword(text, keywords) {
  if (!keywords.length || !text) return false;
  const lower = text.toLowerCase();
  return keywords.some(k => lower.includes(k));
}
function collectElementNames(el) {
  const names = new Set();
  if (!el) return [];
  el.querySelectorAll('a[href^="/u/"]').forEach(a => {
    const m = (a.getAttribute('href') || '').match(/^\/u\/([^/?#]+)/);
    if (m) { try { names.add(decodeURIComponent(m[1]).toLowerCase()); } catch (e) { names.add(m[1].toLowerCase()); } }
    const t = (a.textContent || '').trim().toLowerCase();
    if (t) names.add(t);
  });
  el.querySelectorAll('[data-user-card]').forEach(n => {
    const v = (n.getAttribute('data-user-card') || '').trim().toLowerCase();
    if (v) names.add(v);
  });
  el.querySelectorAll('.username, .full-name, .im-conv-name, .im-msg-name').forEach(n => {
    const v = (n.textContent || '').trim().toLowerCase();
    if (v) names.add(v);
  });
  el.querySelectorAll('[title]').forEach(n => {
    const v = (n.getAttribute('title') || '').trim().toLowerCase();
    if (v) names.add(v);
  });
  el.querySelectorAll('img[alt]').forEach(img => {
    const v = (img.getAttribute('alt') || '').trim().toLowerCase();
    if (v) names.add(v);
  });
  return [...names];
}
let imBlockingApplied = false;
function enhanceIMBlocking() {
  const { users, keywords } = cachedBlockRules;
  const hasRules = users.length > 0 || keywords.length > 0;
  if (!hasRules && !imBlockingApplied) return;
  imBlockingApplied = hasRules;
  document.querySelectorAll('.im-conv').forEach(row => {
    if (!hasRules) { row.style.display = ''; return; }
    const blocked = (users.length && matchBlockedUser(collectElementNames(row), users)) || (keywords.length && matchBlockedKeyword(row.textContent || '', keywords));
    row.style.display = blocked ? 'none' : '';
  });
  document.querySelectorAll('.im-msg').forEach(msg => {
    if (!hasRules) { msg.style.display = ''; return; }
    const body = (msg.querySelector('.im-msg-content') || msg).textContent || '';
    const blocked = (users.length && matchBlockedUser(collectElementNames(msg), users)) || (keywords.length && matchBlockedKeyword(body, keywords));
    msg.style.display = blocked ? 'none' : '';
  });
}

// --- 列表页：新标签页 / 创建时间 / 屏蔽用户和关键词 ---
let listBlockingApplied = false;
function enhanceList() {
  const { users, keywords } = cachedBlockRules;
  const hasRules = users.length > 0 || keywords.length > 0;
  if (S.newTab || S.showTime || hasRules || listBlockingApplied) {
    listBlockingApplied = hasRules;
    document.querySelectorAll('.topic-list-item, tr[data-topic-id]').forEach(row => {
      const link = (S.newTab || S.showTime) ? row.querySelector('a.title, .main-link a, a.raw-topic-link') : null;
      if (link && S.newTab && link.getAttribute('target') !== '_blank') link.setAttribute('target', '_blank');
      if (hasRules) {
        const blocked = (users.length && matchBlockedUser(collectElementNames(row), users)) || (keywords.length && matchBlockedKeyword(row.textContent || '', keywords));
        row.style.display = blocked ? 'none' : '';
      } else if (row.style.display === 'none') {
        row.style.display = '';
      }
      if (link && S.showTime && !row.querySelector('.ld-time-badge')) {
        const t = row.querySelector('time[datetime]');
        if (t && t.getAttribute('datetime')) {
          const d = new Date(t.getAttribute('datetime'));
          const b = document.createElement('span'); b.className = 'ld-time-badge';
          b.textContent = d.getMonth() + 1 + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
          link.parentElement && link.parentElement.appendChild(b);
        }
      }
    });
  }
  enhanceIMBlocking();
}

// --- 帖子页：楼层号 / 只看楼主 ---
// 楼层号的 bug：之前用的是 DOM 里的序号 i+1。Discourse 是虚拟滚动，只渲染
// 屏幕附近的 ~20 楼，往下翻时上面的楼被卸载、下面的楼才加载进来，i 又从 0 开始，
// 所以 21 楼会显示成 1 楼，越往下越错，刷新后也可能错位。
// 正确做法：用帖子自己带的 data-post-number（Discourse 每楼自带的真实楼层号），
// 没有这个属性时再去帖子链接 /t/…/id/楼层号 里找，最后才退回 i+1。
// 已有的徽章如果数字不对也要纠正，不是一次写死就完事。
function getPostNumber(p, i) {
  // 1) 话题 JSON 映射（最准）：/t/{id}.json 里的 post_stream.posts 有 id -> post_number
  if (postNumberMap && p.dataset && p.dataset.postId && postNumberMap[p.dataset.postId]) return String(postNumberMap[p.dataset.postId]);
  const byId = p.querySelector && p.querySelector('[data-post-id]');
  if (byId && postNumberMap && postNumberMap[byId.dataset.postId]) return String(postNumberMap[byId.dataset.postId]);
  // 2) 帖子自带的 data-post-number
  const direct = p.dataset && p.dataset.postNumber;
  if (direct && /^\d+$/.test(direct)) return direct;
  const inner = p.querySelector && p.querySelector('[data-post-number]');
  if (inner && inner.dataset.postNumber && /^\d+$/.test(inner.dataset.postNumber)) return inner.dataset.postNumber;
  // 3) 帖子日期链接（不是正文里的任意 /t/ 链接）：/t/标题/id/楼层号，楼层号就是最后一段数字
  const dateLink = p.querySelector && (p.querySelector('a.post-date') || p.querySelector('.topic-meta-data a[href*="/t/"]') || p.querySelector('a[href*="#post_"]'));
  if (dateLink) {
    const m = (dateLink.getAttribute('href') || '').match(/\/t\/[^/]+\/\d+\/(\d+)/);
    if (m) return m[1];
  }
  // 4) 最后才退回 DOM 序号（滚动加载时会错，只当兜底）
  return String(i + 1);
}
let postNumberMap = null, postNumberTopic = null;
async function fetchPostNumbers() {
  const m = location.pathname.match(/\/t\/[^/]+\/(\d+)/);
  if (!S.showFloor || !m) {
    if (postNumberMap) { postNumberMap = null; postNumberTopic = null; }
    return;
  }
  if (postNumberTopic === m[1] && postNumberMap) return;
  try {
    const r = await fetch(`/t/${m[1]}.json`, { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!r.ok) return;
    const j = await r.json();
    const posts = (j.post_stream && j.post_stream.posts) || [];
    const map = {};
    posts.forEach(x => { if (x.id != null && x.post_number != null) map[String(x.id)] = x.post_number; });
    if (Object.keys(map).length) { postNumberMap = map; postNumberTopic = m[1]; enhancePosts(); }
  } catch (e) {}
}
let postsTouched = false;
function enhancePosts() {
  const { users, keywords } = cachedBlockRules;
  const hasRules = users.length > 0 || keywords.length > 0;
  if (!S.showFloor && !onlyOPOn && !hasRules && !postsTouched) return;
  postsTouched = !!(S.showFloor || onlyOPOn || hasRules);
  const posts = [...document.querySelectorAll('.topic-post, article[data-post-id]')];
  if (!posts.length) return;
  const opEl = onlyOPOn ? posts[0].querySelector('.username, .names .username a') : null;
  const opName = opEl ? opEl.textContent.trim() : '';
  posts.forEach((p, i) => {
    if (S.showFloor) {
      const num = getPostNumber(p, i) + '楼';
      const old = p.querySelector('.ld-floor');
      if (old) { if (old.textContent !== num) old.textContent = num; }
      else {
        const b = document.createElement('span'); b.className = 'ld-floor'; b.textContent = num;
        p.style.position = 'relative'; p.appendChild(b);
      }
    } else {
      const old = p.querySelector('.ld-floor'); if (old) old.remove();
    }
    let isBlockedPost = false;
    if (hasRules) {
      const postBody = keywords.length ? ((p.querySelector('.cooked, .post-body') || p).textContent || '') : '';
      isBlockedPost = (users.length && matchBlockedUser(collectElementNames(p), users)) || (keywords.length && matchBlockedKeyword(postBody, keywords));
    }
    if (isBlockedPost) {
      p.style.display = 'none';
    } else if (onlyOPOn) {
      const me = p.querySelector('.username, .names .username a');
      const myName = me ? me.textContent.trim() : '';
      p.style.display = (i === 0 || opName === myName) ? '' : 'none';
    } else if (p.style.display === 'none') {
      p.style.display = '';
    }
  });
}

// --- 快捷回复：发帖框上面加一排按钮，点一下插进去 ---
function enhanceComposer() {
  const area = document.querySelector('.d-editor-input, textarea#reply-control textarea');
  const bar = document.querySelector('#reply-control, .composer-fields');
  if (!area || document.getElementById('ld-qr-bar')) return;
  const replies = S.quickReplies.split('\n').map(x => x.trim()).filter(Boolean);
  if (!replies.length) return;
  const div = document.createElement('div'); div.id = 'ld-qr-bar';
  replies.forEach(txt => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = txt.slice(0, 12);
    b.onclick = () => { area.value = (area.value ? area.value + '\n' : '') + txt; area.dispatchEvent(new Event('input', { bubbles: true })); area.focus(); };
    div.appendChild(b);
  });
  area.parentElement.insertBefore(div, area);
}

// --- 固定按钮：回顶部 / 只看楼主 ---
function ensureButtons() {
  if (!document.getElementById('ld-top-btn')) {
    const b = document.createElement('button'); b.id = 'ld-top-btn'; b.textContent = '↑'; b.title = '回顶部';
    b.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    document.body.appendChild(b);
  }
  const isTopic = /^\/t\/[^/]+\/\d+/.test(location.pathname);
  let opBtn = document.getElementById('ld-op-btn');
  if (isTopic) {
    if (!opBtn) {
      opBtn = document.createElement('button'); opBtn.id = 'ld-op-btn'; opBtn.textContent = '只看楼主';
      opBtn.onclick = () => { onlyOPOn = !onlyOPOn; opBtn.classList.toggle('on', onlyOPOn); opBtn.textContent = onlyOPOn ? '只看楼主 ✓' : '只看楼主'; enhancePosts(); };
      document.body.appendChild(opBtn);
    }
    opBtn.style.display = '';
  } else if (opBtn) {
    opBtn.style.display = 'none';
    onlyOPOn = false;
  }
}

// --- 老板键 / 摸鱼伪装：Alt+M 切一个假 Excel，遮住论坛 ---
function toggleMoyu() {
  let ov = document.getElementById('ld-moyu-overlay');
  if (ov) { ov.remove(); return; }
  ov = document.createElement('div'); ov.id = 'ld-moyu-overlay';
  ov.innerHTML = `<div class="bar">📊 2026年11月工作数据汇总.xlsx - Excel &nbsp; <span style="font-weight:400;font-size:12px">按 Alt+M 恢复论坛</span></div>
  <table><tr><th>项目</th><th>负责人</th><th>进度</th><th>截止</th><th>备注</th></tr>
  <tr><td>Q4 需求评审</td><td>张工</td><td>80%</td><td>11-28</td><td>待确认</td></tr>
  <tr><td>接口联调</td><td>李工</td><td>65%</td><td>11-30</td><td>进行中</td></tr>
  <tr><td>测试用例</td><td>王工</td><td>40%</td><td>12-02</td><td>补充中</td></tr>
  <tr><td>上线检查表</td><td>赵工</td><td>20%</td><td>12-05</td><td>待开始</td></tr></table>
  <p style="padding:12px;color:#888">（摸鱼伪装页，Alt+M 恢复）</p>`;
  document.body.appendChild(ov);
}
document.addEventListener('keydown', e => {
  if (S.bossKey && e.altKey && (e.key === 'm' || e.key === 'M' || e.key === 'ß')) { e.preventDefault(); toggleMoyu(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape') { const ov = document.getElementById('ld-search-overlay'); if (ov) ov.remove(); }
});

// --- 页内悬浮侧栏：进 linux.do 就自动出现，记住开/合状态，不用点图标 ---
// Chrome 原生侧边栏关了浏览器就没了，也没法在没点图标时自动打开，这是 Chrome 的限制。
// 所以再加一个页内悬浮栏：只要打开 linux.do 它就在，收起来就只剩右下角一个小圆钮，状态存在本地。
let floatKind = 'top';
async function ensureFloatSidebar() {
  if (!S.floatSidebar) { const old = document.getElementById('ld-float-sidebar'); if (old) old.remove(); const b = document.getElementById('ld-float-btn'); if (b) b.remove(); return; }
  // 实测发现的 bug：切钉钉皮肤后悬浮栏会消失，且刷新后也回不来、找不到 reopen 按钮。
  // 原因：以前这里是“元素存在就直接 return”，一旦它被别的 DOM 变动隐藏/移走，runAll 永远不会把它恢复；
  // 加上旧版收起按钮写的是 display:''，盖不掉 CSS 里的 display:none，小圆钮也出不来。
  // 现在改成：每次 runAll 都按 floatOpen 强制恢复显示状态，丢了就重建。
  const existing = document.getElementById('ld-float-sidebar');
  if (existing) {
    existing.style.display = S.floatOpen ? '' : 'none';
    const b = document.getElementById('ld-float-btn');
    if (b) b.style.display = S.floatOpen ? 'none' : 'block';
    if (S.floatOpen && !existing.querySelector('.ld-float-item')) loadFloatTopics();
    return;
  }
  const box = document.createElement('div'); box.id = 'ld-float-sidebar';
  box.innerHTML = `<div class="ld-float-head"><span><b>L站</b> <button data-k="top" class="on">最热</button> <button data-k="new">最新</button></span><span><button class="ld-float-refresh" title="刷新">↻</button> <button class="ld-float-close" title="收起">—</button></span></div><div class="ld-float-list">加载中…</div><div class="ld-float-foot">点标题新标签页打开 · 状态已记住</div>`;
  document.body.appendChild(box);
  const btn = document.createElement('button'); btn.id = 'ld-float-btn'; btn.textContent = 'L站'; btn.title = '打开悬浮侧栏';
  btn.onclick = async () => { S.floatOpen = true; await chrome.storage.local.set({ ld_settings: S }); box.style.display = ''; btn.style.display = 'none'; loadFloatTopics(); };
  document.body.appendChild(btn);
  box.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { floatKind = b.dataset.k; box.querySelectorAll('[data-k]').forEach(x => x.classList.toggle('on', x === b)); loadFloatTopics(); });
  box.querySelector('.ld-float-refresh').onclick = loadFloatTopics;
  box.querySelector('.ld-float-close').onclick = async () => { S.floatOpen = false; await chrome.storage.local.set({ ld_settings: S }); box.style.display = 'none'; btn.style.display = 'block'; };
  // 记住的状态：上次是收起的，进站就只显示小圆钮
  // 注意：#ld-float-btn 在 CSS 里是 display:none，写 '' 盖不掉，必须写 'block'，以前收起后小圆钮出不来
  if (!S.floatOpen) { box.style.display = 'none'; btn.style.display = 'block'; } else { btn.style.display = 'none'; loadFloatTopics(); }
}
async function loadFloatTopics() {
  const list = document.querySelector('#ld-float-sidebar .ld-float-list'); if (!list) return;
  try {
    const url = floatKind === 'new' ? 'https://linux.do/latest.json' : 'https://linux.do/top.json';
    const r = await fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const { users: bUsers, keywords: bKws } = getBlockRules();
    const uMap = {};
    (j.users || []).forEach(u => { if (u && u.id != null) uMap[u.id] = (u.username || '').toLowerCase(); });
    const topics = (j.topic_list && j.topic_list.topics || []).filter(tp => {
      if (matchBlockedKeyword((tp.title || '') + ' ' + (tp.excerpt || ''), bKws)) return false;
      if (!bUsers.length) return true;
      const names = [];
      if (tp.last_poster_username) names.push(tp.last_poster_username.toLowerCase());
      (tp.posters || []).forEach(pr => { if (pr.user_id != null && uMap[pr.user_id]) names.push(uMap[pr.user_id]); });
      return !matchBlockedUser(names, bUsers);
    }).slice(0, 20);
    list.innerHTML = '';
    topics.forEach(t => {
      const a = document.createElement('a'); a.href = `https://linux.do/t/${t.slug || 'topic'}/${t.id}`; a.target = '_blank'; a.className = 'ld-float-item';
      a.innerHTML = `<div class="t"></div><div class="m">${t.posts_count || 0} 回复 · ${t.views || 0} 浏览</div>`;
      a.querySelector('.t').textContent = t.title; list.appendChild(a);
    });
    if (!topics.length) list.textContent = '没拿到帖子，点 ↻ 试试';
  } catch (e) { list.textContent = '拉不到：' + e.message + '，先在首页过验证再点 ↻'; }
}

// --- 等级数据：侧边栏“等级”页要的数据，从页面本身去拉（带登录态） ---
// /session/current.json 给当前用户名和信任等级，/u/{用户名}/summary.json 给
// 浏览话题、已读帖子、点赞等全周期数字。升三级的考核是近 100 天滚动窗口，
// 这里只能拿全周期数当参考，精确数以 connect.linux.do 为准，面板里会标“参考”。
async function handleLevelData(sendResponse) {
  try {
    const cur = await fetch('/session/current.json', { credentials: 'include', headers: { 'Accept': 'application/json' } });
    if (!cur.ok) throw new Error('HTTP ' + cur.status + '（先登录 linux.do）');
    const curJ = await cur.json();
    const me = curJ.current_user && curJ.current_user.username;
    if (!me) throw new Error('没拿到当前用户名（先登录 linux.do）');
    const [uR, sR] = await Promise.all([
      fetch(`/u/${encodeURIComponent(me)}.json`, { credentials: 'include', headers: { 'Accept': 'application/json' } }),
      fetch(`/u/${encodeURIComponent(me)}/summary.json`, { credentials: 'include', headers: { 'Accept': 'application/json' } })
    ]);
    if (!uR.ok || !sR.ok) throw new Error('拉用户数据失败 HTTP ' + uR.status + '/' + sR.status);
    const uJ = await uR.json(), sJ = await sR.json();
    sendResponse({ ok: true, data: { username: me, trust_level: (uJ.user && uJ.user.trust_level) || 0, created_at: uJ.user && uJ.user.created_at, gamification_score: (uJ.user && uJ.user.gamification_score) || 0, summary: sJ.user_summary || {} } });
  } catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
}
// --- 中转拉 JSON：popup / 侧边栏拉不到时，让页面本身去拉（带完整验证凭证） ---

// --- ReadBoost 自动读帖：原样注入上游 upstream/linuxdo-readboost.user.js (v2.2) ---
let readBoostInjected = false;
function ensureReadBoost() {
  if (S.readBoost === false) return;
  if (readBoostInjected) return;
  if (window.top !== window.self) return;
  if (location.pathname.indexOf('/pub/') === 0) return;
  readBoostInjected = true;
  const parent = document.documentElement || document.head || document.body;
  if (!parent) return;
  const shim = document.createElement('script');
  shim.src = chrome.runtime.getURL('upstream/gm-readboost-shim.js');
  shim.onload = () => {
    const rb = document.createElement('script');
    rb.src = chrome.runtime.getURL('upstream/linuxdo-readboost.user.js');
    parent.appendChild(rb);
  };
  parent.appendChild(shim);
}
function sendReadBoostCmd(cmd) {
  return new Promise(resolve => {
    if (S.readBoost === false) {
      resolve({ ok: false, error: 'ReadBoost 已关闭，请先在设置里开启并刷新页面' });
      return;
    }
    ensureReadBoost();
    const reqId = 'rb_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    let done = false;
    const onMsg = e => {
      if (e.source !== window || !e.data || e.data.source !== 'ld-lite-readboost-res' || e.data.reqId !== reqId) return;
      done = true;
      window.removeEventListener('message', onMsg);
      resolve({ ok: !!e.data.ok, error: e.data.error || '', loaded: e.data.loaded, isTopic: e.data.isTopic, status: e.data.status || '' });
    };
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'ld-lite-readboost', cmd, reqId }, '*');
    setTimeout(() => {
      if (done) return;
      window.removeEventListener('message', onMsg);
      resolve({ ok: false, error: '页面尚未响应 ReadBoost（请刷新当前 linux.do 帖子页后重试）' });
    }, 1500);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'readboost-cmd') { sendReadBoostCmd(msg.cmd).then(sendResponse); return true; }
  if (msg.type === 'get-level-data') { handleLevelData(sendResponse); return true; }
  // 主题切换 bug 修复：设置里换了主题，以前要手动刷新论坛页才生效，经常忘了就以为没换。
  // 现在设置保存后直接发这条消息过来：先把上游皮肤写进 localStorage，再刷新本页。
  if (msg.type === 'apply-theme-now') {
    try {
      if (msg.skin && ['dingtalk', 'feishu', 'wecom'].includes(msg.skin)) { localStorage.setItem('linuxdo-im-skin', msg.skin); localStorage.setItem('linuxdo-im-view', 'im'); }
      else { localStorage.setItem('linuxdo-im-view', 'native'); }
    } catch (e) {}
    sendResponse({ ok: true }); location.reload(); return true;
  }
  // AI 总结：把当前帖子页的正文（前 10 楼）交给侧边栏，侧边栏再发给用户自己选的 AI。
  // 只读不发帖，总结只显示在侧边栏里。
  if (msg.type === 'get-topic-text') {
    try {
      const title = (document.querySelector('h1, .fancy-title') || {}).textContent || document.title;
      const parts = [...document.querySelectorAll('.cooked, .post-body')].slice(0, 10).map(el => (el.textContent || '').trim()).filter(Boolean);
      if (!parts.length) { sendResponse({ ok: false, error: '当前页不是帖子页（先打开一个帖子）' }); return true; }
      sendResponse({ ok: true, text: '标题：' + title.trim() + '\n\n' + parts.join('\n---\n') });
    } catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
    return true;
  }
  if (msg.type === 'fetch-via-dom') {
    // 不调 API，直接扒页面上已经渲染出来的帖子列表，Cloudflare 再拦也拦不住已经打开的页面
    try {
      const topics = [];
      document.querySelectorAll('a[href*="/t/"]').forEach(a => {
        const m = a.href.match(/\/t\/([^/]+)\/(\d+)/);
        if (!m) return;
        const title = (a.textContent || '').trim();
        if (!title || title.length < 2) return;
        if (topics.some(t => t.id === Number(m[2]))) return;
        topics.push({ id: Number(m[2]), slug: m[1], title, posts_count: 0, views: 0, created_at: '', last_posted_at: '' });
      });
      if (topics.length) sendResponse({ ok: true, data: { topic_list: { topics: topics.slice(0, 30) } } });
      else sendResponse({ ok: false, error: '页面里没找到帖子列表' });
    } catch (e) { sendResponse({ ok: false, error: String(e.message || e) }); }
    return true;
  }
  if (msg.type !== 'fetch-via-page') return;
  const url = msg.kind === 'new' ? 'https://linux.do/latest.json' : 'https://linux.do/top.json';
  fetch(url, { credentials: 'include', headers: { 'Accept': 'application/json' } })
    .then(async r => { if (!r.ok) throw new Error('HTTP ' + r.status); const t = await r.text(); if (t.trim().startsWith('<')) throw new Error('Cloudflare 验证页'); sendResponse({ ok: true, data: JSON.parse(t) }); })
    .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
  return true;
});
// 论坛里点开帖子也记已读：帖子列表里的链接一点就记，帖子页打开也记
document.addEventListener('click', e => {
  const a = e.target && e.target.closest ? e.target.closest('a[href*="/t/"]') : null;
  if (!a) return;
  const m = a.href.match(/\/t\/[^/]+\/(\d+)/);
  if (m) markReadHere(m[1]);
}, true);

// Discourse 单页应用轻量调度：后台标签页暂停扫描，前台防抖 + 空闲执行，最小化 CPU/内存占用
let timer = null;
let idleId = null;
function runAll() {
  if (document.hidden) return;
  try {
    ensureReadBoost();
    markReadCurrentTopic();
    fetchPostNumbers();
    enhanceList();
    enhancePosts();
    if (S.quickReplies) enhanceComposer();
    ensureButtons();
    applyPrivacy();
    ensureFloatSidebar();
    if (S.theme !== 'dingtalk' && S.theme !== 'feishu') {
      const r = document.getElementById('ld-im-rail');
      if (r) r.remove();
    }
  } catch (e) {}
}
function scheduleRun() {
  if (document.hidden) return;
  clearTimeout(timer);
  if (idleId && typeof cancelIdleCallback === 'function') { cancelIdleCallback(idleId); idleId = null; }
  timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(() => { idleId = null; runAll(); }, { timeout: 800 });
    } else {
      runAll();
    }
  }, 450);
}
new MutationObserver(scheduleRun).observe(document.body || document.documentElement, { childList: true, subtree: true });
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleRun(); });
chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.ld_settings) loadSettings().then(runAll); });
loadSettings().then(runAll);
