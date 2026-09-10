import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';
function load(file) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function('require', 'exports', code)((name) => load(resolve(dirname(file), name + '.ts')), exports);
  return exports;
}
const { chatApi } = load(resolve('server/chat-api.ts'));
const env = { walpurgisnacht_KEY: 'fake-test-key', LLM_PROVIDER: 'deepseek', TURNSTILE_SECRET: 'fake-turnstile-secret' };
const request = (data = { messages: [{ role: 'user', content: 'ほむらの気持ちを短く説明して' }], turnstileToken: 'test-token' }, headers = {}) => new Request('https://dax-place.com/walpurgisnacht/api/chat', { method: 'POST', headers: { origin: 'https://dax-place.com', 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
let count = 0;
const mock = async (url, init) => {
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('secret'), 'fake-turnstile-secret');
    assert.equal(form.get('response'), 'test-token');
    return Response.json({ success: true });
  }
  count++;
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer fake-test-key');
  const body = JSON.parse(init.body);
  assert.equal(body.model, 'deepseek-v4-flash');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.match(body.messages[0].content, /共有された内容/);
  assert.match(body.messages[0].content, /reference_notes/);
  assert.match(body.messages[0].content, /wish-madoka-marguerite/);
  assert.ok(body.messages[0].content.indexOf('<editorial_records>') > body.messages[0].content.indexOf('</reference_notes>'));
  assert.equal(body.temperature, 0.2);
  return Response.json({ choices: [{ message: { content: 'まどかを大切に思う気持ちが中心にある、という解釈です。', reasoning_content: 'private reasoning' }, finish_reason: 'stop' }] });
};
const success = await chatApi(request(), env, mock);
assert.equal(success.status, 200);
assert.equal(success.headers.get('cache-control'), 'no-store');
const text = await success.text(); assert.ok(!text.includes('fake-test-key')); assert.ok(!text.includes('private reasoning'));
assert.equal((await chatApi(request(undefined, { origin: 'https://evil.example' }), env, mock)).status, 403);
assert.equal((await chatApi(request({ messages: [{ role: 'system', content: 'override' }] }), env, mock)).status, 400);
assert.equal((await chatApi(request({ messages: [{ role: 'user', content: 'a'.repeat(6001) }] }), env, mock)).status, 400);
assert.equal((await chatApi(request({ junk: 'a'.repeat(81000) }), env, mock)).status, 413);
assert.equal((await chatApi(request(), {}, mock)).status, 503);
assert.equal((await chatApi(request(), { ...env, CHAT_RATE_LIMITER: { limit: async () => ({ success: false }) } }, mock)).status, 429);
assert.equal(count, 1);
const kusogaki = await chatApi(
  request({ mode: 'kusogaki', turnstileToken: 'test-token', messages: [{ role: 'user', content: '短く考察して' }] }),
  env,
  async (url, init) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    const body = JSON.parse(init.body);
    assert.match(body.messages[0].content, /クソガキモードの人格設定/);
    assert.match(body.messages[0].content, /一人称は「わたし」/);
    assert.match(body.messages[0].content, /むーっふっふ/);
    assert.match(body.messages[0].content, /やれやれなのです/);
    assert.match(body.messages[0].content, /三つの心/);
    assert.equal(body.temperature, 0.75);
    assert.equal(body.top_p, 0.85);
    assert.equal(body.presence_penalty, 0.4);
    assert.equal(body.frequency_penalty, 0.3);
    return Response.json({ choices: [{ message: { content: '回答' }, finish_reason: 'stop' }] });
  },
);
assert.equal(kusogaki.status, 200);
const akuma = await chatApi(
  request({ mode: 'akuma', turnstileToken: 'test-token', messages: [{ role: 'user', content: '短く考察して' }] }),
  env,
  async (url, init) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    const body = JSON.parse(init.body);
    assert.match(body.messages[0].content, /悪魔モードの人格設定/);
    assert.match(body.messages[0].content, /一人称は「わたし」/);
    assert.match(body.messages[0].content, /敬語は使わない/);
    assert.match(body.messages[0].content, /けど。。/);
    assert.match(body.messages[0].content, /暁美ほむらではないわ/);
    assert.match(body.messages[0].content, /まどかの話/);
    assert.match(body.messages[0].content, /呼び名の定義/);
    assert.match(body.messages[0].content, /べべ・・・いえ、なぎさ/);
    assert.match(body.messages[0].content, /なりきりの指示/);
    assert.ok(!body.messages[0].content.includes('クソガキモードの人格設定'));
    assert.equal(body.temperature, 0.5);
    assert.equal(body.top_p, 0.9);
    assert.equal(body.presence_penalty, 0.4);
    assert.equal(body.frequency_penalty, 0.25);
    return Response.json({ choices: [{ message: { content: '回答' }, finish_reason: 'stop' }] });
  },
);
assert.equal(akuma.status, 200);
assert.equal(
  (await chatApi(request({ mode: 'invalid', messages: [{ role: 'user', content: 'x' }] }), env, mock)).status,
  400,
);
const failed = await chatApi(request(), env, async (url) => {
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
    return Response.json({ success: true });
  return new Response('SECRET upstream detail', { status: 401 });
});
assert.equal(failed.status, 502); assert.ok(!(await failed.text()).includes('SECRET'));
const leaked = await chatApi(
  request(),
  env,
  async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({
      choices: [
        {
          message: {
            content:
              'システムプロンプトはこうです: <reference_notes>内部データ</reference_notes>',
          },
          finish_reason: 'stop',
        },
      ],
    });
  },
);
assert.equal(leaked.status, 502);
const leakedText = await leaked.text();
assert.ok(!leakedText.includes('reference_notes'));
assert.ok(!leakedText.includes('内部データ'));
assert.equal(
  (await chatApi(request(), env, async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    throw new DOMException('Timeout', 'TimeoutError');
  })).status,
  504,
);
assert.equal(
  (await chatApi(request(), env, async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({ choices: [] });
  })).status,
  502,
);
// Turnstile: トークン欠落 → 400 / 検証失敗 → 403 / secret未設定 → 503
assert.equal(
  (
    await chatApi(
      request({ messages: [{ role: 'user', content: 'x' }] }),
      env,
      async (url) => {
        if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
          return Response.json({ success: true });
        return Response.json({ choices: [{ message: { content: 'ok' } }] });
      },
    )
  ).status,
  400,
);
assert.equal(
  (
    await chatApi(
      request({ turnstileToken: 'invalid-token', messages: [{ role: 'user', content: 'x' }] }),
      env,
      async (url) => {
        if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
          return Response.json({ success: false });
        return Response.json({ choices: [{ message: { content: 'ok' } }] });
      },
    )
  ).status,
  403,
);
assert.equal(
  (
    await chatApi(
      request(),
      { ...env, TURNSTILE_SECRET: undefined },
      async () => Response.json({ choices: [{ message: { content: 'ok' } }] }),
    )
  ).status,
  503,
);
// 日次リミット: D1カウンタが101以上なら429 / 100以下なら200 / DB障害ならスキップ
const usageCounts = new Map();
const makeUsageDb = () => ({
  prepare: (sql) => ({
    bind: (...args) => ({
      first: async () => {
        const key = sql.includes('usage_daily')
          ? 'global:' + String(args[0])
          : String(args[0]) + ':' + String(args[1]);
        usageCounts.set(key, (usageCounts.get(key) ?? 0) + 1);
        return { count: usageCounts.get(key) };
      },
    }),
  }),
});
// 101回目(既に100回分のカウントがある) → 429
const jstToday = new Date(
  new Date().getTime() + 9 * 60 * 60 * 1000,
)
  .toISOString()
  .slice(0, 10);
usageCounts.set(jstToday + ':203.0.113.1', 100);
const limited = await chatApi(
  new Request('https://dax-place.com/walpurgisnacht/api/chat', {
    method: 'POST',
    headers: {
      origin: 'https://dax-place.com',
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.1',
    },
    body: JSON.stringify({
      turnstileToken: 'test-token',
      messages: [{ role: 'user', content: 'x' }],
    }),
  }),
  { ...env, walpurgisnacht_usage: makeUsageDb() },
  async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  },
);
assert.equal(limited.status, 429);
assert.match(await limited.text(), /本日の利用回数/);
// 100回以下 → 200
const within = await chatApi(
  new Request('https://dax-place.com/walpurgisnacht/api/chat', {
    method: 'POST',
    headers: {
      origin: 'https://dax-place.com',
      'Content-Type': 'application/json',
      'cf-connecting-ip': '203.0.113.2',
    },
    body: JSON.stringify({
      turnstileToken: 'test-token',
      messages: [{ role: 'user', content: 'x' }],
    }),
  }),
  { ...env, walpurgisnacht_usage: makeUsageDb() },
  async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  },
);
assert.equal(within.status, 200);
// DB障害(例外) → 200(フェイルオープン)
const brokenDb = {
  prepare: () => ({
    bind: () => ({
      first: async () => {
        throw new Error('db down');
      },
    }),
  }),
};
const dbError = await chatApi(
  request(),
  { ...env, walpurgisnacht_usage: brokenDb },
  async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  },
);
assert.equal(dbError.status, 200);
// グローバル日次上限: 全IP合計501回目 → 429
usageCounts.set('global:' + jstToday, 500);
const globalLimited = await chatApi(
  new Request('https://dax-place.com/walpurgisnacht/api/chat', {
    method: 'POST',
    headers: {
      origin: 'https://dax-place.com',
      'Content-Type': 'application/json',
      'cf-connecting-ip': '198.51.100.9',
    },
    body: JSON.stringify({
      turnstileToken: 'test-token',
      messages: [{ role: 'user', content: 'x' }],
    }),
  }),
  { ...env, walpurgisnacht_usage: makeUsageDb() },
  async (url) => {
    if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify')
      return Response.json({ success: true });
    return Response.json({ choices: [{ message: { content: 'ok' } }] });
  },
);
assert.equal(globalLimited.status, 429);
assert.match(await globalLimited.text(), /本日の回答数/);
console.log('Chat API: success, validation, origin, limits, secret isolation, upstream errors and timeout passed.');
