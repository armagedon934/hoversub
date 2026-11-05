// Line/column bookkeeping for a text (offsets are UTF-16 code units, like JavaScript strings).

import type { Range } from './types';

export class LineIndex {
  readonly starts: number[];
  readonly length: number;
  constructor(text: string) {
    const s = [0];
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) s.push(i + 1);
    this.starts = s;
    this.length = text.length;
  }
  get lineCount(): number {
    return this.starts.length;
  }
  lineOf(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  range(start: number, end: number): Range {
    const line = this.lineOf(start);
    return { start, end, line, col: start - this.starts[line], endLine: this.lineOf(Math.max(start, end - 1)) };
  }
  lineText(text: string, line: number): string {
    const s = this.starts[line] ?? text.length;
    const e = line + 1 < this.starts.length ? this.starts[line + 1] - 1 : text.length;
    return text.slice(s, e).replace(/\r$/, '');
  }
}

/** First line of a snippet, trimmed and shortened for display. */
export function short(text: string, max = 80): string {
  const first = text.trim().split('\n')[0].trim();
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
