import type { Segment, Summary } from './core';

/** Organize existing claims without generating, dropping or rewriting facts. */
export function revisionTopics(summary: Summary, segments: Segment[]) {
  const order = new Map(segments.map((s, index) => [s.id, index]));
  const topics = summary.chapters.map((chapter, index) => ({
    id: `topic-${index}`, title: chapter.title, explanation: chapter.summary,
    segmentIds: [chapter.segmentId], start: order.get(chapter.segmentId) ?? -1,
    points: [] as Summary['keyPoints'],
  })).sort((a, b) => a.start - b.start);
  const other = { id: 'topic-other', title: 'More revision points', explanation: '', segmentIds: [] as number[], start: -1, points: [] as Summary['keyPoints'] };
  for (const point of summary.keyPoints) {
    const positions = point.segmentIds.map(id => order.get(id)).filter((n): n is number => n !== undefined);
    const start = positions.length ? Math.min(...positions) : -1;
    const topic = start >= 0 ? topics.findLast(t => t.start >= 0 && t.start <= start) : undefined;
    (topic ?? other).points.push(point);
  }
  return [...(other.points.length ? [other] : []), ...topics];
}
