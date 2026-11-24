// 同源取数脚本：注入在 connect.linux.do / credit.linux.do 页上。
// 1) 响应侧边栏的同源取数消息；
// 2) 用户正常访问这两个页面时，顺手把最新 LDC 余额 / Connect 卡片缓存在本地，
//    后续在等级页即可直接展示，无需自动弹窗。
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-page-html') {
    sendResponse({ ok: true, html: document.documentElement.outerHTML });
    return true;
  }
  if (msg.type === 'same-origin-fetch') {
    fetch(msg.url, { credentials: 'include', headers: { Accept: msg.accept || '*/*' } })
      .then(async r => { const text = await r.text(); sendResponse({ ok: r.ok, status: r.status, text }); })
      .catch(e => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }
});

// 访问页面时自动静默缓存一次
(function autoCacheOnVisit() {
  if (window.top !== window.self) return;
  if (location.hostname === 'credit.linux.do') {
    fetch('https://credit.linux.do/api/v1/oauth/user-info', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(async r => {
        if (!r.ok) return;
        const text = await r.text();
        if (text.trim().startsWith('<')) return;
        const j = JSON.parse(text);
        const data = (j && j.data) ? j.data : (j && j.available_balance != null ? j : null);
        if (data) chrome.storage.local.set({ cache_level_ldc: { data, at: Date.now() } });
      })
      .catch(() => {});
  } else if (location.hostname === 'connect.linux.do') {
    setTimeout(() => {
      try {
        const html = document.documentElement.outerHTML || '';
        if (html.length > 1000 && html.includes('信任级别')) {
          chrome.storage.local.set({ cache_connect_html: { html, at: Date.now() } });
        }
      } catch (e) {}
    }, 800);
  }
})();
