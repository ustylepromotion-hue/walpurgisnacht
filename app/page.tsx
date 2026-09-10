'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Ghost,
  Heart,
  MessageCircle,
  Plus,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { revealText } from '@/lib/typewriter';
import { reply, type ChatMode, type Message } from '@/lib/chat';
import Turnstile from '@/components/turnstile';

type Conversation = { id: string; title: string; messages: Message[] };
const modes: { id: ChatMode; label: string; short: string; icon: typeof Sparkles }[] = [
  { id: 'normal', label: 'ノーマルモード', short: 'ノーマル', icon: Sparkles },
  { id: 'kusogaki', label: 'クソガキモード', short: 'クソガキ', icon: WandSparkles },
  { id: 'akuma', label: '悪魔モード', short: '悪魔', icon: Ghost },
];
const modeCards: {
  icon: typeof Sparkles;
  label: string;
  title: string;
  mode: ChatMode;
  note?: string;
}[] = [
  { icon: BookOpen, label: '世界観・設定', title: 'ノーマルモード', mode: 'normal' },
  { icon: WandSparkles, label: '演出・モチーフ', title: 'クソガキモード', mode: 'kusogaki' },
  {
    icon: MessageCircle,
    label: '感想から考察',
    title: '悪魔モード',
    mode: 'akuma',
    note: '編集予定',
  },
];
const prompts = [
  {
    icon: BookOpen,
    label: '世界観・設定',
    title: '円環の理と、魔女のつながり。',
    question: '円環の理と魔女の関係を整理したい',
  },
  {
    icon: WandSparkles,
    label: '演出・モチーフ',
    title: 'あの演出には、どんな意味が？',
    question: '印象に残った演出やモチーフを一緒に読み解きたい',
  },
  {
    icon: MessageCircle,
    label: '感想から考察',
    title: 'うまく言えない感想も、ここから。',
    question: '作品を観て感じたことから、考察を広げたい',
  },
];
export default function Home() {
  return (
    <SidebarProvider>
      <Workspace />
    </SidebarProvider>
  );
}
function Workspace() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<ChatMode>('normal');
  const [pending, setPending] = useState(false);
  const [requestChat, setRequestChat] = useState<string | null>(null);
  const [typing, setTyping] = useState<{
    id: string;
    index: number;
    text: string;
  } | null>(null);
  const nearBottom = useRef(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);
  const [turnstileEpoch, setTurnstileEpoch] = useState(0);
  const [siteKey, setSiteKey] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileLoading, setTurnstileLoading] = useState(true);
  const { setOpenMobile } = useSidebar();
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const chat = conversations.find((c) => c.id === active);
  const currentMode =
    modes.find((m) => m.id === mode) ?? modes[0];
  useEffect(() => {
    const area = scrollArea.current;
    if (area) area.scrollTop = area.scrollHeight;
  }, [chat?.messages.length, active]);
  useEffect(() => {
    const area = scrollArea.current;
    if (area && nearBottom.current && typing?.id === active)
      area.scrollTop = area.scrollHeight;
  }, [typing, active]);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setSiteKey(
      (document.body as HTMLElement & { dataset: DOMStringMap })
        .dataset.turnstileSitekey ?? '',
    );
  }, []);
  // Turnstile: フォーム内のhidden inputからトークンをポーリングで監視する。
  // チャレンジ完了(非表示でも数秒かかる)前に送信するとエラーになるため、
  // トークンが揃うまで送信ボタンを無効化し、ロード失敗も検出する。
  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let failTimer: number | undefined;
    const poll = () => {
      if (stopped) return;
      const input = document.querySelector(
        '.cf-turnstile input[name="cf-turnstile-response"]',
      ) as HTMLInputElement | null;
      const token = input?.value ?? '';
      setTurnstileToken(token);
      if (token) {
        setTurnstileLoading(false);
        return;
      }
      timer = window.setTimeout(poll, 500);
    };
    poll();
    // 12秒経過してもトークンが無い場合はロード失敗とみなす
    failTimer = window.setTimeout(() => {
      if (!stopped) setTurnstileLoading(false);
    }, 12000);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (failTimer !== undefined) window.clearTimeout(failTimer);
    };
  }, [turnstileEpoch]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: object;
              execute: (input: unknown) => Promise<object>;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'stage_discussion_question',
            description: '考察の入力欄に質問を下書きする。送信はしない。',
            inputSchema: {
              type: 'object',
              properties: {
                question: { type: 'string', minLength: 1, maxLength: 6000 },
              },
              required: ['question'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: true },
            async execute(value: unknown) {
              if (
                !value ||
                typeof value !== 'object' ||
                !('question' in value) ||
                typeof value.question !== 'string' ||
                !value.question.trim() ||
                value.question.length > 6000
              )
                throw new Error('質問は1〜6000文字で指定してください');
              setDraft(value.question);
              input.current?.focus();
              await new Promise<void>((resolve) =>
                requestAnimationFrame(() => resolve()),
              );
              return { status: 'drafted', sent: false };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifecycle.abort();
  }, []);
  function fresh() {
    controller.current?.abort();
    setPending(false);
    setTyping(null);
    setRequestChat(null);
    setActive(null);
    setDraft('');
    setError('');
    setOpenMobile(false);
    input.current?.focus();
  }
  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    // Turnstile はフォーム内の hidden input にトークンを書き込む。
    // state のトークンはポーリングで常に最新化されている。
    if (!turnstileToken) {
      setError('アクセス確認が完了するまで、もう少しお待ちください。');
      return;
    }
    if (window.matchMedia('(pointer: coarse)').matches) input.current?.blur();
    const id = active ?? crypto.randomUUID();
    const messages: Message[] = [
      ...(chat?.messages ?? []),
      { role: 'user', content: text },
    ];
    setConversations((list) =>
      active
        ? list.map((c) => (c.id === id ? { ...c, messages } : c))
        : [{ id, title: text, messages }, ...list],
    );
    setActive(id);
    setRequestChat(id);
    nearBottom.current = true;
    setCopied(null);
    setDraft('');
    setError('');
    setPending(true);
    const current = new AbortController();
    controller.current = current;
    const selectedMode = mode;
    const usedToken = turnstileToken;
    try {
      const response = await reply(
        messages,
        selectedMode,
        current.signal,
        usedToken,
      );
      // トークンは使い捨て。次の送信に備えてウィジェットを再マウントする。
      setTurnstileToken('');
      setTurnstileLoading(true);
      setTurnstileEpoch((e) => e + 1);
      if (!current.signal.aborted) {
        setTyping({ id, index: messages.length, text: '' });
        setConversations((list) =>
          list.map((c) =>
            c.id === id ? { ...c, messages: [...c.messages, response] } : c,
          ),
        );
        await revealText(
          response.content,
          (text) => setTyping({ id, index: messages.length, text }),
          current.signal,
        );
        if (!current.signal.aborted) setTyping(null);
      }
    } catch (error) {
      if (!current.signal.aborted)
        setError(
          error instanceof Error
            ? error.message
            : '回答を受け取れませんでした。もう一度お試しください。',
        );
    } finally {
      if (!current.signal.aborted) setPending(false);
    }
  }
  function choose(question: string) {
    setDraft(question);
    input.current?.focus();
  }
  function chooseMode(nextMode: ChatMode) {
    setMode(nextMode);
    setError('');
    setOpenMobile(false);
  }
  return (
    <>
      <Sidebar className="navigation">
        <SidebarHeader className="brand-area">
          <Link className="brand" href="/" aria-label="ワルプルBOT ホーム">
            <span>
              ワルプル<span className="brand-light">BOT</span>
            </span>
          </Link>
          <button className="new-chat" onClick={fresh}>
            <Plus size={18} />
            新しい考察をはじめる
          </button>
        </SidebarHeader>
        <SidebarContent className="nav-content">
          <div className="nav-label">モード選択</div>
          {modes.map(({ id, icon: Icon, label }) => (
            <button
              className={`nav-item mode-item ${mode === id ? 'selected' : ''}`}
              key={id}
              aria-pressed={mode === id}
              onClick={() => chooseMode(id)}
            >
              <Icon size={18} />
              {label}
              {mode === id ? <Check size={15} /> : <span />}
            </button>
          ))}
          <div className="nav-label theme-label">考察テーマ</div>
          {prompts.map(({ icon: Icon, label, question }) => (
            <button
              className="nav-item"
              key={label}
              onClick={() => {
                choose(question);
                setOpenMobile(false);
              }}
            >
              <Icon size={18} />
              {label}
              <ArrowUpRight size={14} />
            </button>
          ))}
          <div className="nav-label history-label">このセッションの考察</div>
          {conversations.length ? (
            conversations.map((c) => (
              <button
                key={c.id}
                className={`history-item ${c.id === active ? 'selected' : ''}`}
                onClick={() => {
                  setActive(c.id);
                  setOpenMobile(false);
                  setDraft('');
                  setError('');
                }}
              >
                <MessageCircle size={16} />
                <span>{c.title}</span>
              </button>
            ))
          ) : (
            <p className="history-empty">
              話しはじめると、ここに
              <br />
              考察が並びます。
            </p>
          )}
        </SidebarContent>
        <SidebarFooter className="nav-footer">
          <div className="fan-note">
            非公式ファンプロジェクト <span>β</span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <SidebarTrigger
              aria-label="メニューを開閉"
              className="menu-trigger"
            />
            <span>考察ルーム</span>
            <span className="slash">/</span>
            <span className="work-title">ワルプルギスの廻天</span>
          </div>
          <span className="demo-badge">
            <span />
            考察BOT・{currentMode.short}
          </span>
        </header>
        <div
          ref={scrollArea}
          className={`conversation-scroll ${chat ? 'has-chat' : ''}`}
          onScroll={(e) => {
            const el = e.currentTarget;
            nearBottom.current =
              el.scrollHeight - el.scrollTop - el.clientHeight < 100;
          }}
        >
          {!chat ? (
            <section className="welcome">
              <h1>
                ワルプルギスの廻天考察Bot
              </h1>
              <p className="intro">
                気になった場面、言葉にならない想い
                <br />
                あなたの視点で自由にお話しください。
              </p>
              <div className="prompt-grid">
                {modeCards.map(({ icon: Icon, label, title, mode: cardMode, note }) => (
                  <button
                    className={`prompt-card ${mode === cardMode ? 'selected' : ''}`}
                    key={label}
                    aria-pressed={mode === cardMode}
                    onClick={() => chooseMode(cardMode)}
                  >
                    <span className="prompt-label">
                      <Icon size={18} />
                      {label}
                    </span>
                    <span className="prompt-title">
                      {title}
                      {note ? <em className="pending-note">（{note}）</em> : null}
                    </span>
                    {mode === cardMode ? (
                      <Check size={17} className="card-arrow" />
                    ) : (
                      <ArrowUpRight size={17} className="card-arrow" />
                    )}
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <section
              className="messages"
              aria-label="会話"
              aria-live="polite"
              aria-busy={pending && requestChat === active}
            >
              {chat.messages.map((m, i) => (
                <article className={`message ${m.role}`} key={i}>
                  {m.role === 'assistant' && (
                    <div className="assistant-name">
                      <span className="mini-mark">
                        <Sparkles size={16} />
                      </span>
                      ワルプルBOT <span>AIによる回答</span>
                    </div>
                  )}
                  <div
                    className={`message-content ${typing?.id === active && typing.index === i ? 'is-typing' : ''}`}
                  >
                    {typing?.id === active && typing.index === i
                      ? typing.text
                      : m.content}
                  </div>
                  {m.role === 'assistant' &&
                    !(typing?.id === active && typing.index === i) && (
                      <button
                        className="copy-button"
                        aria-label="回答をコピー"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(m.content);
                            setCopied(i);
                          } catch {
                            setError(
                              'コピーできませんでした。文章を選択してコピーしてください。',
                            );
                          }
                        }}
                      >
                        {copied === i ? (
                          <Check size={15} />
                        ) : (
                          <Copy size={15} />
                        )}{' '}
                        {copied === i ? 'コピーしました' : 'コピー'}
                      </button>
                    )}
                </article>
              ))}
              {pending && requestChat === active && !typing && (
                <output className="pending" aria-live="polite">
                  <span className="thinking-spinner" aria-hidden="true" />
                  <span>考察中</span>
                </output>
              )}
              <div ref={bottom} />
            </section>
          )}
        </div>
        <div className="bottom-area">
          <div className="composer-wrap">
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <form
              className="composer"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <label className="sr-only" htmlFor="question">
                考察したいこと
              </label>
              <textarea
                ref={input}
                id="question"
                rows={2}
                maxLength={6000}
                value={draft}
                placeholder="あなたが気になったことを、聞かせてください…"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    window.matchMedia('(min-width: 768px)').matches
                  ) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <div className="composer-bottom">
                <span>
                  <Sparkles size={14} />
                  一緒に考察する
                </span>
                <div>
                  <span className="key-hint">Shift + Enter で改行</span>
                  <button
                    className="send-button"
                    type="submit"
                    disabled={!draft.trim() || pending || !turnstileToken}
                    aria-label="送信"
                  >
                    <ArrowUp size={21} />
                  </button>
                </div>
              </div>
            </form>
            {/* テキストボックス枠外: アクセス確認は確認完了までだけ表示し、済んだら消える */}
            {siteKey && !turnstileToken && (
              <div className="turnstile-row">
                <span className="turnstile-notice">
                  送信前に、こちらをチェックしてね
                </span>
                <Turnstile key={turnstileEpoch} siteKey={siteKey} />
                {!turnstileLoading && (
                  <button
                    type="button"
                    className="turnstile-status turnstile-retry"
                    onClick={() => {
                      setTurnstileToken('');
                      setTurnstileLoading(true);
                      setTurnstileEpoch((e) => e + 1);
                    }}
                  >
                    読み込めない場合はタップで再試行
                  </button>
                )}
              </div>
            )}
            <p className="demo-note">
              現在はAIによる回答です。会話はこの画面を開いている間のみ保持されます。
            </p>
            <details className="legal-block">
              <summary>プライバシーポリシー / 免責事項</summary>
              <div className="legal-text">
                <h4>プライバシーポリシー</h4>
                <p>
                  入力したメッセージは回答の生成のため、第三者AIサービス(DeepSeek)に送信されます。会話内容はこの画面を開いている間のみ保持され、サーバーには保存されません。個人情報や機密情報を入力しないでください。アクセス状況は通信事業者(Cloudflare)のログにより処理されることがあります。
                </p>
                <h4>免責事項</h4>
                <p>
                  本サービスは非公式のファンプロジェクトです。AIによる回答は参考用であり、正確性・完全性を保証するものではありません。回答の内容を鵜呑みにせず、公式の資料とあわせてご確認ください。
                </p>
                <h4>権利表記</h4>
                <p>
                  『魔法少女まどか☆マギカ』関連作品の著作権は各権利者に帰属します。本サービスは権利者とは関係のないファンによる非公式のものです。
                </p>
              </div>
            </details>
          </div>
          <aside className="sponsor-slot" aria-label="スポンサー掲載予定枠">
            <a
              className="sponsor-caption"
              href="https://labs-88.com/advisor/1kh/"
            >
              PR:完全無料のAI秘書を試す
            </a>
            <span className="sponsor-soon">
              スポンサー募集 <span>準備中</span>
            </span>
          </aside>
          <footer className="page-footer">
            WALPURGIS BOT <span>非公式・ファンによる考察スペース</span>
          </footer>
        </div>
      </main>
    </>
  );
}
