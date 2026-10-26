import { AppError, type Segment, type SummaryProgress } from './core';
import { usesPersonalAI, aiContext } from './ai-context';
import { featureRouting, reserveOperation, settleOperation } from './ai-policy';
import { checkSummaryPart, SummaryQualityError, SummaryEvidenceError } from './summary-quality';
import {
  db,
  consumeService,
  account,
  usage,
  availableAIProviders,
  generateSummaryPart,
  mergeSummaryParts,
  type NoteRow,
  type SummaryPart,
} from './server';
import { summarySourceChunks, summaryBoundaryContext } from './study';

const KIND = '__summary_progress';
type Progress = {
  runId: string;
  language: string;
  detail: string;
  parts: SummaryPart[];
  totalParts: number;
  lockUntil: number;
  error?: string | null;
  chunkVersion?: number;
  errorCode?: string;
  legacyPrefix?: { version: number; count: number };
  draft?: SummaryPart;
  rejectedDraft?: SummaryPart;
  reviewIssues?: string[];
  evidenceIssues?: string[];
};
type Input = { language: string; detail: string; runId?: string; completedParts?: number; qualityCheck?: boolean };

function progressChunks(segments: Segment[], progress: Progress) {
  if (!progress.legacyPrefix) return summarySourceChunks(segments, progress.detail, progress.chunkVersion ?? 1);
  const original = summarySourceChunks(segments, progress.detail, progress.legacyPrefix.version);
  return [...original.slice(0, progress.legacyPrefix.count),
    ...summarySourceChunks(original.slice(progress.legacyPrefix.count).flat(), progress.detail, 3)];
}

function progressView(progress: Progress, segments: Segment[]): SummaryProgress | null {
  if (progress.parts.length === progress.totalParts) return null;
  const preview = progress.parts.length
    ? mergeSummaryParts(progress.parts, segments, progress.language)
    : null;
  if (preview) {
    const chunks = progressChunks(segments, progress);
    const remaining = new Set(
      chunks
        .slice(progress.parts.length)
        .flat()
        .map((segment) => segment.id),
    );
    const reviewed = chunks
      .slice(0, progress.parts.length)
      .flat()
      .filter((segment) => !remaining.has(segment.id));
    preview.coverage = {
      ...preview.coverage,
      reviewedSegments: new Set(reviewed.map((segment) => segment.id)).size,
      totalSegments: segments.length,
      parts: progress.parts.length,
      processedCharacters: chunks.slice(0, progress.parts.length).flat().reduce((count, segment) => count + segment.text.length, 0),
    };
  }
  return {
    runId: progress.runId,
    language: progress.language,
    detail: progress.detail,
    completedParts: progress.parts.length,
    totalParts: progress.totalParts,
    state: progress.lockUntil > Date.now() ? 'running' : 'paused',
    stage: progress.draft ? 'reviewing' : 'drafting',
    // Older releases mislabeled AI 404s as transcription failures. Correct the
    // saved display text without modifying the source or completed summary parts.
    error: progress.error?.startsWith('This video could not be transcribed.')
      ? 'An AI model was unavailable. Your source and completed summary parts are saved. Resume summary to retry with the available providers.'
      : progress.error ?? null,
    preview,
  };
}

/** Call only after the note's ownership has been verified. */
export async function readSummaryProgress(note: NoteRow) {
  const row = await db()
    .prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?')
    .bind(note.id, KIND)
    .first<{ content: string }>();
  return row ? progressView(JSON.parse(row.content), JSON.parse(note.transcript)) : null;
}
export async function clearPausedSummary(note: NoteRow) {
  const row = await db()
    .prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?')
    .bind(note.id, KIND)
    .first<{ content: string }>();
  if (!row) return;
  const progress = JSON.parse(row.content) as Progress;
  if (progress.lockUntil > Date.now())
    throw new AppError(
      409,
      'SUMMARY_IN_PROGRESS',
      'Wait for the current summary request to finish before choosing Basic summary.',
    );
  const removed = await db()
    .prepare('DELETE FROM artifacts WHERE note_id=? AND kind=? AND content=? RETURNING note_id')
    .bind(note.id, KIND, row.content)
    .first();
  if (!removed)
    throw new AppError(409, 'SUMMARY_CHANGED', 'The summary changed in another window. Try again.');
  await settleOperation(note.owner,progress.runId,false);
}

/** One provider call per request. A lease and compare-and-swap protect retries and other tabs. */
export async function summaryStep(note: NoteRow, owner: string, segments: Segment[], input: Input) {
  const row = await db()
    .prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?')
    .bind(note.id, KIND)
    .first<{ content: string }>();
  const previous = row ? (JSON.parse(row.content) as Progress) : null;
  const resuming = previous && previous.language === input.language && previous.detail === input.detail && previous.parts.length < previous.totalParts;
  const chunkVersion = resuming ? previous.chunkVersion ?? 1 : 3;
  let chunks = resuming ? progressChunks(segments, previous) : summarySourceChunks(segments, input.detail, chunkVersion);
  const response = (progress: Progress) => {
    const complete = progress.parts.length === progress.totalParts;
    return {
      runId: progress.runId,
      completedParts: progress.parts.length,
      totalParts: progress.totalParts,
      progress: progressView(progress, segments),
      ...(complete
        ? { result: mergeSummaryParts(progress.parts, segments, progress.language) }
        : { pending: true }),
    };
  };
  const conflict = () =>
    new AppError(
      409,
      'SUMMARY_IN_PROGRESS',
      'This summary is being updated in another request. Wait a moment, then try again. Completed parts are saved.',
    );
  if (
    input.runId &&
    (!previous ||
      input.runId !== previous.runId ||
      input.language !== previous.language ||
      input.detail !== previous.detail)
  )
    throw new AppError(
      409,
      'SUMMARY_CHANGED',
      'This summary changed in another window. Generate again to continue.',
    );
  // Replaying a completed step returns saved progress without spending another AI unit.
  if (
    input.runId &&
    previous &&
    (previous.parts.length === previous.totalParts ||
      (input.completedParts !== undefined && input.completedParts < previous.parts.length))
  )
    return response(previous);
  if (previous && previous.lockUntil > Date.now()) throw conflict();
  if (
    input.runId &&
    input.completedParts !== undefined &&
    input.completedParts !== previous?.parts.length
  )
    throw conflict();

  const resume =
    previous &&
    previous.language === input.language &&
    previous.detail === input.detail &&
    previous.parts.length < previous.totalParts;
  let progress: Progress = resume
    ? { ...previous }
    : {
        runId: crypto.randomUUID(),
        language: input.language,
        detail: input.detail,
        parts: [],
        totalParts: chunks.length,
        lockUntil: 0,
        chunkVersion,
      };
  // Upgrade only the unfinished suffix of a legacy run that has hit a size or
  // time limit. Retain the original prefix boundaries, run ID and saved parts.
  // Persist this plan under the same lease/CAS as the next step, including when
  // that step fails, so reopening or replaying cannot reshuffle saved work.
  if (resume && chunkVersion < 3 && !progress.legacyPrefix &&
      (['TIMEOUT', 'OUTPUT_LIMIT', 'PROVIDER_INPUT_LIMIT'].includes(progress.errorCode ?? '') ||
       /timed out|took too long|input limit|output limit/i.test(progress.error ?? ''))) {
    progress = { ...progress, chunkVersion: 3, legacyPrefix: { version: chunkVersion, count: progress.parts.length } };
    chunks = progressChunks(segments, progress);
    progress.totalParts = chunks.length;
  }
  // Fail before spending the first unit if a new run cannot fit today's budget.
  // Existing runs can still advance across days, preserving all saved work.
  if (!featureRouting() && !resume && !input.qualityCheck && !usesPersonalAI(owner)) {
    const [plan, used] = await Promise.all([account(owner), usage(owner)]);
    const remaining = plan.daily.ai - used.ai;
    if (chunks.length > remaining) {
      const balancedHelps = input.detail === 'detailed' && summarySourceChunks(segments, 'balanced').length < chunks.length;
      throw new AppError(409, 'SUMMARY_ALLOWANCE', `This ${input.detail} summary needs ${chunks.length} AI operations; ${remaining} remain today. Choose a shorter source, ${balancedHelps ? 'Balanced detail, or ' : 'or '}Basic summary before starting.`);
    }
  }
  await availableAIProviders();
  const reserved = JSON.stringify({ ...progress, error: null, errorCode: undefined, lockUntil: Date.now() + 180000 });
  const claimed = await db()
    .prepare(
      'INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?) ON CONFLICT(note_id,kind) DO UPDATE SET content=excluded.content,created_at=excluded.created_at WHERE artifacts.content=? RETURNING content',
    )
    .bind(note.id, KIND, reserved, Date.now(), row?.content ?? null)
    .first();
  if (!claimed) throw conflict();
  let refund: (() => Promise<void>) | undefined;
  try {
    await reserveOperation(owner, aiContext.getStore()?.operationId ?? progress.runId, 'summary');
    if (!progress.draft) refund = await consumeService(owner, 'ai');
    let part = progress.draft ?? await generateSummaryPart(
      chunks[progress.parts.length],
      input.language,
      input.detail,
      progress.parts.length,
      chunks.length,
      { source: segments, boundary: summaryBoundaryContext(chunks, progress.parts.length), reviewIssues: input.qualityCheck ? progress.reviewIssues : undefined, rejectedDraft: input.qualityCheck ? progress.rejectedDraft : undefined },
    );
    if (input.qualityCheck && !progress.draft) {
      const staged = { ...progress, draft: part, evidenceIssues: undefined, error: null, errorCode: undefined, lockUntil: 0 };
      const saved = await db().prepare('UPDATE artifacts SET content=? WHERE note_id=? AND kind=? AND content=? RETURNING content')
        .bind(JSON.stringify(staged), note.id, KIND, reserved).first();
      if (!saved) throw conflict();
      return response(staged);
    }
    if (input.qualityCheck) part = await checkSummaryPart(part, chunks[progress.parts.length], summaryBoundaryContext(chunks, progress.parts.length), input.detail, progress.evidenceIssues);
    const next = { ...progress, draft: undefined, rejectedDraft: undefined, reviewIssues: undefined, evidenceIssues: undefined, parts: [...progress.parts, part], error: null, errorCode: undefined, lockUntil: 0 };
    const serialized = JSON.stringify(next);
    // Leave room for the source and annotations in the note's database row.
    const summary = mergeSummaryParts(next.parts, segments, input.language);
    const summaryJson = JSON.stringify(summary);
    if (new TextEncoder().encode(summaryJson).byteLength > 400000)
      throw new AppError(
        413,
        'SUMMARY_SIZE',
        'This study guide is too large to save. Choose a concise summary or split the source. Your previous summary is safe.',
      );
    const complete = next.parts.length === chunks.length;
    const statements = [];
    if (complete)
      statements.push(
        db()
          .prepare(
            'UPDATE notes SET summary=?,updated_at=? WHERE id=? AND owner=? AND EXISTS (SELECT 1 FROM artifacts WHERE note_id=? AND kind=? AND content=?) RETURNING id',
          )
          .bind(summaryJson, Date.now(), note.id, owner, note.id, KIND, reserved),
      );
    statements.push(
      db()
        .prepare(
          'UPDATE artifacts SET content=?,created_at=? WHERE note_id=? AND kind=? AND content=? RETURNING content',
        )
        .bind(serialized, Date.now(), note.id, KIND, reserved),
    );
    const written = await db().batch(statements);
    if (!written[written.length - 1].results.length) throw conflict();
    if (complete) await settleOperation(owner, aiContext.getStore()?.operationId ?? progress.runId, true);
    return response(next);
  } catch (error) {
    await refund?.().catch(() =>
      console.error(JSON.stringify({ event: 'quota_refund_failed', service: 'ai' })),
    );
    await db()
      .prepare('UPDATE artifacts SET content=? WHERE note_id=? AND kind=? AND content=?')
      .bind(
        JSON.stringify({
          ...progress,
          draft: error instanceof AppError && error.code === 'QUALITY_REVIEW' ? undefined : progress.draft,
          rejectedDraft: error instanceof SummaryQualityError ? progress.draft : progress.rejectedDraft,
          reviewIssues: error instanceof SummaryQualityError ? error.issues : progress.reviewIssues,
          evidenceIssues: error instanceof SummaryEvidenceError ? error.issues : error instanceof SummaryQualityError ? undefined : progress.evidenceIssues,
          lockUntil: 0,
          errorCode: error instanceof AppError ? error.code : 'INTERNAL',
          error:
            error instanceof AppError
              ? error.message
              : 'Generation stopped. Your saved parts are safe. Please resume the summary.',
        }),
        note.id,
        KIND,
        reserved,
      )
      .run();
    if (error instanceof AppError && progress.parts.length)
      error.message +=
        ' Completed summary parts are saved. Choose Resume summary to continue.';
    throw error;
  }
}
