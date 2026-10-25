// Passive public-asset inventory. Downloads inert JavaScript; never executes it.
// Local audit evidence is excluded from Git and release archives.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = 'audit/reference/continuation';
const base = 'https://cdn.notegpt.io/notegpt/pages/public/_nuxt/';
const entry = await readFile('audit/reference/notegpt-assets/1.js', 'utf8');
const routes = [...entry.matchAll(/path:`([^`]+)`.{0,120}?component:\(\)=>\w+\(\(\)=>import\(`\.\/([^`]+\.js)`\)/g)]
  .map(m => ({ path: m[1], file: m[2] }));
const relevant = routes.filter(r => /^\/(?:youtube-video-summarizer|youtube-transcript-generator|pdf-summary|ai-notes|notes|summary|ai-quiz-generator|ai-flashcard-maker|video-summarizer)$/.test(r.path));
await mkdir(root + '/assets', { recursive: true });
const queue = relevant.map(r => ({ file: r.file, depth: 0 }));
const seen = new Set();
const assets = [];
let bytes = 0;
while (queue.length && seen.size < 90 && bytes < 12_000_000) {
  const { file, depth } = queue.shift();
  if (seen.has(file) || !/^[\w-]+\.js$/.test(file)) continue;
  seen.add(file);
  const url = new URL(file, base).href;
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) { assets.push({ file, url, status: response.status }); continue; }
  const source = await response.text();
  if (Buffer.byteLength(source) > 2_000_000) { assets.push({ file, url, skipped: 'size cap' }); continue; }
  bytes += Buffer.byteLength(source);
  await writeFile(root + '/assets/' + file, source);
  const imports = [...new Set([...source.matchAll(/(?:from\s*|import\s*\()["'`]\.\/([\w-]+\.js)["'`]/g)].map(m => m[1]))];
  const signals = [...new Set([...source.matchAll(/(?:https:\/\/[^\s"'`<>]+|\/(?:api|v1|v2)\/[\w/.-]+|EventSource|ReadableStream|AbortController|setInterval|retry|timeout)/g)].map(m => m[0]))];
  assets.push({ file, url, depth, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex'), imports, signals });
  if (depth < 1) queue.push(...imports.map(file => ({ file, depth: depth + 1 })));
}
const report = { checkedAt: new Date().toISOString(), relevant, assets, bytes, queuedButNotFetched: queue.length, scope: 'Selected public study routes and direct imports; static observations only. No endpoint invocation, login or source execution.' };
await writeFile(root + '/manifest.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ routes: relevant, downloaded: assets.filter(a => a.sha256).length, bytes, queuedButNotFetched: queue.length }));
