// Opt-in: node tests/run.mjs --real-video-audit
// Real public YouTube import and live AI, with synthetic identity and temporary
// in-memory storage. Never connects to the production database or Supabase.
import nextEnv from '@next/env';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { env, context } from '../.test-runtime/harness.mjs';
import * as notes from '../.test-runtime/notes.mjs';
import * as actions from '../.test-runtime/actions.mjs';
import { parseTranscript, youtubeId } from '../.test-runtime/core.mjs';
nextEnv.loadEnvConfig(process.cwd());
for (const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','GROQ_API_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL','SUPADATA_API_KEY']) if (process.env[key]) env[key] = process.env[key];
env.MONETIZATION_MODE = 'free_launch'; env.BILLING_ENABLED = 'false';
const originalFetch = globalThis.fetch;
const providerHeaders = [];
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (!['generativelanguage.googleapis.com','api.groq.com','openrouter.ai','api.supadata.ai'].includes(url.hostname)) throw new Error('External host blocked in real-video audit');
  const response = await originalFetch(input, init);
  if (url.hostname === 'api.groq.com') providerHeaders.push({ status: response.status, headers: Object.fromEntries([...response.headers].filter(([key]) => /^x-ratelimit-(?:limit|remaining|reset)-(?:requests|tokens)$|^retry-after$/.test(key))) });
  if (url.hostname === 'api.groq.com' && response.status === 413) {
    const data = await response.clone().json().catch(() => ({}));
    const message = typeof data.error?.message === 'string' ? data.error.message : '';
    const diagnostic = { status: 413, limit: message.match(/Limit\s+(\d+)/i)?.[1], requested: message.match(/Requested\s+(\d+)/i)?.[1] };
    providerHeaders.push(diagnostic); console.log(JSON.stringify({ event: 'input_limit_numbers', ...diagnostic }));
  }
  return response;
};
const supplied = process.argv.indexOf('--video');
const video = supplied >= 0 ? process.argv[supplied + 1] : 'https://www.youtube.com/watch?v=HtSuA80QTyo';
const videoId = youtubeId(video);
const root = 'audit/real-video/' + videoId;
await mkdir(root, { recursive: true });
const report = { checkedAt: new Date().toISOString(), video, reference: videoId === 'HtSuA80QTyo' ? 'https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-fall-2011/resources/lecture-1-algorithmic-thinking-peak-finding/' : null, scope: 'Public YouTube video; live providers; synthetic identity; local migrated in-memory database. Independent captions available for MIT only.', steps: [], passedPipeline: false, semanticReview: 'pending' };
const request = async (module, method, payload, query = '') => {
  const response = await context.run('real-video-audit', () => module[method](new Request('https://test.example/api/test' + query, { method, headers: { origin: 'https://test.example', 'content-type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) })));
  return { status: response.status, data: await response.json() };
};
const tokens = text => text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [];
const tables = {
  notes: ['id','owner','title','source','video_id','transcript','summary','status','provider_job','error','folder','starred','annotations','created_at','updated_at'],
  artifacts: ['note_id','kind','content','created_at'],
  limits: ['owner','bucket','count'],
};
async function checkpoint() {
  const state = {};
  for (const table of Object.keys(tables)) state[table] = (await env.DB.prepare('SELECT * FROM ' + table).all()).results;
  await writeFile(root + '/checkpoint.json', JSON.stringify({ videoId, state, report }));
}
const started = Date.now();
try {
  let restored;
  try { restored = JSON.parse(await readFile(root + '/checkpoint.json', 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let note;
  if (restored) {
    assert.equal(restored.videoId, videoId);
    if (process.argv.includes('--fresh-summary')) {
      // Preserve the failed baseline and all usage/cooldown counters. Only the
      // synthetic note's summary state is cleared for the new algorithm.
      await writeFile(root + '/baseline-checkpoint.json', JSON.stringify(restored));
      await writeFile(root + '/baseline-report.json', JSON.stringify(restored.report, null, 2));
      restored.state.artifacts = restored.state.artifacts.filter(row => row.kind !== '__summary_progress');
      restored.state.notes[0].summary = null;
      restored.report = { ...report, importStatus: restored.report.importStatus, cachedTranscript: true, freshSummaryAt: new Date().toISOString() };
    }
    for (const [table, columns] of Object.entries(tables)) for (const row of restored.state[table]) {
      await env.DB.prepare('INSERT INTO ' + table + '(' + columns.join(',') + ') VALUES(' + columns.map(() => '?').join(',') + ')').bind(...columns.map(key => row[key] ?? null)).run();
    }
    Object.assign(report, restored.report, { resumedAuditAt: new Date().toISOString(), failure: undefined });
    note = (await request(notes, 'GET', null, '?id=' + restored.state.notes[0].id)).data.note;
  } else {
    const imported = await request(notes, 'POST', { kind: 'youtube', url: video, title: 'Real-video audit: ' + videoId });
    report.importStatus = imported.status;
    if (imported.status !== 201) { report.failure = imported.data.code; throw new Error('Import failed'); }
    note = imported.data.note;
    await checkpoint();
  }
  for (let i = 0; note.status === 'processing' && i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const polled = await request(notes, 'PATCH', { id: note.id, poll: true });
    if (polled.status !== 200) { report.failure = polled.data.code; throw new Error('Poll failed'); }
    note = polled.data.note;
  }
  assert.equal(note.status, 'ready');
  await writeFile(root + '/provider-transcript.json', JSON.stringify(note.transcript, null, 2));
  const b = tokens(note.transcript.map(s => s.text).join(' '));
  report.transcript = { importedWords: b.length, importedLastTimestamp: note.transcript.at(-1).start, importedSegments: note.transcript.length, importedCharacters: note.transcript.reduce((n,s) => n+s.text.length,0) };
  if (videoId === 'HtSuA80QTyo') {
    const official = parseTranscript(await readFile('audit/real-video/mit.vtt', 'utf8'));
    const a = tokens(official.map(s => s.text).join(' '));
    const bGrams = new Set(b.slice(0,-4).map((_,i) => b.slice(i,i+5).join(' ')));
    let matched = 0;
    for (let i = 0; i < a.length-4; i++) if (bGrams.has(a.slice(i,i+5).join(' '))) matched++;
    Object.assign(report.transcript, { officialWords: a.length, officialFiveGramRecall: matched/(a.length-4), normalizedWordSequenceEqual: a.join(' ') === b.join(' '), officialLastTimestamp: official.at(-1).start });
  }
  await checkpoint();
  if (process.argv.includes('--import-only')) { report.importOnly = true; }
  else {
  const paceIndex = process.argv.indexOf('--pace-ms');
  const paceMs = paceIndex < 0 ? 0 : Number(process.argv[paceIndex + 1]);
  assert.ok(Number.isFinite(paceMs) && paceMs >= 0 && paceMs <= 90000);
  report.auditPacingMs = paceMs;
  let runId, completedParts = 0, result;
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    const response = await request(actions, 'POST', { id: note.id, action: 'summary', language: videoId === 'HtSuA80QTyo' ? 'English' : 'Source language', detail: 'detailed', incremental: true, runId, completedParts });
    report.steps.push({ status: response.status, code: response.data.code, elapsedMs: Date.now() - start, completedParts: response.data.completedParts, totalParts: response.data.totalParts });
    console.log(JSON.stringify({ event: 'real_video_step', ...report.steps.at(-1) }));
    await checkpoint();
    if (response.status !== 200) { report.failure = response.data.code; throw new Error('Summary paused'); }
    runId = response.data.runId; completedParts = response.data.completedParts;
    if (response.data.result) { result = response.data.result; break; }
    if (paceMs) await new Promise(resolve => setTimeout(resolve, paceMs));
  }
  assert.ok(result);
  const saved = await request(notes, 'GET', null, '?id=' + note.id);
  assert.deepEqual(saved.data.note.summary, result);
  assert.equal(saved.data.summaryProgress, null);
  await writeFile(root + '/summary.json', JSON.stringify(result, null, 2));
  report.models = result.models;
  report.elapsedMs = Date.now() - started;
  report.passedPipeline = true; report.importOnly = false;
  }
} catch {
  report.failure ??= 'AUDIT_ASSERTION_FAILED'; process.exitCode = 1;
} finally {
  report.providerQuotaHeaders = [...(report.providerQuotaHeaders ?? []), ...providerHeaders];
  await checkpoint();
  globalThis.fetch = originalFetch;
  await writeFile(root + '/pipeline-report.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
