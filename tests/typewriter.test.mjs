import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(readFileSync('lib/typewriter.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(exports);
let next = 1; const frames = new Map();
globalThis.requestAnimationFrame = cb => { const id=next++; frames.set(id,cb); return id; };
globalThis.cancelAnimationFrame = id => frames.delete(id);
function step(time) { const tasks=[...frames.values()]; frames.clear(); for(const cb of tasks) cb(time); }
const full='考察ですね。👩‍👩‍👧‍👦か\u3099🇯🇵👍🏽';
for (const interval of [16.7, 33.4]) {
 const values=[];const promise=exports.revealText(full,value=>values.push(value),new AbortController().signal);
 for(let i=0;i<50;i++)step(i*interval);
 await promise;
 const characters=exports.splitCharacters(full);
 assert.deepEqual(values,characters.map((_,i)=>characters.slice(0,i+1).join('')));
 assert.equal(frames.size,0);
}
const normal=exports.splitCharacters(full);const segmenter=Intl.Segmenter;
try { Intl.Segmenter=undefined;assert.deepEqual(exports.splitCharacters(full),normal); } finally { Intl.Segmenter=segmenter; }
const cancel=new AbortController();const updates=[];
const stopped=exports.revealText('長い回答'.repeat(50),text=>updates.push(text),cancel.signal);
step(0);step(60000);assert.deepEqual(updates,['長','長い']);cancel.abort();step(61000);await stopped;assert.equal(updates.length,2);assert.equal(frames.size,0);
const pre=new AbortController();pre.abort();await exports.revealText(full,()=>assert.fail('Aborted update'),pre.signal);
console.log('Typewriter: 60/30fps one-character frames, old-mobile Unicode fallback, background pause and cancellation passed.');
