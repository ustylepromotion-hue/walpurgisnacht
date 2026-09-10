'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render(
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        },
      ): string;
      reset(widgetId?: string): void;
      remove(widgetId: string): void;
    };
  }
}

/**
 * Cloudflare Turnstile ウィジェット。
 * トークンは使い捨てのため、消費後は親コンポーネントから key を変更して
 * 再マウントさせる（新しいチャレンジが発行される）。
 */
export default function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    const render = () => {
      if (!window.turnstile || !ref.current || cancelled) return;
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(''),
        'error-callback': () => onTokenRef.current(''),
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    let script = document.getElementById(
      'cf-turnstile-script',
    ) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* 既に除去済み */
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <div
      ref={ref}
      className="cf-turnstile"
      aria-label="人によるアクセス確認"
    />
  );
}
