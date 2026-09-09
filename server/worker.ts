import { chatApi, type ChatEnv } from './chat-api';
import handler from 'vinext/server/fetch-handler';

export default {
  async fetch(
    request: Request,
    env: ChatEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/walpurgisnacht/api/chat')
      return chatApi(request, env);
    if (url.pathname === '/walpurgisnacht') {
      url.pathname = '/walpurgisnacht/';
      return Response.redirect(url.toString(), 308);
    }
    if (!url.pathname.startsWith('/walpurgisnacht/')) {
      return new Response('Not found', { status: 404 });
    }
    return handler.fetch(request, env, ctx);
  },
};
