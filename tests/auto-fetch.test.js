// 自动化测试：没有 linux.do 标签页时，后台自动开临时页取等级 / LDC / 帖子并关闭
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const bgCode = fs.readFileSync(path.join(root, 'background.js'), 'utf8');

function createSandbox(fetchImpl) {
  let msgHandler = null;
  const created = [];
  const removed = [];
  const sandbox = {
    console,
    URL,
    Date,
    setTimeout,
    clearTimeout,
    TextDecoder,
    AbortController,
    fetch: fetchImpl,
    chrome: {
      runtime: {
        getManifest: () => ({ version: '1.7.3' }),
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        onMessage: { addListener: fn => { msgHandler = fn; } }
      },
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        sync: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      },
      sidePanel: { setPanelBehavior: async () => {} },
      tabs: {
        query: async () => [],
        create: async opts => { const tab = { id: 100 + created.length, status: 'complete', url: opts.url }; created.push(tab); return tab; },
        get: async id => ({ id, status: 'complete' }),
        remove: async id => { removed.push(id); },
        sendMessage: async (id, msg) => {
          if (msg.type === 'get-level-data') {
            return { ok: true, data: { username: 'tester', trust_level: 2, summary: { posts_read_count: 123 }, gamification_score: 200 } };
          }
          if (msg.type === 'fetch-via-page') {
            return { ok: true, data: { topic_list: { topics: [{ id: 1, title: '自动过 CF' }] } } };
          }
          if (msg.type === 'get-page-html') {
            return { ok: true, html: '<html>信任级别 3 的要求</html>' };
          }
          if (msg.type === 'same-origin-fetch') {
            return { ok: true, status: 200, text: JSON.stringify({ data: { available_balance: 1600, community_balance: 1500 } }) };
          }
          return { ok: false };
        }
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(bgCode, sandbox);
  return {
    sandbox,
    created,
    removed,
    sendMessage: msg => new Promise(resolve => msgHandler(msg, {}, resolve))
  };
}

async function runTests() {
  // 1. 等级：没有论坛标签页时自动开后台页取数并关闭
  const env1 = createSandbox(async () => ({ ok: false, status: 500 }));
  const level = await env1.sendMessage({ type: 'fetch-level' });
  assert.strictEqual(level.ok, true, '应能自动取得等级数据');
  assert.strictEqual(level.data.username, 'tester');
  assert.strictEqual(env1.created.length, 1, '应自动开一个后台页');
  assert.deepStrictEqual(env1.removed, env1.created.map(t => t.id), '取完应关闭自动开的页面');
  console.log('[PASS] 1. 无论坛页时自动获取等级 / 成员信息');

  // 2. 帖子：后台直连被 CF 拦，自动开页中转并关闭
  const env2 = createSandbox(async () => ({ ok: true, status: 200, text: async () => '<html>Cloudflare</html>' }));
  const topics = await env2.sendMessage({ type: 'fetch-topics', kind: 'top' });
  assert.strictEqual(topics.ok, true, '应自动过 CF 拿到帖子');
  assert.strictEqual(topics.data.topic_list.topics[0].title, '自动过 CF');
  assert.ok(env2.created.length >= 1, '应自动开后台页');
  assert.strictEqual(env2.removed.length, env2.created.length, '后台页应全部关闭');
  console.log('[PASS] 2. 只开插件也能自动过 CF 看帖');

  // 3. Connect：直连页面没有目标卡片，自动开页取 HTML
  const env3 = createSandbox(async () => ({ ok: true, status: 200, text: async () => '<html>login</html>' }));
  const connect = await env3.sendMessage({ type: 'fetch-connect' });
  assert.strictEqual(connect.ok, true);
  assert.ok(connect.html.includes('信任级别'), '应通过后台页拿到 Connect 卡片');
  assert.strictEqual(env3.removed.length, env3.created.length, 'Connect 临时页应关闭');
  console.log('[PASS] 3. Connect 数据自动同步');

  // 4. LDC：直连失败后自动开 credit 页取余额
  const env4 = createSandbox(async () => { throw new Error('CF block'); });
  const ldc = await env4.sendMessage({ type: 'fetch-ldc' });
  assert.strictEqual(ldc.ok, true);
  assert.strictEqual(ldc.data.data.available_balance, 1600);
  assert.strictEqual(env4.removed.length, env4.created.length, 'LDC 临时页应关闭');
  console.log('[PASS] 4. LDC 余额自动同步');

  // 5. 已有论坛页时优先复用，不新开也不关闭用户标签页
  const env5 = createSandbox(async () => ({ ok: true, status: 200, text: async () => '<html>Cloudflare</html>' }));
  env5.sandbox.chrome.tabs.query = async () => [{ id: 7, status: 'complete', url: 'https://linux.do/' }];
  const topics5 = await env5.sendMessage({ type: 'fetch-topics', kind: 'top' });
  assert.strictEqual(topics5.ok, true);
  assert.strictEqual(env5.created.length, 0, '已有论坛页时不应新开页面');
  assert.strictEqual(env5.removed.length, 0, '不应关闭用户自己的标签页');
  console.log('[PASS] 5. 复用已有论坛页且不动用户标签页');

  console.log('\nALL 5 AUTO-FETCH TESTS PASSED');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
