# 06. 毎日監視(watchdog + Telegram)

異常時のみTelegram通知するwatchdogパターン(Hermes cron no_agent)。

## 1. 監視スクリプト

`~/.hermes/profiles/normal/scripts/<app>-watch.sh`

```bash
#!/bin/bash
# 正常時は空出力(送信なし)。異常時のみ文言をecho。
BASE="https://<ドメイン>/<パス>"
FAILURES=""

# ページ200
code=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 20 "$BASE" 2>/dev/null)
[ "$code" != "200" ] && FAILURES="${FAILURES}ページ: HTTP ${code} (想定200)\n"

# API GETは405(非生成の安全応答)
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$BASE/api/chat" 2>/dev/null)
[ "$code" != "405" ] && FAILURES="${FAILURES}API: GET ${code} (想定405)\n"

# Turnstile sitekey埋込
curl -s --max-time 20 "$BASE/" 2>/dev/null | grep -q "data-turnstile-sitekey" \
  || FAILURES="${FAILURES}Turnstile: sitekey埋め込みなし\n"

# 認証ゲート(トークンなしPOST→400)
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 -X POST "$BASE/api/chat" \
  -H "Content-Type: application/json" -H "Origin: https://<ドメイン>" \
  -d '{"messages":[{"role":"user","content":"x"}]}' 2>/dev/null)
[ "$code" != "400" ] && FAILURES="${FAILURES}API認証ゲート: トークンなしPOST ${code} (想定400)\n"

if [ -n "$FAILURES" ]; then
  echo "<アプリ名>監視: 異常検出"; echo ""; echo -e "$FAILURES"
  echo "対処: ページ/API/デプロイ状態を確認してください。"
fi
```

## 2. cron登録

```bash
hermes send --to telegram "監視cron設定のテスト送信"  # 事前に経路確認
```

cronjob_manage:
- schedule: `0 9 * * *`(毎日9時JST)
- script: `<app>-watch.sh`
- no_agent: true(スクリプト実行・stdoutをそのまま配信)
- deliver: telegram
- 空出力=無音(watchdog)、非ゼロexitは自動エラー通知

## 3. 注意

- スクリプトは決定的出力(タイムスタンプ禁止)
- 正常時は何も出力しないこと
