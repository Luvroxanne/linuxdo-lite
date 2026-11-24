// 上游原版加载器：在 document-start 时，把原版 IM 脚本注入到页面主世界。
// 只在顶层 frame、非 /pub/ 页面、且外观主题明确选了钉钉 / 飞书 / 企微 IM 时才注入。
// 注入顺序：GM 垫片 + 皮肤选择（localStorage）-> 上游原版代码（原样，未改一行）。
// 更新过的代码存在 chrome.storage.local 的 upstream_im_code 里，优先用它；
// 没有就用包里捆绑的 upstream/linuxdo-im.user.js（v1.3.7）。
(function () {
  if (window.top !== window.self) return;
  if (location.pathname.indexOf('/pub/') === 0) return;

  function injectInline(code) {
    var s = document.createElement('script');
    s.textContent = code;
    (document.documentElement || document.head || document.body).appendChild(s);
    s.remove();
  }
  function injectSrc(url) {
    var s = document.createElement('script');
    s.src = url;
    (document.documentElement || document.head || document.body).appendChild(s);
  }

  chrome.storage.local.get(['ld_settings', 'upstream_im_code'], function (r) {
    var settings = (r && r.ld_settings) || {};
    var theme = settings.theme || 'default';
    if (theme !== 'dingtalk' && theme !== 'feishu' && theme !== 'wecom') {
      try { localStorage.setItem('linuxdo-im-view', 'native'); } catch (e) {}
      return;
    }
    var skin = theme;
    try { localStorage.setItem('linuxdo-im-skin', skin); localStorage.setItem('linuxdo-im-view', 'im'); } catch (e) {}
    // 1) GM 垫片（页面主世界里定义 GM_xmlhttpRequest / unsafeWindow）
    injectInline(
      "(function(){if(typeof window.GM_xmlhttpRequest==='function')return;window.unsafeWindow=window;" +
      "window.GM_xmlhttpRequest=function(o){o=o||{};var c=new AbortController();var t=o.timeout?setTimeout(function(){c.abort();if(o.ontimeout)o.ontimeout();},o.timeout):null;" +
      "fetch(o.url,{method:o.method||'GET',credentials:'include',headers:o.headers||{},signal:c.signal}).then(function(r){if(t)clearTimeout(t);return r.text().then(function(x){if(o.onload)o.onload({status:r.status,responseText:x,response:x});});}).catch(function(e){if(t)clearTimeout(t);if(e&&e.name==='AbortError')return;if(o.onerror)o.onerror(e);});};})();" +
      "try{localStorage.setItem('linuxdo-im-skin'," + JSON.stringify(skin) + ");localStorage.setItem('linuxdo-im-view','im');}catch(e){}"
    );
    // 2) 上游原版：优先用更新后存在 storage 里的代码，否则用包里原版
    var code = r && r.upstream_im_code;
    if (typeof code === 'string' && code.length > 100000 && code.indexOf('linuxdo-im-skin') !== -1) {
      injectInline(code);
    } else {
      injectSrc(chrome.runtime.getURL('upstream/linuxdo-im.user.js'));
    }
  });
})();
