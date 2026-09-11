# セキュリティパック適用チェックリスト

## 実装前

- [ ] Cloudflare OAuth認証確認(`guard -- npx wrangler whoami`)
- [ ] 対象ドメイン・パスの確認(既存ルートのみ・新規ドメイン追加は禁止)
- [ ] 課金承認(Turnstile/Live検証が有料の場合)

## 実装

- [ ] Turnstile widget作成(GET一覧→POST) → sitekey/secret控え
- [ ] wrangler.jsonc: TURNSTILE_SITEKEY vars / D1 binding / triggers.crons
- [ ] secret put(TURNSTILE_SECRET 等、printenvパイプで非表示)
- [ ] chat-api.ts: Turnstile検証(400/403/503分岐) + D1リミット2段 + 出力フィルタ
- [ ] worker.ts: withSecurityHeaders全分岐ラップ + scheduledハンドラ
- [ ] UI: turnstile.tsx(500msポーリング・disabled・12秒タイムアウト・確認後消滅)
- [ ] 監視スクリプト + cron登録

## テスト(全てexit 0)

- [ ] `npm test`(Turnstile分岐・リミット分岐・出力フィルタ遮断・モード別パラメータ)
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] 生成バンドルに新文言/sitekey反映(grep)
- [ ] `npm audit` → 0 vulnerabilities

## デプロイ・readback

- [ ] `guard -- npx wrangler deploy --config ... --dry-run`(AUTO-APPROVED)
- [ ] 本番デプロイ → Current Version ID 記録
- [ ] `deployments list` で新Version 100%確認
- [ ] ページ200(`curl -sL`・308追跡)
- [ ] API GET 405 / トークンなしPOST 400 / 外部Origin 403
- [ ] ヘッダー6種実測(`curl -sI`)
- [ ] D1カウンタ実動作(実送信でcount増加)
- [ ] cron schedule登録確認(`GET .../schedules`)

## 運用

- [ ] Git commit + push(guard、未commitがあるとBLOCK)
- [ ] 監視cron初回動作確認(翌日9時)
- [ ] プロバイダ側の支出アラート設定(ユーザー作業)
