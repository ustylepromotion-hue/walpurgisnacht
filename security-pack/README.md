# ワルプルBOT 公開向けセキュリティパック

一般公開する Cloudflare Worker (静的UI + LLM API) に施したセキュリティ対策一式の再現パック。
適用対象: Next.js/vinext 系 UI + DeepSeek 等の LLM API を Worker で配信する構成。

実装元: `/Users/ust/Desktop/ワルプルBOT` (dax-place.com/walpurgisnacht, 2026-09-10)

## 構成(7レイヤー)

```
1. Turnstile 人間認証        … ボット・スクリプト遮断(トークン必須)
2. セキュリティヘッダー      … CSP/HSTS/フレーム拒否等6種
3. 出力フィルタ              … プロンプトインジェクション対策(内部構造漏洩遮断)
4. IP日次リミット(100回/日) … D1アトミックカウンタ
5. グローバル日次リミット(500回/日) … コスト絶対上限
6. D1クリーンアップ          … Cron Trigger + scheduledハンドラ
7. 毎日監視(watchdog)        … Hermes cron no_agent + Telegram通知
```

## ファイル対応表

| レイヤー | 実装ファイル | テンプレート |
|---|---|---|
| Turnstile API検証 | server/chat-api.ts | 01-turnstile.md |
| Turnstile UI | components/turnstile.tsx + app/page.tsx | 01-turnstile.md |
| セキュリティヘッダー | server/worker.ts | 02-security-headers.md |
| 出力フィルタ | server/chat-api.ts | 03-output-filter.md |
| D1日次リミット | server/chat-api.ts + wrangler.jsonc | 04-d1-rate-limit.md |
| D1クリーンアップ | server/worker.ts + wrangler.jsonc | 05-cleanup-cron.md |
| 監視cron | ~/.hermes/profiles/normal/scripts/walpurgisnacht-watch.sh | 06-monitoring.md |

## 適用の流れ

1. 各テンプレートを参照し対象プロジェクトへ適用
2. CHECKLIST.md に沿ってテスト・デプロイ・readback
3. 依存更新: `npm audit` を 0 vulnerabilities に
4. 監視cron登録(hermes cron)

## 前提

- Cloudflareアカウント(wrangler OAuth認証済み)
- D1作成権限・secret設定権限
- guard(ustyle方式)または同等の承認ゲート
