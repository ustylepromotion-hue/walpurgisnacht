# 02. セキュリティヘッダー(Worker)

Next/vinext は RSC ブートストラップでインライン script を生成するため、CSP に `'unsafe-inline'` が必須。
Turnstile 用に `https://challenges.cloudflare.com` を許可。

```ts
// server/worker.ts
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; " +
    "connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
```

- fetchハンドラの全分岐(API/redirect/404/UI配信)でラップする
- 検証: `curl -sI <url>` で6種のヘッダー実測
- APIのGETは405(非生成の安全応答)を維持

## 注意

- 既存ヘッダーは上書きしない(headers.has チェック)
- Permissions-Policy は不要機能(カメラ等)を全て無効化
