import { buildSystemContext } from './context';
import type { ChatMode } from './prompt';

export interface ChatEnv {
  walpurgisnacht_KEY?: string;
  LLM_PROVIDER?: string;
  TURNSTILE_SECRET?: string;
  CHAT_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
  walpurgisnacht_usage?: {
    prepare(sql: string): {
      bind(...args: unknown[]): {
        first<T = Record<string, unknown>>(): Promise<T | null>;
        run?(): Promise<{ success: boolean }>;
      };
    };
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
    const requestedMode = 'mode' in data ? data.mode : 'normal';
    if (
      requestedMode !== 'normal' &&
      requestedMode !== 'kusogaki' &&
      requestedMode !== 'akuma'
    )
      return json({ error: 'モード指定が正しくありません。' }, 400);
    const mode: ChatMode = requestedMode;
    // Turnstile: 人間によるアクセスであることを検証する。
    // トークンは使い捨てのため、送信のたびにウィジェットから取得する。
    if (!env.TURNSTILE_SECRET)
      return json(
        {
          error: '認証設定を確認しています。時間をおいてお試しください。',
        },
        503,
      );
    const turnstileToken = 'turnstileToken' in data ? data.turnstileToken : '';
    if (typeof turnstileToken !== 'string' || !turnstileToken)
      return json(
        { error: '人によるアクセス確認を完了してから送信してください。' },
        400,
      );
    const verifyBody = new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: turnstileToken,
    });
    const verifyResponse = await upstream(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verifyBody.toString(),
      },
    );
    const verifyResult = (await verifyResponse.json()) as {
      success?: boolean;
    };
    if (!verifyResult.success)
      return json(
        {
          error:
            '人によるアクセス確認をやり直してください。',
        },
        403,
      );
    // 日次リミット: 同一IPから1日100回(JST基準)。D1のアトミックなカウンタで管理する。
    // DB障害時はサービスを止めないよう制限をスキップする(フェイルオープン)。
    if (env.walpurgisnacht_usage) {
      try {
        const now = new Date();
        const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
        const row = await env.walpurgisnacht_usage
          .prepare(
            `INSERT INTO chat_usage (day, ip, count) VALUES (?, ?, 1)
             ON CONFLICT(day, ip) DO UPDATE SET count = count + 1
             RETURNING count`,
          )
          .bind(jstDate, ip)
          .first<{ count: number }>();
        if (row && row.count > 100)
          return json(
            {
              error: '本日の利用回数に達しました。また明日お試しください。',
            },
            429,
          );
      } catch (error) {
        console.error('daily_limit_failed', {
          type: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
    // グローバル日次上限: 全IP合計で1日500回(JST基準)。IP分散攻撃でも
    // コストの絶対上限を担保する。IP単位の100回より先に達するケースが多い。
    if (env.walpurgisnacht_usage) {
      try {
        const now = new Date();
        const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        const row = await env.walpurgisnacht_usage
          .prepare(
            `INSERT INTO usage_daily (day, count) VALUES (?, 1)
             ON CONFLICT(day) DO UPDATE SET count = count + 1
             RETURNING count`,
          )
          .bind(jstDate)
          .first<{ count: number }>();
        if (row && row.count > 500)
          return json(
            {
              error:
                '本日の回答数に達しました。また明日お試しください。',
            },
            429,
          );
      } catch (error) {
        console.error('global_limit_failed', {
          type: error instanceof Error ? error.name : 'unknown',
        });
      }
    }
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
    const llmParams =
      mode === 'kusogaki'
        ? {
            temperature: 0.75,
            top_p: 0.85,
            presence_penalty: 0.4,
            frequency_penalty: 0.3,
          }
        : mode === 'akuma'
          ? {
              temperature: 0.5,
              top_p: 0.9,
              presence_penalty: 0.4,
              frequency_penalty: 0.25,
            }
          : { temperature: 0.2 };
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
            content: buildSystemContext(mode),
          },
          ...messages,
        ],
        max_tokens: 2048,
        ...llmParams,
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
    // プロンプトインジェクション対策: システム内部の構造・秘密が回答に漏れた場合は返さない。
    // システムプロンプトの参照タグ・編集記録タグ・シークレット名・APIエンドポイントが
    // 回答に含まれた場合、ユーザーに入力内容の誘導を検知した旨を伝えて処理を打ち切る。
    const LEAK_MARKERS = [
      '<reference_notes>',
      '</reference_notes>',
      '<editorial_records>',
      '</editorial_records>',
      'walpurgisnacht_KEY',
      'api.deepseek.com',
      'Bearer ',
    ];
    if (LEAK_MARKERS.some((marker) => content.includes(marker)))
      return json(
        {
          error:
            '回答の内容に問題が検出されました。別の聞き方でお試しください。',
        },
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
