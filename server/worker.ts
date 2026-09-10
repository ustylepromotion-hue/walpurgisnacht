import { chatApi, type ChatEnv } from './chat-api';
import handler from 'vinext/server/fetch-handler';

const SECURITY_HEADERS: Record<string, string> = {
  // vinext/Next の RSC ブートストラップがインライン script を生成するため
  // 'unsafe-inline' が必要。Turnstile のウィジェット用に challenges.cloudflare.com を許可。
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000',
  'Permissions-Policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(
    request: Request,
    env: ChatEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/walpurgisnacht/api/chat')
      return withSecurityHeaders(await chatApi(request, env));
    if (url.pathname === '/walpurgisnacht') {
      url.pathname = '/walpurgisnacht/';
      return withSecurityHeaders(Response.redirect(url.toString(), 308));
    }
    if (!url.pathname.startsWith('/walpurgisnacht/')) {
      return withSecurityHeaders(new Response('Not found', { status: 404 }));
    }
    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
  // 毎日(JST 3:00 = UTC 18:00)に古い利用記録を削除してD1の肥大化を防ぐ。
  // chat_usage(日×IP)は14日分、usage_daily(日)は31日分を保持する。
  async scheduled(
    _controller: ScheduledController,
    env: ChatEnv,
    _ctx: ExecutionContext,
  ): Promise<void> {
    if (!env.walpurgisnacht_usage) return;
    const deleted = await env.walpurgisnacht_usage
      .prepare(
        `DELETE FROM chat_usage
         WHERE day < date('now', '-14 days')`,
      )
      .bind();
    await deleted.run?.();
    const deletedDaily = await env.walpurgisnacht_usage
      .prepare(
        `DELETE FROM usage_daily
         WHERE day < date('now', '-31 days')`,
      )
      .bind();
    await deletedDaily.run?.();
  },
};
