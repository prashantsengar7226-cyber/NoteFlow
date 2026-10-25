export type Segment = { id: number; text: string; start: number | null; duration?: number };
export type Summary = {
  title: string;
  overview: string;
  keyPoints: { text: string; segmentIds: number[] }[];
  chapters: { title: string; segmentId: number; summary: string }[];
  engine: 'ai' | 'extractive';
  models?: string[];
  language: string;
  coverage?: { reviewedSegments: number; totalSegments: number; parts: number };
};
export type SummaryProgress = {
  runId: string;
  language: string;
  detail: string;
  completedParts: number;
  totalParts: number;
  state: 'running' | 'paused';
  error: string | null;
  preview: Summary | null;
};
export const MAX_TEXT = 300000;
export const MAX_SEGMENTS = 10000;
function checkStorageSize(segments: Segment[]) {
  if (new TextEncoder().encode(JSON.stringify(segments)).byteLength > 1_500_000)
    throw new AppError(
      413,
      'TOO_LARGE',
      'This transcript contains too much timestamp or text data. Split it into smaller parts.',
    );
}
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function youtubeId(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(400, 'INVALID_URL', 'Paste a complete YouTube video URL.');
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port)
    throw new AppError(400, 'INVALID_URL', 'Only standard YouTube URLs are supported.');
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1);
  else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
  ) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (/^\/(shorts|live|embed)\//.test(url.pathname)) id = url.pathname.split('/')[2];
  }
  if (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))
    throw new AppError(
      400,
      'INVALID_URL',
      'Use a YouTube video link, not a channel, playlist, or another website.',
    );
  return id;
}
export function timestamp(seconds: number | null): string {
  if (seconds === null) return 'Text';
  const s = Math.max(0, Math.floor(seconds));
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function seconds(t: string): number {
  const p = t.replace(',', '.').split(':').map(Number);
  return p.reduce((sum, n) => sum * 60 + n, 0);
}
function clean(text: string) {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
export function parseTranscript(raw: string): Segment[] {
  if (raw.length > MAX_TEXT)
    throw new AppError(
      413,
      'TOO_LONG',
      `This version accepts up to ${MAX_TEXT.toLocaleString()} characters. Split the source into smaller parts.`,
    );
  const lines = raw.replace(/\r/g, '').split('\n');
  const segments: Segment[] = [];
  const timing = /(?:(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->/;
  if (lines.some((l) => timing.test(l))) {
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(
        /((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})\s*-->\s*((?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3})/,
      );
      if (!match) continue;
      let text = '';
      while (i + 1 < lines.length && lines[i + 1].trim() && !timing.test(lines[i + 1]))
        text += ' ' + lines[++i];
      const start = seconds(match[1]),
        end = seconds(match[2]);
      const content = clean(text);
      if (content && Number.isFinite(start) && end >= start)
        segments.push({ id: segments.length, text: content, start, duration: end - start });
    }
  } else {
    const chunks = raw.trim().match(/[^.!?\n]+[.!?]+(?:\s|$)|[^.!?\n]+$/gm) || [raw];
    for (const chunk of chunks) {
      const text = clean(chunk);
      if (text) segments.push({ id: segments.length, text, start: null });
    }
  }
  if (segments.map((s) => s.text).join(' ').length < 80)
    throw new AppError(400, 'TOO_SHORT', 'Add at least 80 characters of source content.');
  if (segments.length > MAX_SEGMENTS)
    throw new AppError(
      413,
      'TOO_MANY_SEGMENTS',
      `Use up to ${MAX_SEGMENTS.toLocaleString()} transcript segments.`,
    );
  checkStorageSize(segments);
  return segments;
}
export function normalizeProviderTranscript(value: unknown): Segment[] {
  if (typeof value === 'string') return parseTranscript(value);
  if (!Array.isArray(value))
    throw new AppError(
      502,
      'BAD_TRANSCRIPT',
      'The transcript provider returned an invalid response.',
    );
  const segments: Segment[] = value
    .map((s, i) => {
      if (
        !s ||
        typeof s.text !== 'string' ||
        typeof s.offset !== 'number' ||
        !Number.isFinite(s.offset) ||
        s.offset < 0
      )
        throw new AppError(
          502,
          'BAD_TRANSCRIPT',
          'The provider returned invalid transcript timestamps.',
        );
      return {
        id: i,
        text: clean(s.text),
        start: s.offset / 1000,
        ...(typeof s.duration === 'number' && s.duration >= 0
          ? { duration: s.duration / 1000 }
          : {}),
      };
    })
    .filter((s) => s.text);
  const length = segments.reduce((n, s) => n + s.text.length, 0);
  if (length > MAX_TEXT || segments.length > MAX_SEGMENTS)
    throw new AppError(
      413,
      'TOO_LONG',
      `This video exceeds ${MAX_TEXT.toLocaleString()} characters or ${MAX_SEGMENTS.toLocaleString()} transcript segments. Import a shorter section.`,
    );
  if (length < 80)
    throw new AppError(
      422,
      'EMPTY_TRANSCRIPT',
      'The video does not have enough spoken content to summarize.',
    );
  checkStorageSize(segments);
  return segments.map((s, i) => ({ ...s, id: i }));
}
const stops = new Set(
  'the a an of to is in and for that it on as are be this with you we i or from by at was not have has can your our they their but so'.split(
    ' ',
  ),
);
export function words(t: string) {
  return (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).filter(
    (w) => w.length > 2 && !stops.has(w),
  );
}
export function extractiveSummary(segments: Segment[], title: string): Summary {
  const freq = new Map<string, number>();
  segments.forEach((s) =>
    new Set(words(s.text)).forEach((w) => freq.set(w, (freq.get(w) || 0) + 1)),
  );
  const ranked = segments
    .map((s) => ({
      s,
      score:
        words(s.text).reduce((n, w) => n + (freq.get(w) || 0), 0) /
        Math.sqrt(Math.max(s.text.length, 1)),
    }))
    .sort((a, b) => b.score - a.score);
  const selected = ranked
    .slice(0, Math.min(6, segments.length))
    .sort((a, b) => a.s.id - b.s.id)
    .map((x) => x.s);
  return {
    title,
    overview: selected
      .slice(0, 2)
      .map((s) => s.text)
      .join(' '),
    keyPoints: selected.map((s) => ({ text: s.text, segmentIds: [s.id] })),
    chapters: [],
    engine: 'extractive',
    language: 'Source language',
  };
}
export function retrieve(segments: Segment[], question: string): Segment[] {
  const query = new Set(words(question));
  const ranked = segments
    .map((s) => ({ s, score: words(s.text).filter((w) => query.has(w)).length }))
    .sort((a, b) => b.score - a.score);
  const ids = new Set<number>();
  ranked.slice(0, 10).forEach(({ s }) => {
    ids.add(s.id);
    if (s.id > 0) ids.add(s.id - 1);
    if (s.id + 1 < segments.length) ids.add(s.id + 1);
  });
  return segments.filter((s) => ids.has(s.id)).slice(0, 24);
}
export function sourceText(segments: Segment[]) {
  return segments
    .map((s) => `[${s.id}] ${s.start === null ? '' : timestamp(s.start) + ' '}${s.text}`)
    .join('\n');
}
export function asMarkdown(title: string, summary: Summary | null, annotations = ''): string {
  return `# ${title}\n\n${summary ? `${summary.overview}\n\n## Key takeaways\n\n${summary.keyPoints.map((p) => '- ' + p.text).join('\n')}\n\n${summary.chapters.map((c) => `### ${c.title}\n\n${c.summary}`).join('\n\n')}\n\n_Generated with ${summary.engine === 'ai' ? 'AI; verify important claims against the source.' : 'basic extractive mode; selected sentences from the source.'}_` : 'No summary generated.'}${annotations ? '\n\n## My notes\n\n' + annotations : ''}\n`;
}
export function asSrt(segments: Segment[]): string {
  const format = (s: number) => {
    const h = Math.floor(s / 3600),
      m = Math.floor((s % 3600) / 60),
      sec = Math.floor(s % 60),
      ms = Math.floor((s % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };
  return segments
    .filter((s) => s.start !== null)
    .map(
      (s, i) =>
        `${i + 1}\n${format(s.start!)} --> ${format(s.start! + (s.duration ?? 3))}\n${s.text}`,
    )
    .join('\n\n');
}
