# ワルプルBOT

Cloudflare Worker `walpurgisnacht` / https://dax-place.com/walpurgisnacht

## 起動・デプロイ
Node.js 22.13以上。

```sh
npm ci
npm run build
npm run deploy
```

ローカル画面は `npm run dev`。本番用の配信確認は `npm start`。
ローカルでLLMを使う場合のみ `.dev.vars` に `walpurgisnacht_KEY` を設定する。本番シークレットはWorkerへ登録済みのものを使い、ファイルやクライアントには含めない。

## LLM
- DeepSeek公式 `https://api.deepseek.com/chat/completions`
- APIモデルID `deepseek-v4-flash`（公式で0731版に更新済み）
- `server/prompt.ts`：丁寧・簡潔。不要な話題提案や問い返しをしない。
- `server/knowledge.ts`：運営者提供の未検証考察メモ。サーバーだけに配置。
- `server/chat-api.ts`：入力検証、最大90秒、直近会話、IP単位12回/分の緩やかな連投制限。厳密な利用額上限ではない。
- 回答待ちは「考察中」の回転表示。全文受信後、描画フレームごとに一文字ずつ表示。処理遅延後も一括表示せず、古いモバイルブラウザの文字分割にも対応。動きを減らす設定では回転・カーソル点滅を抑制。会話は画面内のみ保持。投稿の永続蓄積・管理画面は未実装。

## テスト
`node tests/chat-api.test.mjs`、`node tests/typewriter.test.mjs`、`npx tsc --noEmit`、`npm run build`。
自作ファイルのlintは確認。雛形の共通UI部品には既存lint指摘あり。
2026-09-09: 本番公開完了。ページ・17件の配信アセット・登録済みキーによる実回答（HTTP 200）を確認済み。

## 解釈の精度管理
`server/editorial-context.ts` に運営者の訂正を、出典・願いの対象・作用・時点・能力・結果の別に記録。原資料を保存したまま、曖昧な要約より具体的な訂正を優先する。公式確認済み情報とは区別する。`server/context.ts` が原資料と編集補足の優先順位を組み立てる。
`npm run eval:live` は公開APIを5回呼ぶ有料推論の回帰確認。単語チェックに加えて回答の意味を目視確認する。

回答の口調は `server/prompt.ts` の `RESPONSE_VOICE` で調整。正確さの区別を保ちながら、穏やかな秘書のような距離感で説明する。
