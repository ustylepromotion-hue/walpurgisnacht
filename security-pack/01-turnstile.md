# 01. Turnstile 人間認証

## 1. widget作成(Cloudflare API)

```bash
# OAuthトークンは ~/.wrangler/config/default.toml の oauth_token
# GETで一覧確認 → POSTで作成
curl -s -X POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/challenges/widgets \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"<widget名>","domains":["<対象ドメイン>"],"mode":"managed","bot_fight_mode":false}'
```

- mode='managed' は非表示チャレンジ。低リスク環境(シークレットブラウザ含む)はチェック不要で自動通過=仕様。
- bot_fight_mode=true は Enterprise プラン限定。標準プランでは `not entitled` エラー。
- 応答の sitekey(公開可) / secret(秘匿) を控える。

## 2. 設定

```jsonc
// wrangler.jsonc
"vars": { "TURNSTILE_SITEKEY": "<sitekey>" }
```

```bash
# secretはログ非表示で設定
umask 077 && printf '%s' '<secret>' > /tmp/ts.txt
cat /tmp/ts.txt | guard -- npx wrangler secret put TURNSTILE_SECRET --config wrangler.jsonc
rm -f /tmp/ts.txt
```

## 3. サーバー検証(chat-api.ts)

```ts
const verifyBody = new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token });
const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: verifyBody.toString(),
});
const { success } = await res.json();
```

| 状態 | 応答 |
|---|---|
| TURNSTILE_SECRET未設定 | 503 |
| トークン欠落 | 400 |
| 検証失敗 | 403 |
| 成功 | 通常処理へ |

## 4. UI(React)

- トークンはフォーム内hidden input: `.cf-turnstile input[name="cf-turnstile-response"]`
- **React callbackより500msポーリングが確実**(ヘッドレスでcallback非発火あり)
- トークン発行まで送信ボタンdisabled / 12秒でロード失敗→再試行ボタン
- 確認済み後はウィジェット行ごと消滅(枠外・notice付き初期表示)
- トークンは使い捨て: 消費後 key 変更で再マウント

## 5. CSP注意

CSP script-src に `https://challenges.cloudflare.com` が必要(script-src / connect-src / frame-src)。

## 落とし穴

- ヘッドレスブラウザはトークン発行が不安定。サーバー到達確認はD1カウント増加で行う。
- ウィジェットiframeがCSS非表示でもhidden inputにはトークンが書かれる(発行は成功)。
