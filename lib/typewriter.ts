/** Split visible characters, including emoji; support older mobile browsers. */
export function splitCharacters(text: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text),
      (part) => part.segment,
    );
  }
  const result: string[] = [];
  let regionalCount = 0;
  for (const point of Array.from(text)) {
    const regional = /\p{Regional_Indicator}/u.test(point);
    const last = result.at(-1);
    if (
      last &&
      (/\p{Mark}|[\uFE0E\uFE0F\u200D]|\p{Emoji_Modifier}/u.test(point) ||
        last.endsWith('\u200D') ||
        (regional && regionalCount % 2 === 1) ||
        (point === '\n' && last === '\r'))
    )
      result[result.length - 1] += point;
    else result.push(point);
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return result;
}

/** One visible character per rendered frame; never catch up in a large batch. */
export function revealText(
  text: string,
  update: (text: string) => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const segments = splitCharacters(text);
    let frame = 0;
    let index = 0;
    let visible = '';
    let previous: number | undefined;
    const finish = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    signal.addEventListener('abort', finish, { once: true });
    const tick = (now: number) => {
      if (signal.aborted) return finish();
      if (previous === undefined || now - previous >= 16) {
        previous = now;
        if (index < segments.length) {
          visible += segments[index++];
          update(visible);
        }
      }
      if (index === segments.length) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}
