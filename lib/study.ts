import type { Segment } from './core';

export type StudyItem = { segmentIds: number[]; front?: string; question?: string };
export const STUDY_LIMIT = 200;

function normalized(text: string) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
export function mergeStudyItems<T extends StudyItem>(existing: T[], incoming: T[], count: number) {
  const merged = [...existing];
  const seen = new Set(existing.map((item) => normalized(item.front ?? item.question ?? '')));
  for (const item of incoming) {
    const key = normalized(item.front ?? item.question ?? '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= Math.min(STUDY_LIMIT, existing.length + count)) break;
  }
  return merged;
}
export function studyCoverage(segments: Segment[], items: StudyItem[]) {
  const cited = new Set(items.flatMap((item) => item.segmentIds));
  const missing = segments.filter((segment) => !cited.has(segment.id));
  return { covered: segments.length - missing.length, total: segments.length, missing };
}

/** Keep every character, including unusually long imported segments. */
export function summaryChunks(segments: Segment[], budget = 10000): Segment[][] {
  const chunks: Segment[][] = [];
  let chunk: Segment[] = [];
  let size = 0;
  for (const segment of segments) {
    for (let offset = 0; offset < segment.text.length; offset += budget) {
      const part = { ...segment, text: segment.text.slice(offset, offset + budget) };
      if (size + part.text.length > budget && chunk.length) {
        chunks.push(chunk);
        chunk = [];
        size = 0;
      }
      chunk.push(part);
      size += part.text.length;
    }
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}

// A conservative sizing heuristic, not a model tokenizer. Non-ASCII scripts
// can consume many more tokens per character than English. Leave headroom for
// instructions, schema and boundary context rather than using characters alone.
export function sourceTokenEstimate(text: string) {
  let cost = 0;
  for (const char of text) cost += char.codePointAt(0)! < 128 ? 0.25 : 1;
  return Math.ceil(cost);
}

function multilingualChunks(segments: Segment[], characterBudget: number): Segment[][] {
  const chunks: Segment[][] = [];
  let chunk: Segment[] = [], characters = 0, cost = 0;
  const flush = () => { if (chunk.length) chunks.push(chunk); chunk = []; characters = 0; cost = 0; };
  for (const segment of segments) {
    const segmentCost = sourceTokenEstimate(segment.text);
    if (chunk.length && segment.text.length <= characterBudget && segmentCost <= 3500 &&
        (characters + segment.text.length > characterBudget || cost + segmentCost > 3500)) flush();
    let text = '';
    for (const char of segment.text) {
      const weight = char.codePointAt(0)! < 128 ? 0.25 : 1;
      if (characters + char.length > characterBudget || cost + weight > 3500) {
        if (text) chunk.push({ ...segment, text });
        text = ''; flush();
      }
      text += char; characters += char.length; cost += weight;
    }
    if (text) chunk.push({ ...segment, text });
  }
  flush();
  return chunks;
}

export function summarySourceChunks(segments: Segment[], detail: string, version = 3) {
  if (version >= 3) return multilingualChunks(segments, detail === 'detailed' ? 8000 : 16000);
  const large = segments.reduce((n, segment) => n + segment.text.length, 0) > 60000;
  return summaryChunks(
    segments,
    version === 1
      ? detail === 'detailed' ? (large ? 32000 : 8000) : large ? 60000 : 16000
      : detail === 'detailed' ? 8000 : 16000,
  );
}

export function summaryLanguageInstruction(segments: Segment[], language: string) {
  if (language !== 'Source language') return `Write every title, overview, key point and chapter in ${language}.`;
  const text = segments.map(segment => segment.text).join(' ');
  const scripts = ['Devanagari', 'Bengali', 'Arabic', 'Cyrillic', 'Han', 'Hangul', 'Tamil', 'Telugu', 'Gujarati', 'Gurmukhi', 'Kannada', 'Malayalam', 'Thai', 'Greek'];
  const letters = (text.match(/\p{L}/gu) ?? []).length;
  const dominant = scripts.find(script => (text.match(new RegExp(`\\p{Script=${script}}`, 'gu')) ?? []).length > letters * 0.5);
  return 'Use the same primary language as the language sample for every title, overview, key point and chapter. Do not switch to English between parts. ' +
    (dominant ? `The full source predominantly uses the ${dominant} script. Keep that script for explanatory prose; proper names and formulas may retain their original spelling.` : 'Keep the source language consistently throughout.');
}

export function summaryBoundaryContext(chunks: Segment[][], index: number) {
  const join = (segments: Segment[]) => segments.map(segment => segment.text).join(' ');
  return JSON.stringify({
    languageSample: join(chunks[0] ?? []).slice(0, 160),
    precedingSource: index ? join(chunks[index - 1]).slice(-1400) : '',
    followingSource: join(chunks[index + 1] ?? []).slice(0, 600),
  });
}
