export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { guard, body, ownedNote, publicNote, handleError, json, limited } from '@/lib/server';
import { readSummaryProgress } from '@/lib/summary-progress';
import { AppError } from '@/lib/core';
const schema = z.object({
  ids: z
    .array(z.string().uuid())
    .min(1)
    .max(10)
    .refine((ids) => new Set(ids).size === ids.length, 'Choose each document only once.'),
});
export async function POST(request: Request) {
  try {
    const owner = await guard(request, true);
    await limited('batch-export:' + owner, 20);
    const { ids } = schema.parse(await body(request));
    const notes = [];
    let size = 0;
    // Validate every document before returning any content. Never silently omit failures.
    for (const id of ids) {
      const row = await ownedNote(id, owner);
      const note = publicNote(row);
      if (note.status !== 'ready' || !note.summary || (!note.summary.fallback && (await readSummaryProgress(row))))
        throw new AppError(
          409,
          'INCOMPLETE_BATCH',
          'Every selected document needs a completed summary. Finish or retry the unfinished documents first.',
        );
      size += JSON.stringify(note.summary).length;
      if (size > 1_000_000)
        throw new AppError(
          413,
          'BATCH_TOO_LARGE',
          'These summaries are too large for one PDF. Download a smaller selection.',
        );
      const cited = new Set([
        ...note.summary.keyPoints.flatMap(point => point.segmentIds),
        ...note.summary.chapters.map(chapter => chapter.segmentId),
      ]);
      notes.push({
        title: note.title,
        source: note.source,
        video_id: note.video_id,
        summary: note.summary,
        annotations: '',
        transcript: note.transcript.filter(segment => cited.has(segment.id)).map((segment) => ({
          id: segment.id,
          start: segment.start,
          text: '',
        })),
      });
    }
    return json({ notes });
  } catch (error) {
    return handleError(error);
  }
}
