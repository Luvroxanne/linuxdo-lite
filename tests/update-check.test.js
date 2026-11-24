// 自动化测试：验证扩展自动更新检测逻辑（版本号比对、GitHub Releases 解析、manifest 降级回退）及扩展包完整性
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const bgCode = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function createBgSandbox(mockFetch, currentVersion) {
  let msgHandler = null;
  const sandbox = {
    console,
    URL,
    Date,
    setTimeout,
    clearTimeout,
    fetch: mockFetch,
    chrome: {
      runtime: {
        getManifest: () => ({ version: currentVersion }),
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
      tabs: { create: async () => ({}), remove: async () => {}, sendMessage: async () => ({}) }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(bgCode, sandbox);
  return {
    sandbox,
    sendMessage: msg => new Promise(resolve => msgHandler(msg, {}, resolve))
  };
}

async function runTests() {
  // 1. manifest.json 资源完整性校验
  assert.ok(/^\d+\.\d+\.\d+$/.test(manifest.version), 'manifest.version 应为三段式版本号');
  assert.ok(manifest.host_permissions.includes('https://api.github.com/*'), '缺少 api.github.com 权限');
  const requiredFiles = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.side_panel.default_path,
    ...Object.values(manifest.icons),
    ...manifest.web_accessible_resources.flatMap(w => w.resources)
  ];
  for (const rel of requiredFiles) {
    assert.ok(fs.existsSync(path.join(root, rel)), `缺少声明的文件: ${rel}`);
  }
  console.log('[PASS] 1. manifest.json 权限与资源文件完整性校验');

  // 2. compareSemver 边界测试
  const { sandbox } = createBgSandbox(async () => ({ ok: false, status: 500 }), '1.6.15');
  assert.strictEqual(sandbox.compareSemver('1.6.16', '1.6.15'), 1);
  assert.strictEqual(sandbox.compareSemver('1.6.15', '1.6.15'), 0);
  assert.strictEqual(sandbox.compareSemver('1.6.9', '1.6.15'), -1);
  assert.strictEqual(sandbox.compareSemver('v2.0.0', '1.6.15'), 1);
  console.log('[PASS] 2. compareSemver 版本号比对测试');

  // 3. GitHub Releases API 发现新版本（优先选择 .zip 附件）
  const env1 = createBgSandbox(async url => {
    assert.ok(url.includes('/releases/latest'));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: 'v1.7.0',
        html_url: 'https://github.com/Luvroxanne/linuxdo-lite/releases/tag/v1.7.0',
        body: '新版本说明',
        assets: [
          { name: 'checksums.txt', browser_download_url: 'https://example.com/checksums.txt' },
          { name: 'linuxdo-lite.zip', browser_download_url: 'https://github.com/Luvroxanne/linuxdo-lite/releases/download/v1.7.0/linuxdo-lite.zip' }
        ]
      })
    };
  }, '1.6.15');
  const res1 = await env1.sendMessage({ type: 'check-ext-update' });
  assert.strictEqual(res1.ok, true);
  assert.strictEqual(res1.hasUpdate, true);
  assert.strictEqual(res1.latestVersion, '1.7.0');
  assert.strictEqual(res1.source, 'release');
  assert.ok(res1.downloadUrl.endsWith('linuxdo-lite.zip'));
  console.log('[PASS] 3. GitHub Releases 检测到新版本并定位 ZIP 下载地址');

  // 4. 已是最新版本测试
  const env2 = createBgSandbox(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ tag_name: 'v1.6.15', assets: [] })
  }), '1.6.15');
  const res2 = await env2.sendMessage({ type: 'check-ext-update' });
  assert.strictEqual(res2.ok, true);
  assert.strictEqual(res2.hasUpdate, false);
  console.log('[PASS] 4. 已是最新版本判定测试');

  // 5. 无 Release（404）时自动降级到 raw manifest.json
  const env3 = createBgSandbox(async url => {
    if (url.includes('/releases/latest')) return { ok: false, status: 404 };
    if (url.includes('raw.githubusercontent.com')) {
      return { ok: true, status: 200, json: async () => ({ version: '1.6.16' }) };
    }
    throw new Error('Unexpected URL: ' + url);
  }, '1.6.15');
  const res3 = await env3.sendMessage({ type: 'check-ext-update' });
  assert.strictEqual(res3.ok, true);
  assert.strictEqual(res3.hasUpdate, true);
  assert.strictEqual(res3.source, 'manifest');
  assert.strictEqual(res3.latestVersion, '1.6.16');
  assert.ok(res3.downloadUrl.endsWith('/archive/refs/heads/main.zip'), 'Release 包确实不存在时才退回 main 源码包');
  assert.strictEqual(res3.downloadKind, 'source');
  console.log('[PASS] 5. 无 Release 时自动降级读取 manifest.json 测试');

  // 6. Releases API 失败但 Release 包存在时，仍下载 linuxdo-lite.zip（文件名不带 -main）
  const env4 = createBgSandbox(async (url, init) => {
    if (url.includes('/releases/latest')) return { ok: false, status: 403 };
    if (url.includes('raw.githubusercontent.com')) {
      return { ok: true, status: 200, json: async () => ({ version: '1.6.16' }) };
    }
    if (url.includes('/releases/download/v1.6.16/linuxdo-lite.zip')) {
      assert.ok(init && init.method === 'HEAD', '应先 HEAD 探测 Release 包是否存在');
      return { ok: true, status: 200 };
    }
    throw new Error('Unexpected URL: ' + url);
  }, '1.6.15');
  const res4 = await env4.sendMessage({ type: 'check-ext-update' });
  assert.strictEqual(res4.ok, true);
  assert.strictEqual(res4.hasUpdate, true);
  assert.strictEqual(res4.downloadKind, 'release');
  assert.ok(res4.downloadUrl.endsWith('/releases/download/v1.6.16/linuxdo-lite.zip'), '应返回固定附件名 linuxdo-lite.zip');
  console.log('[PASS] 6. API 失败时仍定位 Release 同名 ZIP');

  console.log('\nALL 6 TESTS PASSED');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
