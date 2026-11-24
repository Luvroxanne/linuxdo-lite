// 自动化测试：AI 速读的 Markdown 渲染安全、长帖分段、提示词结构、资源打包完整性
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const LDAI = require(path.join(root, 'ai-summary.js'));

function assertNoThrow(fn, label) {
  try { fn(); } catch (e) { assert.fail(label + ' 抛出异常：' + e.message); }
}

async function runTests() {
  // 1. Markdown 渲染：标题 / 列表 / 加粗 / 代码 / 链接
  const html = LDAI.renderMarkdown([
    '## 一句话结论',
    '这篇帖子讲 **Docker 反代**，值得读。',
    '## 核心要点',
    '- 第一条 `docker`',
    '- 第二条 [文档](https://example.com/doc)',
    '1. 有序项',
    '> 引用内容',
    '```js',
    'console.log(1)',
    '```'
  ].join('\n'));
  assert.ok(html.includes('<h3>一句话结论</h3>'), '二级标题应渲染为 h3');
  assert.ok(html.includes('<strong>Docker 反代</strong>'), '粗体应渲染');
  assert.ok(html.includes('<li>第一条 <code>docker</code></li>'), '列表与行内代码应渲染');
  assert.ok(html.includes('href="https://example.com/doc"'), 'http 链接应可点击');
  assert.ok(html.includes('<ol><li>有序项</li></ol>'), '有序列表应渲染');
  assert.ok(html.includes('<blockquote>引用内容</blockquote>'), '引用应渲染');
  assert.ok(html.includes('<pre><code>console.log(1)</code></pre>'), '代码块应渲染');
  console.log('[PASS] 1. Markdown 结构渲染');

  // 2. XSS：所有用户/模型文本都必须转义，危险链接不生成 <a>
  const evil = LDAI.renderMarkdown('<img src=x onerror="alert(1)"> <script>alert(2)</script>\n\n[点我](javascript:alert(3))\n\n**<b>x</b>**');
  assert.ok(!/<img/i.test(evil), '原始 img 标签必须被转义');
  assert.ok(!/<script/i.test(evil), '原始 script 标签必须被转义');
  assert.ok(!/href="javascript:/i.test(evil), 'javascript: 链接不能生成可点击 a 标签');
  assert.ok(evil.includes('&lt;img'), 'HTML 应作为文本显示');
  assert.ok(evil.includes('&lt;script&gt;'), 'script 应作为文本显示');
  console.log('[PASS] 2. Markdown 渲染 XSS 防护');

  // 3. 异常输入不应抛错，空输入返回空串
  assert.strictEqual(LDAI.renderMarkdown(''), '');
  assert.strictEqual(LDAI.renderMarkdown(null), '');
  assertNoThrow(() => LDAI.renderMarkdown('```\n未闭合代码块'), '未闭合代码块');
  assertNoThrow(() => LDAI.renderMarkdown('###### 六级标题\n---\n***'), '边界 Markdown');
  console.log('[PASS] 3. 异常与边界输入');

  // 4. 后台长帖分段与提示词结构
  const bgCode = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  const sandbox = {
    console,
    URL,
    Date,
    setTimeout,
    clearTimeout,
    TextDecoder,
    AbortController,
    fetch: async () => ({ ok: false, status: 500 }),
    chrome: {
      runtime: {
        getManifest: () => ({ version: manifest.version }),
        onInstalled: { addListener: () => {} },
        onStartup: { addListener: () => {} },
        onConnect: { addListener: () => {} },
        onMessage: { addListener: () => {} }
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

  assert.strictEqual(typeof sandbox.aiChunk, 'function', '背景脚本应导出 aiChunk');
  const long = Array.from({ length: 80 }, (_, i) => '第' + i + '段：' + '内容'.repeat(120)).join('\n\n');
  const chunks = sandbox.aiChunk(long, 6000);
  assert.ok(chunks.length >= 2, '长文本应被分段');
  assert.ok(chunks.every(c => c.length <= 6000), '每段不能超过上限');
  assert.ok(chunks.join('').replace(/\s/g, '').length >= long.replace(/\s/g, '').length * 0.98, '分段不应丢内容');

  const brief = sandbox.aiSystemPrompt('brief');
  const deep = sandbox.aiSystemPrompt('deep');
  for (const key of ['一句话结论', '核心要点', '讨论与分歧', '值不值得读']) {
    assert.ok(brief.includes(key), '速读提示词缺少：' + key);
  }
  assert.ok(!brief.includes('关键细节'), '速读模式不应要求关键细节');
  assert.ok(deep.includes('关键细节'), '深度模式应要求关键细节');
  console.log('[PASS] 4. 长帖分段与提示词结构');

  // 5. 打包资源完整性：共享模块必须随内容脚本与页面一起加载
  const contentScript = manifest.content_scripts.find(cs => (cs.js || []).includes('content.js'));
  assert.ok(contentScript, 'manifest 应声明 content.js');
  assert.ok(contentScript.js.indexOf('ai-summary.js') >= 0, 'ai-summary.js 必须在 content.js 之前加载');
  assert.ok(contentScript.js.indexOf('ai-summary.js') < contentScript.js.indexOf('content.js'), 'ai-summary.js 必须先于 content.js');
  const sidepanel = fs.readFileSync(path.join(root, 'sidepanel.html'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'popup.html'), 'utf8');
  for (const [name, html] of [['sidepanel.html', sidepanel], ['popup.html', popup]]) {
    assert.ok(html.includes('src="ai-summary.js"'), name + ' 应加载 ai-summary.js');
    assert.ok(html.indexOf('ai-summary.js') < html.indexOf('popup.js'), name + ' 应先加载 ai-summary.js');
  }
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  assert.ok(workflow.includes('ai-summary.js'), '发版 zip 必须包含 ai-summary.js');
  console.log('[PASS] 5. 打包资源完整性');

  // 6. 流式解析：SSE 增量拼接、阶段消息、JSON 兜底
  const encoder = new TextEncoder();
  function sseResponse(parts) {
    let i = 0;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: async () => (i < parts.length ? { done: false, value: encoder.encode(parts[i++]) } : { done: true })
        })
      }
    };
  }
  sandbox.chrome.storage.local.get = async () => ({ ld_settings: { aiKey: 'sk-test', aiBaseUrl: 'https://ai.example.com/v1', aiModel: 'test-model' } });
  const stages = [];
  sandbox.fetch = async () => sseResponse([
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
    'data: [DONE]\n\n'
  ]);
  const streamed = await sandbox.runAiSummary({ text: '正'.repeat(200), style: 'brief', title: '标题', stream: true, send: m => stages.push(m) });
  assert.strictEqual(streamed.text, '你好，世界', 'SSE 增量应拼接成完整文本');
  assert.ok(stages.some(m => m.type === 'delta' && m.text === '你好'), '应逐段回传 delta');
  assert.ok(stages.some(m => m.type === 'stage' && m.text.includes('正在生成速读卡')), '应回传阶段状态');
  assert.strictEqual(streamed.meta.model, 'test-model');

  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '整段返回' } }] })
  });
  const jsonFallback = await sandbox.runAiSummary({ text: '短帖正文', stream: true, send: () => {} });
  assert.strictEqual(jsonFallback.text, '整段返回', '中转忽略 stream 时应兼容 JSON 响应');
  console.log('[PASS] 6. 流式 SSE 与 JSON 兜底');

  // 7. 长帖 map-reduce：多段并发速读后再汇总
  let calls = 0;
  sandbox.fetch = async (url, init) => {
    calls++;
    const body = JSON.parse(init.body);
    if (String(body.messages[0].content).includes('分段速读')) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json; charset=utf-8' },
        json: async () => ({ choices: [{ message: { content: '- 这一段讲了要点' } }] })
      };
    }
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"最终速读"}}]}\n\n',
      'data: [DONE]\n\n'
    ]);
  };
  const bigText = Array.from({ length: 60 }, (_, i) => '第' + i + '段' + '内容'.repeat(200)).join('\n\n');
  const reduced = await sandbox.runAiSummary({ text: bigText, style: 'deep', title: '长帖', stream: true, send: () => {} });
  assert.ok(reduced.meta.chunks >= 2, '长帖应拆成多段');
  assert.strictEqual(reduced.text, '最终速读', '汇总步骤应输出最终速读卡');
  assert.ok(calls >= reduced.meta.chunks + 1, '每段都要单独调用，最后再汇总一次');
  assert.strictEqual(reduced.meta.style, 'deep');
  console.log('[PASS] 7. 长帖分段汇总');

  console.log('\nALL 7 AI TESTS PASSED');
}

runTests().catch(err => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
