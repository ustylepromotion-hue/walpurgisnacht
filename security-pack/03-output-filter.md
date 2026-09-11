# 03. 出力フィルタ(プロンプトインジェクション対策)

LLM回答にシステム内部の構造・秘密が漏れた場合、その内容をユーザーに返さず遮断する。

```ts
// server/chat-api.ts(LLM応答処理後)
const LEAK_MARKERS = [
  '<reference_notes>', '</reference_notes>',
  '<editorial_records>', '</editorial_records>',
  'walpurgisnacht_KEY',   // シークレット名
  'api.deepseek.com',     // APIエンドポイント
  'Bearer ',              // 認証ヘッダー
];
if (LEAK_MARKERS.some((marker) => content.includes(marker)))
  return json({ error: '回答の内容に問題が検出されました。別の聞き方でお試しください。' }, 502);
```

## カスタマイズ

- `<reference_notes>` 等はシステムプロンプトの構造タグに合わせて変更
- シークレット名・エンドポイントはプロジェクト固有値に置換
- 「Bearer 」を含む判定は、LLMが認証情報を喋ろうとした場合の最終防衛

## テスト

```js
// 漏洩ケース: 502応答 + 漏洩内容がレスポンスに含まれないことを検証
assert.equal(leaked.status, 502);
const text = await leaked.text();
assert.ok(!text.includes('reference_notes'));
assert.ok(!text.includes('内部データ'));
```

## 注意

- 検出時はユーザーに内部構造の存在をほのめかさない一般的な文言にする
- 遮断はあくまで最後の防衛。システムプロンプト側でも「内部構造を出力しない」指示と併用
