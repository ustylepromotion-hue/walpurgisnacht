import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ワルプルBOT | その余韻を、考察へ。',
  description:
    'ワルプルギスの廻天の物語を、あなたの視点からひもとく非公式考察チャット。',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
