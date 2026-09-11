# 05. D1クリーンアップ(Cron Trigger + scheduled)

古い利用記録を自動削除してD1の肥大化を防ぐ。

## 1. Cron Trigger設定(wrangler.jsonc)

```jsonc
"triggers": { "crons": ["0 18 * * *"] }  // UTC18時 = JST3時
```

deployで自動登録。確認は API:
```bash
curl -s https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/workers/scripts/{name}/schedules \
  -H "Authorization: Bearer $TOKEN"
```

## 2. scheduledハンドラ(worker.ts)

```ts
async scheduled(_controller, env, _ctx): Promise<void> {
  if (!env.<BINDING>) return;
  await env.<BINDING>.prepare(`DELETE FROM chat_usage WHERE day < date('now', '-14 days')`).bind().run?.();
  await env.<BINDING>.prepare(`DELETE FROM usage_daily WHERE day < date('now', '-31 days')`).bind().run?.();
}
```

- chat_usage(日×IP、増えやすい): 14日保持
- usage_daily(日): 31日保持

## 3. ChatEnv型

```ts
<BINDING>?: {
  prepare(sql: string): { bind(...args: unknown[]): {
    first<T>(): Promise<T | null>;
    run?(): Promise<{ success: boolean }>;
  } };
};
```
