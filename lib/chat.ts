export type ChatMode = 'normal' | 'kusogaki' | 'akuma';
export type Message = { role: 'user' | 'assistant'; content: string };
export async function reply(
  messages: Message[],
  mode: ChatMode = 'normal',
  signal?: AbortSignal,
  turnstileToken = '',
): Promise<Message> {
  // Send a bounded recent context, retaining the current question in full.
  const recent: Message[] = [];
  let chars = 0;
  for (const m of messages.slice(-19).reverse()) {
    if (chars + m.content.length > 18000) break;
    recent.unshift(m);
    chars += m.content.length;
  }
  const response = await fetch('/walpurgisnacht/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: recent, mode, turnstileToken }),
    signal,
  });
  let data: { error?: string; content?: string; truncated?: boolean };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      'サーバーに接続できませんでした。時間をおいてお試しください。',
    );
  }
  if (!response.ok)
    throw new Error(data.error ?? '回答を取得できませんでした。');
  if (!data.content)
    throw new Error('回答が空でした。もう一度お試しください。');
  return {
    role: 'assistant',
    content:
      data.content +
      (data.truncated ? '\n\n（回答が長さの上限に達しました。）' : ''),
  };
}
