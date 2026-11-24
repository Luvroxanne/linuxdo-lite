// ReadBoost GM 垫片：在页面主世界提供 GM_getValue / GM_setValue / GM_registerMenuCommand
// 供 upstream/linuxdo-readboost.user.js（原版 v2.2，仅补高级设置持久化与风险提示）直接运行，
// 并把油猴菜单命令桥接到：1) 页面顶栏快捷开始/停止按钮；2) 扩展侧边栏按钮。
// 性能优化：不监听整棵 document.documentElement，仅监听 .header-buttons 直接子节点与路由切换。
(function () {
  if (window.__ldReadBoostShimLoaded) return;
  window.__ldReadBoostShimLoaded = true;

  var STORAGE_PREFIX = 'ld_readboost_';
  var commands = [];
  var headerObserver = null;
  var observedHeader = null;
  window.__ldReadBoostCommands = commands;

  if (typeof window.GM_getValue !== 'function') {
    window.GM_getValue = function (key, defaultValue) {
      try {
        var raw = localStorage.getItem(STORAGE_PREFIX + key);
        if (raw === null) return defaultValue;
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    };
  }

  if (typeof window.GM_setValue !== 'function') {
    window.GM_setValue = function (key, value) {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
      } catch (e) {}
    };
  }

  if (typeof window.GM_registerMenuCommand !== 'function') {
    window.GM_registerMenuCommand = function (name, fn) {
      if (typeof fn !== 'function') return;
      commands.push({ name: String(name || ''), fn: fn });
    };
  }

  function findCommand(cmd) {
    var keyword = cmd === 'start' ? '开始' : (cmd === 'stop' ? '停止' : (cmd === 'settings' ? '设置' : ''));
    for (var i = 0; i < commands.length; i++) {
      if (keyword && commands[i].name.indexOf(keyword) !== -1) return commands[i];
    }
    return null;
  }

  function runCommand(cmd) {
    var item = findCommand(cmd);
    if (!item) return { ok: false, error: 'ReadBoost 命令尚未注册（如首次弹出了风险提示，请刷新页面并输入“明白”）' };
    try {
      item.fn();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  }

  function syncHeaderButtons() {
    var isTopic = /^https:\/\/linux\.do\/t\/[^/]+\/\d+/.test(window.location.href);
    var existingStart = document.getElementById('ldReadBoostStartBtn');
    var existingStop = document.getElementById('ldReadBoostStopBtn');
    if (!isTopic) {
      if (existingStart) existingStart.remove();
      if (existingStop) existingStop.remove();
      return;
    }
    var label = document.getElementById('readBoostStatusLabel');
    if (!label || !label.parentElement) return;
    if (!existingStart) {
      var startBtn = document.createElement('button');
      startBtn.id = 'ldReadBoostStartBtn';
      startBtn.type = 'button';
      startBtn.title = 'ReadBoost 开始执行';
      startBtn.textContent = '▶';
      startBtn.style.cssText = 'margin-right:4px;padding:4px 7px;border:none;border-radius:4px;background:var(--primary-low);color:#2e8b57;font-size:12px;cursor:pointer;line-height:1;';
      startBtn.addEventListener('click', function () { runCommand('start'); });
      label.insertAdjacentElement('afterend', startBtn);
      existingStart = startBtn;
    }
    if (!existingStop) {
      var stopBtn = document.createElement('button');
      stopBtn.id = 'ldReadBoostStopBtn';
      stopBtn.type = 'button';
      stopBtn.title = 'ReadBoost 停止执行';
      stopBtn.textContent = '⏹';
      stopBtn.style.cssText = 'margin-right:8px;padding:4px 7px;border:none;border-radius:4px;background:var(--primary-low);color:#dc3545;font-size:12px;cursor:pointer;line-height:1;';
      stopBtn.addEventListener('click', function () { runCommand('stop'); });
      existingStart.insertAdjacentElement('afterend', stopBtn);
    }
  }

  // 仅监听 .header-buttons 直接子节点变化，避免全页面 subtree 监听造成 CPU/内存开销
  function bindHeaderObserver() {
    var header = document.querySelector('.header-buttons');
    if (!header || header === observedHeader) return;
    if (headerObserver) headerObserver.disconnect();
    observedHeader = header;
    headerObserver = new MutationObserver(syncHeaderButtons);
    headerObserver.observe(header, { childList: true });
    syncHeaderButtons();
  }

  var origPushState = history.pushState;
  history.pushState = function () {
    var ret = origPushState.apply(this, arguments);
    setTimeout(function () { bindHeaderObserver(); syncHeaderButtons(); }, 600);
    return ret;
  };
  window.addEventListener('popstate', function () {
    setTimeout(function () { bindHeaderObserver(); syncHeaderButtons(); }, 600);
  });
  setTimeout(function () { bindHeaderObserver(); syncHeaderButtons(); }, 400);
  setTimeout(function () { bindHeaderObserver(); syncHeaderButtons(); }, 1500);

  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== 'ld-lite-readboost') return;
    var reqId = event.data.reqId;
    var cmd = event.data.cmd;
    if (cmd === 'ping') {
      var label = document.getElementById('readBoostStatusLabel');
      window.postMessage({
        source: 'ld-lite-readboost-res',
        reqId: reqId,
        ok: true,
        loaded: commands.length > 0,
        isTopic: /^https:\/\/linux\.do\/t\/[^/]+\/\d+/.test(window.location.href),
        status: label ? label.textContent : ''
      }, '*');
      return;
    }
    var res = runCommand(cmd);
    window.postMessage({
      source: 'ld-lite-readboost-res',
      reqId: reqId,
      ok: res.ok,
      error: res.error || ''
    }, '*');
  });
})();
