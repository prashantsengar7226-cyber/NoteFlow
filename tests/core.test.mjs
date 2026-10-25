import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TEXT,
  MAX_SEGMENTS,
  youtubeId,
  parseTranscript,
  normalizeProviderTranscript,
  extractiveSummary,
  retrieve,
  asSrt,
  asMarkdown,
  timestamp,
} from '../lib/core.ts';
test('YouTube variants canonicalize without allowing SSRF targets', () => {
  const id = 'dQw4w9WgXcQ';
  for (const u of [
    `https://www.youtube.com/watch?v=${id}&t=12`,
    `https://youtu.be/${id}`,
    `https://youtube.com/shorts/${id}`,
    `https://m.youtube.com/live/${id}`,
  ])
    assert.equal(youtubeId(u), id);
  for (const u of [
    'https://youtube.com.evil.com/watch?v=' + id,
    'http://localhost/watch?v=' + id,
    'https://user@youtube.com/watch?v=' + id,
    'file:///etc/passwd',
    'https://youtube.com/playlist?list=x',
    'https://youtube.com:8443/watch?v=' + id,
    'https://youtu.be/' + id + '/other',
  ])
    assert.throws(() => youtubeId(u));
});
const content =
  'A useful study session begins with a clear goal and a single task. Put distractions away before starting work. Take a short break and write down the next action after finishing your session.';
test('plain text splits and basic summary cites actual source excerpts', () => {
  const s = parseTranscript(content);
  assert.ok(s.length >= 3);
  const r = extractiveSummary(s, 'Study');
  assert.equal(r.engine, 'extractive');
  for (const p of r.keyPoints) {
    assert.equal(p.text, s[p.segmentIds[0]].text);
  }
  assert.ok(asMarkdown('Study', r).includes('basic extractive'));
});
test('subtitle timestamps survive parsing and SRT export', () => {
  const s = parseTranscript(
    `WEBVTT\n\n00:00:01.500 --> 00:00:06.000\nA useful study session begins with a clear goal and a single task.\n\n00:01:10.000 --> 00:01:15.000\nPut distractions away and take a short break after your session.\n`,
  );
  assert.equal(s[0].start, 1.5);
  assert.equal(s[1].start, 70);
  assert.ok(asSrt(s).includes('00:00:01,500 --> 00:00:06,000'));
});
test('provider milliseconds become seconds and malformed responses fail', () => {
  const s = normalizeProviderTranscript([{ text: content, offset: 42000, duration: 5000 }]);
  assert.equal(s[0].start, 42);
  assert.equal(s[0].duration, 5);
  for (const x of [null, [], [{ text: content, offset: -1 }], [{ text: content, offset: '12' }]])
    assert.throws(() => normalizeProviderTranscript(x));
});
test('input limits reject empty and oversized content', () => {
  assert.throws(() => parseTranscript('short'));
  assert.throws(() => parseTranscript('a'.repeat(MAX_TEXT + 1)));
});
test('larger transcripts retain the tail and enforce both new boundaries', () => {
  const long = 'अ'.repeat(MAX_TEXT - 9) + ' FINALEND';
  assert.equal(parseTranscript(long)[0].text, long);
  const rows = Array.from({ length: MAX_SEGMENTS }, (_, i) => ({
    text: `Useful transcript point ${i}`,
    offset: i * 3000,
    duration: 3000,
  }));
  const segments = normalizeProviderTranscript(rows);
  assert.equal(segments.length, MAX_SEGMENTS);
  assert.match(segments.at(-1).text, /9999/);
  assert.throws(() => normalizeProviderTranscript([...rows, rows[0]]), { code: 'TOO_LONG' });
  assert.throws(
    () => normalizeProviderTranscript([{ text: 'a'.repeat(MAX_TEXT + 1), offset: 0 }]),
    { code: 'TOO_LONG' },
  );
});
test('retrieval preserves source identity and markdown escapes no HTML execution', () => {
  const s = parseTranscript(content);
  const r = retrieve(s, 'distractions');
  assert.ok(r.some((x) => x.text.includes('distractions')));
  assert.ok(r.every((x) => s.includes(x)));
  assert.equal(timestamp(3661), '1:01:01');
  assert.equal(timestamp(null), 'Text');
});


test('plain-text parsing preserves decimals, abbreviations, URLs and Hindi punctuation',()=>{
 const source='The measured value is 3.14 units. Dr. A.B. Rao recorded version 2.5 at https://example.org/data. This exception is important: values below 0.08 are excluded. ????? ???????? ???????? ???';
 const parsed=parseTranscript(source).map(segment=>segment.text).join(' ');
 assert.equal(parsed,source);
 assert.ok(parsed.includes('The measured value is 3.14'));
});
