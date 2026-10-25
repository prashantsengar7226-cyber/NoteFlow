export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { guard, body, ownedNote, publicNote, db, handleError, json, limited } from '@/lib/server';
import type { PdfArtifacts } from '@/lib/pdf';
import { AppError } from '@/lib/core';

const inputSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(['all', 'summary', 'flashcards', 'quiz', 'transcript', 'slides']).default('all'),
  annotations: z.string().max(30000).optional(),
});
export async function POST(request: Request) {
  try {
    const owner = await guard(request, true);
    await limited(owner, 60);
    const input = inputSchema.parse(await body(request));
    const note = publicNote(await ownedNote(input.id, owner));
    if (note.status !== 'ready')
      throw new AppError(
        409,
        'NOT_READY',
        'Wait for this note to finish importing before exporting.',
      );
    const rows = await db()
      .prepare("SELECT kind,content FROM artifacts WHERE note_id=? AND kind!='__summary_progress'")
      .bind(input.id)
      .all<{ kind: string; content: string }>();
    const artifacts = Object.fromEntries(
      rows.results.map((row) => [row.kind, JSON.parse(row.content)]),
    ) as PdfArtifacts;
    if (
      (input.scope === 'flashcards' && !artifacts.flashcards?.cards.length) ||
      (input.scope === 'quiz' && !artifacts.quiz?.questions.length) ||
      (input.scope === 'slides' && !artifacts.slides)
    )
      throw new AppError(409, 'NO_MATERIAL', 'Generate this study material before downloading it.');
    return json({
      note: { ...note, annotations: input.annotations ?? note.annotations },
      artifacts,
      scope: input.scope,
    });
  } catch (error) {
    return handleError(error);
  }
}
