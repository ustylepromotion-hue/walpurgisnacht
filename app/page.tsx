'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  ArrowUpRight,
  BookOpen,
  Check,
  Copy,
  Feather,
  Heart,
  MessageCircle,
  Plus,
  Sparkles,
  Users,
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
import { reply, type Message } from '@/lib/chat';

type Conversation = { id: string; title: string; messages: Message[] };
const prompts = [
  {
    icon: Users,
    label: 'キャラクター',
    title: 'ほむらの想いを、もう少し深く。',
    question: 'ほむらの行動を、まどかへの想いから考察したい',
  },
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
  const { setOpenMobile } = useSidebar();
  const input = useRef<HTMLTextAreaElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const chat = conversations.find((c) => c.id === active);
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
    try {
      const response = await reply(messages, current.signal);
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
  return (
    <>
      <Sidebar className="navigation">
        <SidebarHeader className="brand-area">
          <Link className="brand" href="/" aria-label="ワルプルBOT ホーム">
            <span className="brand-mark">
              <Sparkles size={21} />
            </span>
            <span>
              ワルプル<span className="brand-light">BOT</span>
              <small>WALPURGIS / THOUGHT PARTNER</small>
            </span>
          </Link>
          <button className="new-chat" onClick={fresh}>
            <Plus size={18} />
            新しい考察をはじめる
          </button>
        </SidebarHeader>
        <SidebarContent className="nav-content">
          <div className="nav-label">考察の入り口</div>
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
          <div className="note">
            <Feather size={18} />
            <p>
              ひとつの物語に、
              <br />
              ひとつじゃない読み方を。
            </p>
          </div>
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
            考察BOT
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
                気になった場面も、言葉にならない想いも。
                <br />
                あなたの視点で自由にお話しください。
              </p>
              <div className="prompt-grid">
                {prompts.map(({ icon: Icon, label, title, question }) => (
                  <button
                    className="prompt-card"
                    key={label}
                    onClick={() => choose(question)}
                  >
                    <span className="prompt-label">
                      <Icon size={18} />
                      {label}
                    </span>
                    <span className="prompt-title">{title}</span>
                    <ArrowUpRight size={17} className="card-arrow" />
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
                    disabled={!draft.trim() || pending}
                    aria-label="送信"
                  >
                    <ArrowUp size={21} />
                  </button>
                </div>
              </div>
            </form>
            <p className="demo-note">
              現在はAIによる回答です。会話はこの画面を開いている間のみ保持されます。
            </p>
          </div>
          <aside className="sponsor-slot" aria-label="スポンサー掲載予定枠">
            <span className="sponsor-caption">SUPPORT THIS SPACE</span>
            <span>
              <Heart size={14} />
              考察が生まれる場所を、一緒に。
            </span>
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
