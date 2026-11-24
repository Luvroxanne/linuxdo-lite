// 上游原版加载器：在 document-start 时，把原版 IM 脚本注入到页面主世界。
// 关键：linux.do 的 CSP 禁内联脚本，所以一律用 s.src 外链注入，绝不用 s.textContent 内联注入。
// GM 垫片和上游原版都是包里的外链文件，按顺序加载：垫片 onload 后再注入上游原版。
// 注意：chrome.storage.local 里的 upstream_im_code 是字符串，只能内联注入，会被 CSP 拦掉，
// 所以这里一律用包里捆绑的 upstream/linuxdo-im.user.js（v1.3.7），上游更新请等发新版，不要走 storage 内联。
(function () {
  if (window.top !== window.self) return;
  if (location.pathname.indexOf('/pub/') === 0) return;

  function injectSrc(url, onload) {
    var s = document.createElement('script');
    s.src = url;
    if (onload) s.onload = onload;
    s.onerror = function () { console.warn('[linuxdo-lite] failed to load', url); };
    (document.documentElement || document.head || document.body).appendChild(s);
  }

  chrome.storage.local.get(['ld_settings'], function (r) {
    var settings = (r && r.ld_settings) || {};
    var theme = settings.theme || 'default';
    if (theme !== 'dingtalk' && theme !== 'feishu' && theme !== 'wecom') {
      try { localStorage.setItem('linuxdo-im-view', 'native'); } catch (e) {}
      return;
    }
    var skin = theme;
    try { localStorage.setItem('linuxdo-im-skin', skin); localStorage.setItem('linuxdo-im-view', 'im'); } catch (e) {}
    injectSrc(chrome.runtime.getURL('upstream/gm-im-shim.js'), function () {
      injectSrc(chrome.runtime.getURL('upstream/linuxdo-im.user.js'));
    });
  });
})();
