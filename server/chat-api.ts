import { buildSystemContext } from './context';

export interface ChatEnv {
  walpurgisnacht_KEY?: string;
  LLM_PROVIDER?: string;
  CHAT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}
type ChatMessage = { role: 'user' | 'assistant'; content: string };
const json = (data: object, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function chatApi(
  request: Request,
  env: ChatEnv,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST')
    return json({ error: 'POSTで送信してください。' }, 405);
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if (
    origin !== url.origin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  )
    return json({ error: 'このサイトの画面から送信してください。' }, 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    return json({ error: '送信形式が正しくありません。' }, 415);
  if (!env.walpurgisnacht_KEY || env.LLM_PROVIDER !== 'deepseek')
    return json(
      {
        error: 'ただいま接続設定を確認しています。時間をおいてお試しください。',
      },
      503,
    );
  try {
    if (env.CHAT_RATE_LIMITER) {
      const result = await env.CHAT_RATE_LIMITER.limit({
        key: 'chat:' + (request.headers.get('cf-connecting-ip') ?? 'local'),
      });
      if (!result.success)
        return json(
          { error: '送信が続いています。1分ほど待ってからお試しください。' },
          429,
        );
    }
    const reader = request.body?.getReader();
    if (!reader) return json({ error: '質問を入力してください。' }, 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 80000) {
        await reader.cancel();
        return json(
          { error: '文章が長すぎます。短くしてお試しください。' },
          413,
        );
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: '送信内容を読み取れませんでした。' }, 400);
    }
    if (
      !data ||
      typeof data !== 'object' ||
      !('messages' in data) ||
      !Array.isArray(data.messages) ||
      !data.messages.length ||
      data.messages.length > 20
    )
      return json({ error: '会話の形式が正しくありません。' }, 400);
    const messages: ChatMessage[] = [];
    let chars = 0;
    for (const m of data.messages) {
      if (
        !m ||
        !['user', 'assistant'].includes(m.role) ||
        typeof m.content !== 'string' ||
        !m.content.trim() ||
        m.content.length > 6000
      )
        return json({ error: '質問は1〜6000文字で入力してください。' }, 400);
      chars += m.content.length;
      messages.push({ role: m.role, content: m.content });
    }
    if (chars > 18000 || messages.at(-1)?.role !== 'user')
      return json(
        {
          error:
            '会話が長すぎるか、送信形式が正しくありません。新しい考察でお試しください。',
        },
        400,
      );
    const endpoint = 'https://api.deepseek.com/chat/completions';
    const response = await upstream(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.walpurgisnacht_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          {
            role: 'system',
            content: buildSystemContext(),
          },
          ...messages,
        ],
        max_tokens: 2048,
        temperature: 0.2,
        stream: false,
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(90000)]),
    });
    if (!response.ok) {
      console.error('llm_request_failed', { status: response.status });
      return json(
        {
          error:
            response.status === 429
              ? '回答が混み合っています。少し待ってからお試しください。'
              : '回答サービスに接続できませんでした。時間をおいてお試しください。',
        },
        response.status === 429 ? 429 : 502,
      );
    }
    const result = (await response.json()) as {
      choices?: { message?: { content?: unknown }; finish_reason?: string }[];
    };
    const choice = result.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim())
      return json(
        { error: '回答を受け取れませんでした。もう一度お試しください。' },
        502,
      );
    return json({
      role: 'assistant',
      content: content.trim(),
      truncated: choice?.finish_reason === 'length',
    });
  } catch (error) {
    const timeout =
      error instanceof Error &&
      ['TimeoutError', 'AbortError'].includes(error.name);
    console.error('chat_failed', {
      type: timeout ? 'timeout' : 'request_failure',
    });
    return json(
      {
        error: timeout
          ? '回答に時間がかかっています。少し待ってからお試しください。'
          : '回答を取得できませんでした。時間をおいてお試しください。',
      },
      timeout ? 504 : 502,
    );
  }
}
