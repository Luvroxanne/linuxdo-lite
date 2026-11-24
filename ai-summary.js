// ai-summary.js — AI 速读共享模块：Markdown 渲染、本地缓存、流式总结客户端。
// 侧边栏（popup.js）、论坛页（content.js）、后台（background.js 只做 API 调用）共用。
(function (root) {
  'use strict';

  const CACHE_NAME = 'ld_ai_cache_v1';
  const CACHE_TTL = 7 * 24 * 3600 * 1000;
  const CACHE_MAX = 40;

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 行内格式：先转义，再处理代码 / 粗体 / 斜体 / 链接。占位符避免代码块被二次解析。
  function inline(s) {
    let t = escapeHtml(s);
    const codes = [];
    t = t.replace(/`([^`]+)`/g, function (_, c) {
      codes.push(c);
      return '\u0001' + (codes.length - 1) + '\u0001';
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (_, label, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    t = t.replace(/\u0001(\d+)\u0001/g, function (_, i) { return '<code>' + codes[Number(i)] + '</code>'; });
    return t;
  }

  function renderMarkdown(md) {
    const src = String(md == null ? '' : md).replace(/\r\n?/g, '\n').trim();
    if (!src) return '';
    const lines = src.split('\n');
    const out = [];
    let para = [];
    let list = null;
    let quote = [];
    let i = 0;

    function closePara() {
      if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; }
    }
    function closeList() {
      if (!list) return;
      out.push('<' + list.type + '>' + list.items.map(function (x) { return '<li>' + inline(x) + '</li>'; }).join('') + '</' + list.type + '>');
      list = null;
    }
    function closeQuote() {
      if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; }
    }
    function closeAll() { closePara(); closeList(); closeQuote(); }

    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();

      if (/^```/.test(t)) {
        closeAll();
        const code = [];
        i++;
        while (i < lines.length && !/^```/.test(lines[i].trim())) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }
      if (!t) { closeAll(); i++; continue; }

      const h = t.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        closeAll();
        const lvl = Math.min(h[1].length + 1, 5);
        out.push('<h' + lvl + '>' + inline(h[2]) + '</h' + lvl + '>');
        i++;
        continue;
      }
      if (/^([-*_])\1{2,}$/.test(t.replace(/\s/g, ''))) { closeAll(); out.push('<hr>'); i++; continue; }
      if (/^[-*+]\s+/.test(t)) {
        closePara(); closeQuote();
        if (!list || list.type !== 'ul') { closeList(); list = { type: 'ul', items: [] }; }
        list.items.push(t.replace(/^[-*+]\s+/, ''));
        i++;
        continue;
      }
      if (/^\d+[.)]\s+/.test(t)) {
        closePara(); closeQuote();
        if (!list || list.type !== 'ol') { closeList(); list = { type: 'ol', items: [] }; }
        list.items.push(t.replace(/^\d+[.)]\s+/, ''));
        i++;
        continue;
      }
      if (/^>\s?/.test(t)) {
        closePara(); closeList();
        quote.push(t.replace(/^>\s?/, ''));
        i++;
        continue;
      }
      closeList(); closeQuote();
      para.push(t);
      i++;
    }
    closeAll();
    return out.join('');
  }

  function hasStorage() {
    return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  }

  function cacheKey(topicKey, style) { return String(topicKey) + '|' + (style || 'brief'); }

  async function readCache() {
    if (!hasStorage()) return {};
    const r = await chrome.storage.local.get(CACHE_NAME);
    return (r && r[CACHE_NAME]) || {};
  }

  async function writeCache(all) {
    if (!hasStorage()) return;
    const obj = {};
    obj[CACHE_NAME] = all;
    await chrome.storage.local.set(obj);
  }

  async function cacheGet(topicKey, style) {
    if (!topicKey) return null;
    const all = await readCache();
    const item = all[cacheKey(topicKey, style)];
    if (!item || !item.text || !item.ts) return null;
    if (Date.now() - item.ts > CACHE_TTL) return null;
    return item;
  }

  async function cacheSet(topicKey, style, res) {
    if (!topicKey || !res || !res.text) return;
    const all = await readCache();
    all[cacheKey(topicKey, style)] = { text: res.text, meta: res.meta || {}, ts: Date.now() };
    Object.keys(all)
      .sort(function (a, b) { return (all[b].ts || 0) - (all[a].ts || 0); })
      .slice(CACHE_MAX)
      .forEach(function (k) { delete all[k]; });
    await writeCache(all);
  }

  async function clearCache() {
    if (!hasStorage()) return;
    await chrome.storage.local.remove(CACHE_NAME);
  }

  // 返回 { promise, cancel }：promise 在 done 时解析，cancel 立即断开后台流并停止计费。
  function summarize(opts) {
    const o = opts || {};
    const style = o.style || 'brief';
    let cancelled = false;
    let finished = false;
    let port = null;

    function cancel() {
      if (finished) return;
      cancelled = true;
      try { if (port) port.disconnect(); } catch (e) {}
    }

    const promise = (async function () {
      if (!o.force && o.topicKey) {
        const hit = await cacheGet(o.topicKey, style);
        if (hit && !cancelled) {
          if (o.onStage) o.onStage('已命中本地缓存');
          if (o.onDelta) o.onDelta(hit.text, hit.text);
          return { text: hit.text, cached: true, meta: hit.meta || {} };
        }
      }
      if (cancelled) throw new Error('已停止');
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.connect) {
        throw new Error('当前环境不支持 AI 总结');
      }

      const result = await new Promise(function (resolve, reject) {
        try {
          port = chrome.runtime.connect({ name: 'ld-ai-summarize' });
        } catch (e) {
          reject(new Error('无法连接后台：' + (e.message || e)));
          return;
        }
        let full = '';
        port.onMessage.addListener(function (m) {
          if (!m) return;
          if (m.type === 'stage') {
            if (o.onStage) o.onStage(m.text || '');
          } else if (m.type === 'delta') {
            full += m.text || '';
            if (o.onDelta) o.onDelta(m.text || '', full);
          } else if (m.type === 'done') {
            finished = true;
            resolve({ text: full, meta: m.meta || {} });
            try { port.disconnect(); } catch (e) {}
          } else if (m.type === 'error') {
            finished = true;
            reject(new Error(m.error || '总结失败'));
            try { port.disconnect(); } catch (e) {}
          }
        });
        port.onDisconnect.addListener(function () {
          if (finished) return;
          finished = true;
          if (cancelled) reject(new Error('已停止'));
          else if (full.trim()) resolve({ text: full, meta: {} });
          else reject(new Error('后台连接中断，请重试'));
        });
        try {
          port.postMessage({ type: 'summarize', text: o.text, style: style, title: o.title || '' });
        } catch (e) {
          reject(new Error('发送失败：' + (e.message || e)));
        }
      });

      if (!cancelled && o.topicKey) {
        try { await cacheSet(o.topicKey, style, result); } catch (e) {}
      }
      return result;
    })();

    return { promise: promise, cancel: cancel };
  }

  const api = {
    escapeHtml: escapeHtml,
    renderMarkdown: renderMarkdown,
    cacheGet: cacheGet,
    cacheSet: cacheSet,
    clearCache: clearCache,
    summarize: summarize
  };

  root.LDAI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
