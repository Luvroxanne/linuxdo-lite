// GM 垫片（外链文件）：在页面主世界提供 GM_xmlhttpRequest / unsafeWindow。
// 必须是外链文件，不能用内联注入，linux.do 的 CSP 会拦内联脚本。
(function () {
  if (typeof window.GM_xmlhttpRequest === 'function') return;
  window.unsafeWindow = window;
  window.GM_xmlhttpRequest = function (o) {
    o = o || {};
    var c = new AbortController();
    var t = o.timeout ? setTimeout(function () { c.abort(); if (o.ontimeout) o.ontimeout(); }, o.timeout) : null;
    fetch(o.url, { method: o.method || 'GET', credentials: 'include', headers: o.headers || {}, signal: c.signal }).then(function (r) {
      if (t) clearTimeout(t);
      return r.text().then(function (x) { if (o.onload) o.onload({ status: r.status, responseText: x, response: x }); });
    }).catch(function (e) {
      if (t) clearTimeout(t);
      if (e && e.name === 'AbortError') return;
      if (o.onerror) o.onerror(e);
    });
  };
})();
