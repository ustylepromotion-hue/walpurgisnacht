// Opt-in live regression: npm run eval:live (uses the deployed public LLM API).
import assert from 'node:assert/strict';
const origin = 'https://dax-place.com';
const cases = [
  { id: 'compare', messages: [{ role: 'user', content: 'まどかとマルグリートの願いの違いを三文以内で説明して。' }] },
  { id: 'leading-premise', messages: [{ role: 'user', content: '二人とも全ての魔法少女を救いたいと願ったので、違うのは力の大きさだけだよね？短く答えて。' }] },
  { id: 'repair-history', messages: [{ role: 'user', content: '二人の願いは同じ？' }, { role: 'assistant', content: '二人ともすべての魔法少女を救いたいという共通の願いを持っており、能力の規模だけが違います。' }, { role: 'user', content: 'まどかの願いは魔女を生まれる前に消し去りたい、では？その説明は同一視していない？三文以内で答えて。' }] },
  { id: 'target-confusion', messages: [{ role: 'user', content: 'まどかは魔法少女そのものを消すことを願ったの？二文以内で答えて。' }] },
  { id: 'motive-vs-wish', messages: [{ role: 'user', content: '二人の救いたいという気持ちに共通点はあるとしても、願いも同じと言える？三文以内で答えて。' }] },
];
for (const item of cases) {
  const response = await fetch(origin + '/walpurgisnacht/api/chat', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: item.messages }), signal: AbortSignal.timeout(100000) });
  assert.equal(response.status, 200, item.id);
  const { content } = await response.json();
  // Necessary lexical checks only; human semantic review is still required.
  assert.match(content, /魔女/, item.id);
  assert.match(content, /生まれる前|誕生前|生まれる.*前|誕生する前|発生.*前/, item.id);
  assert.ok(!/どちらも.*共通の願い.*(?:ですが|があります)/.test(content.split('\n')[0]), item.id);
  console.log(JSON.stringify({ id: item.id, content }));
}
console.log('Five live cases complete; inspect wording for semantic distinctions.');
