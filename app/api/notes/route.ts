export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;
import { z } from 'zod';
import {
  guard,
  json,
  handleError,
  body,
  limited,
  db,
  ownedNote,
  publicNote,
  type NoteRow,
  transcript,
  capacity,
  consumeService,
  config,
  refundService,
} from '@/lib/server';
import { MAX_TEXT, parseTranscript, youtubeId, AppError, type Segment } from '@/lib/core';
import { claimImport } from '@/lib/imports';
import { readSummaryProgress } from '@/lib/summary-progress';
export async function GET(r: Request) {
  try {
    const owner = await guard(r);
    const url = new URL(r.url),
      id = url.searchParams.get('id');
    if (id) {
      const note = await ownedNote(id, owner);
      const artifacts = await db()
        .prepare(
          "SELECT kind,content FROM artifacts WHERE note_id=? AND kind!='__summary_progress'",
        )
        .bind(id)
        .all<{ kind: string; content: string }>();
      const chat = await db()
        .prepare(
          'SELECT role,content FROM messages WHERE note_id=? ORDER BY created_at DESC LIMIT 40',
        )
        .bind(id)
        .all<{ role: string; content: string }>();
      return json({
        note: publicNote(note),
        summaryProgress: await readSummaryProgress(note),
        artifacts: Object.fromEntries(
          artifacts.results.map((a) => [a.kind, JSON.parse(a.content)]),
        ),
        messages: chat.results.reverse().map((m) => ({ role: m.role, ...JSON.parse(m.content) })),
      });
    }
    const all = await db()
      .prepare(
        'SELECT id,title,source,video_id,status,error,folder,starred,created_at,updated_at FROM notes WHERE owner=? ORDER BY updated_at DESC LIMIT 1000',
      )
      .bind(owner)
      .all();
    return json({ notes: all.results });
  } catch (e) {
    return handleError(e);
  }
}
const create = z.object({
  requestId: z.string().uuid().optional(),
  kind: z.enum(['youtube', 'text']),
  url: z.string().max(2048).optional(),
  text: z.string().max(MAX_TEXT).optional(),
  title: z.string().trim().min(1).max(180),
  folder: z.string().trim().min(1).max(60).default('Inbox'),
});
export async function POST(r: Request) {
  let refund: (() => Promise<void>) | undefined;
  let claim: { owner: string; id: string } | undefined;
  let saved = false;
  try {
    const owner = await guard(r, true);
    await limited(owner);
    const input = create.parse(await body(r, 2_000_000));
    if (input.requestId) {
      const result = await claimImport(owner, input.requestId, input);
      if (result.noteId)
        return json({ note: publicNote(await ownedNote(result.noteId, owner)), replayed: true });
      claim = { owner, id: input.requestId };
    }
    await capacity(owner);
    let segments: Segment[] = [],
      videoId: string | null = null,
      job: string | null = null;
    let source = 'Text';
    if (input.kind === 'youtube') {
      videoId = youtubeId(input.url || '');
      if (config().transcriptKey) refund = await consumeService(owner, 'youtube');
      source = 'YouTube';
      const result = await transcript(videoId);
      if (result.pending) job = result.jobId;
      else segments = result.segments;
    } else segments = parseTranscript(input.text || '');
    const id = crypto.randomUUID(),
      now = Date.now();
    const insert = db()
      .prepare(
        'INSERT INTO notes (id,owner,title,source,video_id,transcript,status,provider_job,folder,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        id,
        owner,
        input.title,
        source,
        videoId,
        JSON.stringify(segments),
        job ? 'processing' : 'ready',
        job,
        input.folder,
        now,
        now,
      );
    await db().batch([
      insert,
      ...(claim
        ? [
            db()
              .prepare('UPDATE import_requests SET note_id=? WHERE owner=? AND request_id=?')
              .bind(id, owner, claim.id),
          ]
        : []),
    ]);
    saved = true;
    return json({ note: publicNote(await ownedNote(id, owner)) }, 201);
  } catch (e) {
    if (!saved) {
      await refund?.().catch(() =>
        console.error(JSON.stringify({ event: 'quota_refund_failed', service: 'youtube' })),
      );
      if (claim)
        await db()
          .prepare('DELETE FROM import_requests WHERE owner=? AND request_id=? AND note_id IS NULL')
          .bind(claim.owner, claim.id)
          .run()
          .catch(() => {});
    }
    return handleError(e);
  }
}
const update = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(180).optional(),
  folder: z.string().trim().min(1).max(60).optional(),
  starred: z.boolean().optional(),
  annotations: z.string().max(30000).optional(),
  poll: z.boolean().optional(),
});
export async function PATCH(r: Request) {
  try {
    const owner = await guard(r, true);
    const input = update.parse(await body(r));
    await limited(owner, 60);
    const note = await ownedNote(input.id, owner);
    if (input.poll && note.status === 'processing' && note.provider_job) {
      const failJob = async (message: string) => {
        const changed = await db()
          .prepare(
            "UPDATE notes SET status='failed',error=?,provider_job=NULL,updated_at=? WHERE id=? AND owner=? AND status='processing' RETURNING id",
          )
          .bind(message, Date.now(), note.id, owner)
          .first();
        // A terminal transition can only be claimed once, including concurrent polling.
        if (changed)
          await refundService(owner, 'youtube', 1, Math.floor(note.created_at / 86400000));
      };
      if (Date.now() - note.created_at > 3600000) {
        await failJob(
          'This transcription job expired. Import the video again or paste its transcript.',
        );
      } else {
        try {
          const result = await transcript(note.video_id!, note.provider_job);
          if (!result.pending)
            await db()
              .prepare(
                "UPDATE notes SET transcript=?,status='ready',provider_job=NULL,error=NULL,updated_at=? WHERE id=? AND owner=? AND status='processing'",
              )
              .bind(JSON.stringify(result.segments), Date.now(), note.id, owner)
              .run();
        } catch (e) {
          if (
            e instanceof AppError &&
            [
              'TRANSCRIPT_FAILED',
              'SOURCE_UNAVAILABLE',
              'TOO_LONG',
              'EMPTY_TRANSCRIPT',
              'BAD_TRANSCRIPT',
            ].includes(e.code)
          ) {
            await failJob(e.message);
          } else throw e;
        }
      }
    } else if (!input.poll) {
      const fields: string[] = [],
        values: (string | number)[] = [];
      if (input.title !== undefined) {
        fields.push('title=?');
        values.push(input.title);
      }
      if (input.folder !== undefined) {
        fields.push('folder=?');
        values.push(input.folder);
      }
      if (input.starred !== undefined) {
        fields.push('starred=?');
        values.push(input.starred ? 1 : 0);
      }
      if (input.annotations !== undefined) {
        fields.push('annotations=?');
        values.push(input.annotations);
      }
      if (fields.length)
        await db()
          .prepare(`UPDATE notes SET ${fields.join(',')},updated_at=? WHERE id=? AND owner=?`)
          .bind(...values, Date.now(), input.id, owner)
          .run();
    }
    return json({ note: publicNote(await ownedNote(input.id, owner)) });
  } catch (e) {
    return handleError(e);
  }
}
export async function DELETE(r: Request) {
  try {
    const owner = await guard(r, true);
    await limited(owner);
    const input = z.object({ id: z.string().uuid() }).parse(await body(r));
    await ownedNote(input.id, owner);
    await db().batch([
      db().prepare('DELETE FROM artifacts WHERE note_id=?').bind(input.id),
      db().prepare('DELETE FROM messages WHERE note_id=?').bind(input.id),
      db().prepare('DELETE FROM notes WHERE id=? AND owner=?').bind(input.id, owner),
    ]);
    return json({ deleted: true });
  } catch (e) {
    return handleError(e);
  }
}
