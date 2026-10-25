// Opt-in targeted live retest after the full-route audit. Uses cached public
// transcript and temporary storage; output is separate from the complete run.
import nextEnv from '@next/env';
import { readFile, writeFile } from 'node:fs/promises';
import { env } from '../.test-runtime/harness.mjs';
import { generateSummaryPart } from '../.test-runtime/server.mjs';
import { summarySourceChunks, summaryBoundaryContext } from '../.test-runtime/study.mjs';
import { youtubeId } from '../.test-runtime/core.mjs';
nextEnv.loadEnvConfig(process.cwd());
for (const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GEMINI_API_KEY','GEMINI_MODEL','GEMINI_FALLBACK_MODEL','GROQ_API_KEY','GROQ_MODEL','OPENROUTER_API_KEY','OPENROUTER_MODEL']) if (process.env[key]) env[key] = process.env[key];
const videoIndex = process.argv.indexOf('--video'), partsIndex = process.argv.indexOf('--parts');
if (videoIndex < 0 || partsIndex < 0) throw new Error('Supply --video URL --parts 1,2');
const root = 'audit/real-video/' + youtubeId(process.argv[videoIndex + 1]);
const source = JSON.parse(await readFile(root + '/provider-transcript.json', 'utf8'));
const chunks = summarySourceChunks(source, 'detailed');
const selected = process.argv[partsIndex + 1].split(',').map(Number);
if (selected.some(n => !Number.isInteger(n) || n < 1 || n > chunks.length) || selected.length > 5) throw new Error('Invalid selected parts');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!['generativelanguage.googleapis.com','api.groq.com','openrouter.ai'].includes(new URL(input).hostname)) throw new Error('Host blocked in targeted audit');
  const response = await originalFetch(input, init);
  if (response.status === 413) {
    const data = await response.clone().json().catch(() => ({}));
    const message = typeof data.error?.message === 'string' ? data.error.message : '';
    console.log(JSON.stringify({ event: 'input_limit_numbers', limit: message.match(/Limit\s+(\d+)/i)?.[1], requested: message.match(/Requested\s+(\d+)/i)?.[1], category: /Request too large/i.test(message) ? 'request-size' : /Rate limit reached/i.test(message) ? 'quota' : 'unknown' }));
  }
  return response;
};
const report = { checkedAt: new Date().toISOString(), scope: 'Targeted provider retest, not a new full-route run; 65 seconds between parts.', results: [] };
try { report.results = JSON.parse(await readFile(root + '/targeted-retest.json', 'utf8')).results; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
try {
  for (const [i, part] of selected.entries()) {
    if (i) await new Promise(r => setTimeout(r, 65000));
    const start = Date.now();
    try {
      const result = await generateSummaryPart(chunks[part-1], 'Source language', 'detailed', part-1, chunks.length, { source, boundary: summaryBoundaryContext(chunks, part-1) });
      report.results.push({ part, elapsedMs: Date.now()-start, result });
      console.log(JSON.stringify({ part, elapsedMs: Date.now()-start, title: result.title }));
    } catch (error) {
      report.results.push({ part, elapsedMs: Date.now()-start, error: error.code ?? 'UNKNOWN' });
      process.exitCode = 1;
    }
    await writeFile(root + '/targeted-retest.json', JSON.stringify(report, null, 2));
  }
} finally { globalThis.fetch = originalFetch; }
