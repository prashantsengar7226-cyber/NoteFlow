export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import { withOwnerAI, withAILease } from '@/lib/personal-ai';
import { featureRouting, withAIFeature, reserveOperation, settleOperation } from '@/lib/ai-policy';
import { summaryStep, clearPausedSummary } from '@/lib/summary-progress';
import {
  guard,
  json,
  handleError,
  body,
  limited,
  db,
  ownedNote,
  generateSummary,
  generateArtifact,
  consumeService,
  config,
  availableAIProviders,
} from '@/lib/server';
import { extractiveSummary, type Segment, AppError } from '@/lib/core';
import { mergeStudyItems, STUDY_LIMIT, summarySourceChunks, type StudyItem } from '@/lib/study';
const inputSchema = z.object({
  id: z.string().uuid(),
  incremental: z.boolean().optional(),
  runId: z.string().uuid().optional(),
  completedParts: z.number().int().min(0).max(100).optional(),
  action: z.enum([
    'insights',
    'summary',
    'basic',
    'flashcards',
    'quiz',
    'mindmap',
    'slides',
    'translation',
    'chat',
  ]),
  language: z
    .enum([
      'English',
      'Hindi',
      'Spanish',
      'French',
      'German',
      'Portuguese',
      'Japanese',
      'Korean',
      'Chinese',
      'Arabic',
      'Source language',
    ])
    .default('English'),
  detail: z.enum(['concise', 'balanced', 'detailed']).default('balanced'),
  question: z.string().trim().min(1).max(2000).optional(),
  count: z.union([z.literal(5), z.literal(10), z.literal(20)]).default(10),
  difficulty: z.enum(['mixed', 'easy', 'medium', 'hard']).default('mixed'),
  focus: z.enum(['balanced', 'gaps']).default('balanced'),
});
export async function POST(r: Request) {
  let refund: (() => Promise<void>) | undefined;
  let reservation: { owner:string; id:string } | undefined;
  try {
    const owner = await guard(r, true);
    const input = inputSchema.parse(await body(r));
    await limited(owner, 20);
    const execute = async () => {
    const note = await ownedNote(input.id, owner);
    if (note.status !== 'ready')
      throw new AppError(
        409,
        'NOT_READY',
        'Wait for the transcript to finish before generating study materials.',
      );
    const segments = JSON.parse(note.transcript) as Segment[];
    if (input.action === 'summary' && (input.incremental || featureRouting()))
      return json(await summaryStep(note, owner, segments, {...input, qualityCheck: featureRouting()}));
    if (input.action === 'summary' && segments.reduce((n, s) => n + s.text.length, 0) > 60000)
      throw new AppError(
        409,
        'REFRESH_REQUIRED',
        'Refresh Noteflow to summarize this longer source in saved parts.',
      );
    if (input.action === 'summary' || input.action === 'insights') {
      if (featureRouting() && input.action === 'insights') {
        const cached = await db().prepare("SELECT content FROM artifacts WHERE note_id=? AND kind='insights'").bind(note.id).first<{content:string}>();
        if (cached) {
          const value = JSON.parse(cached.content);
          if (value.language === input.language) return json({result:value});
        }
      }
      reservation = { owner, id: crypto.randomUUID() };
      await reserveOperation(owner, reservation.id, input.action);
    }
    if (input.action !== 'basic' && config().aiKey) {
      await availableAIProviders();
      const units =
        input.action === 'summary' ? summarySourceChunks(segments, input.detail).length : 1;
      refund = await consumeService(owner, 'ai', units);
    }
    let result;
    let added: number | undefined;
    if (input.action === 'summary' || input.action === 'basic') {
      if (input.action === 'basic') {
        await clearPausedSummary(note);
        await db().prepare("UPDATE ai_jobs SET state='cancelled',updated_at=? WHERE owner=? AND note_id=? AND state IN ('queued','retry','running')").bind(Date.now(),owner,note.id).run();
      }
      result =
        input.action === 'basic'
          ? extractiveSummary(segments, note.title)
          : await generateSummary(segments, input.language, input.detail);
      await db()
        .prepare('UPDATE notes SET summary=?,updated_at=? WHERE id=? AND owner=?')
        .bind(JSON.stringify(result), Date.now(), note.id, owner)
        .run();
    } else {
      if (input.action === 'chat' && !input.question)
        throw new AppError(400, 'QUESTION_REQUIRED', 'Enter a question.');
      const practice = input.action === 'quiz' || input.action === 'flashcards';
      const key = input.action === 'quiz' ? 'questions' : 'cards';
      const readArtifact = () =>
        db()
          .prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?')
          .bind(note.id, input.action)
          .first<{ content: string }>();
      const before = practice ? await readArtifact() : null;
      const existing = before ? (JSON.parse(before.content)[key] as StudyItem[]) : [];
      if (existing.length >= STUDY_LIMIT)
        throw new AppError(
          409,
          'STUDY_LIMIT',
          `This note already has ${STUDY_LIMIT} items in this set.`,
        );
      result = await generateArtifact(
        input.action,
        segments,
        input.language,
        input.question,
        practice
          ? { count: input.count, difficulty: input.difficulty, focus: input.focus, existing }
          : undefined,
      );
      if (input.action === 'chat')
        await db().batch([
          db()
            .prepare('INSERT INTO messages(id,note_id,role,content,created_at) VALUES(?,?,?,?,?)')
            .bind(
              crypto.randomUUID(),
              note.id,
              'user',
              JSON.stringify({ answer: input.question }),
              Date.now(),
            ),
          db()
            .prepare('INSERT INTO messages(id,note_id,role,content,created_at) VALUES(?,?,?,?,?)')
            .bind(
              crypto.randomUUID(),
              note.id,
              'assistant',
              JSON.stringify(result),
              Date.now() + 1,
            ),
        ]);
      else if (practice) {
        // Merge against the latest saved set, with compare-and-swap so concurrent
        // requests cannot overwrite one another or repeat an expensive AI call.
        let saved = false;
        for (let attempt = 0; attempt < 5; attempt++) {
          await ownedNote(note.id, owner);
          const latest = await readArtifact();
          const previous = latest ? JSON.parse(latest.content) : {};
          const items = (previous[key] ?? []) as StudyItem[];
          if (items.length >= STUDY_LIMIT)
            throw new AppError(
              409,
              'STUDY_LIMIT',
              `This set has reached ${STUDY_LIMIT} items. Your saved material is safe.`,
            );
          const merged = mergeStudyItems(items, result[key] as StudyItem[], input.count);
          added = merged.length - items.length;
          if (!added)
            throw new AppError(
              422,
              'NO_NEW_ITEMS',
              'No distinct new items were returned. Try a different difficulty or add a more detailed source. Your saved set is unchanged.',
            );
          const next = { ...previous, [key]: merged, language: input.language };
          const written = await db()
            .prepare(
              'INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?) ON CONFLICT(note_id,kind) DO UPDATE SET content=excluded.content,created_at=excluded.created_at WHERE artifacts.content=? RETURNING content',
            )
            .bind(note.id, input.action, JSON.stringify(next), Date.now(), latest?.content ?? null)
            .first<{ content: string }>();
          if (written) {
            result = next;
            saved = true;
            break;
          }
        }
        if (!saved)
          throw new AppError(
            409,
            'STUDY_CHANGED',
            'This set changed in another window. Reload and try again.',
          );
      } else
        await db()
          .prepare(
            'INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?) ON CONFLICT(note_id,kind) DO UPDATE SET content=excluded.content,created_at=excluded.created_at',
          )
          .bind(
            note.id,
            input.action,
            JSON.stringify({ ...result, language: input.language }),
            Date.now(),
          )
          .run();
    }
    if (reservation) await settleOperation(owner, reservation.id, true);
    return json({ result, ...(added === undefined ? {} : { added }) });
    };
    return await (input.action === 'basic' ? withAILease(owner, execute) : withOwnerAI(owner, () => withAIFeature(input.action, () => withAILease(owner, execute))));
  } catch (e) {
    if (reservation) await settleOperation(reservation.owner, reservation.id, false).catch(() => {});
    await refund?.().catch(() =>
      console.error(JSON.stringify({ event: 'quota_refund_failed', service: 'ai' })),
    );
    return handleError(e);
  }
}
