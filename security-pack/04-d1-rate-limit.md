# 04. D1日次レートリミット

Workers Rate Limiting API は period 10/60秒のみ・ロケーションローカルで、1日単位の正確な制限は不可。
→ **D1のアトミックカウンタで自作する。**

## 1. D1作成

```bash
guard -- npx wrangler d1 create <db名>
```

```jsonc
// wrangler.jsonc
"d1_databases": [{ "binding": "<BINDING>", "database_name": "<db名>", "database_id": "<id>" }]
```

## 2. テーブル

```sql
CREATE TABLE IF NOT EXISTS chat_usage (
  day TEXT NOT NULL, ip TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, ip)
);
CREATE TABLE IF NOT EXISTS usage_daily (
  day TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0
);
```

## 3. カウンタ(chat-api.ts)

IP単位(例: 100回/日) + グローバル(例: 500回/日 = コスト絶対上限)の2段構え。

```ts
// 日付はJST基準
const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';

// IP単位
const row = await env.<BINDING>.prepare(
  `INSERT INTO chat_usage (day, ip, count) VALUES (?, ?, 1)
   ON CONFLICT(day, ip) DO UPDATE SET count = count + 1
   RETURNING count`
).bind(jstDate, ip).first();
if (row && row.count > 100) return json({ error: '本日の利用回数に達しました。また明日お試しください。' }, 429);

// グローバル
const gRow = await env.<BINDING>.prepare(
  `INSERT INTO usage_daily (day, count) VALUES (?, 1)
   ON CONFLICT(day) DO UPDATE SET count = count + 1
   RETURNING count`
).bind(jstDate).first();
if (gRow && gRow.count > 500) return json({ error: '本日の回答数に達しました。また明日お試しください。' }, 429);
```

## 4. フェイルオープン

DB障害時は制限をスキップしてサービス継続(エラーログのみ)。課金停止より可用性優先。

```ts
try { /* 上記 */ } catch (error) {
  console.error('daily_limit_failed', { type: error instanceof Error ? error.name : 'unknown' });
}
```

## 5. テスト

- モックDBでSQL分岐(usage_daily含むか)を識別してカウント
- IP 101回目→429 / グローバル501回目→429 / 100回以下→200 / DB例外→200(フェイルオープン)
