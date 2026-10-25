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

export function summarySourceChunks(segments: Segment[], detail: string, version = 2) {
  const large = segments.reduce((n, segment) => n + segment.text.length, 0) > 60000;
  return summaryChunks(
    segments,
    version === 1
      ? detail === 'detailed' ? (large ? 32000 : 8000) : large ? 60000 : 16000
      : detail === 'detailed' ? 8000 : 16000,
  );
}
