import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as notes from '../.test-runtime/notes.mjs';
import * as actions from '../.test-runtime/actions.mjs';
import * as workspace from '../.test-runtime/workspace.mjs';
import * as transcribe from '../.test-runtime/transcribe.mjs';
import * as pdfExport from '../.test-runtime/export.mjs';
import { env, context } from '../.test-runtime/harness.mjs';
import { guard, consumeService, usage } from '../.test-runtime/server.mjs';
beforeEach(async()=>{await env.DB.prepare("DELETE FROM limits WHERE owner LIKE 'provider:cooldown:%'").run();});

function geminiResult(value) {
  return Response.json({
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
  });
}

test('writes compare Origin against the incoming Host, not the internal server URL', async () => {
  const request = (origin) =>
    new Request('http://localhost:3000/api/notes', {
      method: 'POST',
      headers: { host: '127.0.0.1:3000', origin, 'sec-fetch-site': 'same-origin' },
    });
  assert.equal(
    await context.run('local-test', () => guard(request('http://127.0.0.1:3000'), true)),
    'local-test',
  );
  await assert.rejects(
    context.run('local-test', () => guard(request('http://evil.example'), true)),
    { code: 'ORIGIN' },
  );
  await assert.rejects(
    context.run('local-test', () => guard(request('http://127.0.0.1:9999'), true)),
    { code: 'ORIGIN' },
  );
});

test('more practice appends, removes duplicate prompts, persists, and preserves sets on failure', async () => {
  const owner = 'practice-append';
  const n = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  const item = (front) => ({ front, back: 'A specific goal.', segmentIds: [0] });
  try {
    globalThis.fetch = async () => geminiResult({ cards: [item('What comes first?')] });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'flashcards', count: 5 }, owner)).data.added,
      1,
    );
    globalThis.fetch = async (_url, options) => {
      const payload = JSON.parse(options.body);
      assert.match(payload.contents[0].parts[0].text, /What comes first/);
      assert.match(payload.systemInstruction.parts[0].text, /up to 5 NEW/);
      return geminiResult({ cards: [item('WHAT comes first!'), item('Why set a goal?')] });
    };
    const more = await call(
      actions,
      'POST',
      { id: n.id, action: 'flashcards', count: 5, focus: 'gaps' },
      owner,
    );
    assert.equal(more.data.added, 1);
    assert.equal(more.data.result.cards.length, 2);
    globalThis.fetch = async () => geminiResult({ cards: [item('What comes first?')] });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'flashcards' }, owner)).data.code,
      'NO_NEW_ITEMS',
    );
    globalThis.fetch = async () =>
      geminiResult({ cards: [{ ...item('Bad ref'), segmentIds: [999] }] });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'flashcards' }, owner)).data.code,
      'INVALID_CITATION',
    );
    assert.equal(
      (await call(notes, 'GET', null, owner, '?id=' + n.id)).data.artifacts.flashcards.cards.length,
      2,
    );
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'quiz', count: 200 }, owner)).status,
      400,
    );
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('concurrent practice batches do not overwrite each other', async () => {
  const owner = 'practice-concurrent';
  const n = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  const waiting = [];
  try {
    globalThis.fetch = () =>
      new Promise((resolve) => {
        waiting.push(resolve);
        if (waiting.length === 2)
          waiting.forEach((finish, i) =>
            finish(
              geminiResult({
                questions: [
                  {
                    question: i === 0 ? 'How do you start?' : 'What should you do after a break?',
                    options: ['Set a goal', 'Open tabs', 'Get distracted', 'Do nothing'],
                    correctIndex: 0,
                    explanation: 'The source explains the routine.',
                    segmentIds: [0],
                  },
                ],
              }),
            ),
          );
      });
    const results = await Promise.all(
      [0, 1].map(() => call(actions, 'POST', { id: n.id, action: 'quiz', count: 5 }, owner)),
    );
    assert.deepEqual(
      results.map((result) => result.status),
      [200, 200],
    );
    assert.equal(
      (await call(notes, 'GET', null, owner, '?id=' + n.id)).data.artifacts.quiz.questions.length,
      2,
    );
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('detailed summaries process the end of long sources and a failed part cannot replace a saved summary', async () => {
  const owner = 'long-summary';
  const n = await create(owner);
  const segments = Array.from({ length: 4 }, (_, i) => ({
    id: i,
    start: null,
    text: `Important topic ${i}. ` + 'Supporting fact. '.repeat(300) + ` FINAL_${i}`,
  }));
  await env.DB.prepare('UPDATE notes SET transcript=? WHERE id=?')
    .bind(JSON.stringify(segments), n.id)
    .run();
  await call(actions, 'POST', { id: n.id, action: 'basic' }, owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  let requests = 0;
  let seen = '';
  try {
    globalThis.fetch = async (_url, options) => {
      const content = JSON.parse(options.body).contents[0].parts[0].text;
      seen += content;
      const id = Number(content.match(/\[(\d+)\]/)[1]);
      requests++;
      return geminiResult({
        title: 'All topics',
        overview: `Part ${requests}`,
        keyPoints: [{ text: `Fact ${id}`, segmentIds: [id] }],
        chapters: [],
      });
    };
    const result = await call(
      actions,
      'POST',
      { id: n.id, action: 'summary', detail: 'detailed' },
      owner,
    );
    assert.equal(result.status, 200);
    assert.equal(requests, 4);
    assert.equal(result.data.result.keyPoints.length, 4);
    assert.match(seen, /FINAL_3/);
    requests = 0;
    globalThis.fetch = async () =>
      ++requests === 1
        ? geminiResult({
            title: 'Partial',
            overview: 'Incomplete',
            keyPoints: [{ text: 'Partial', segmentIds: [0] }],
            chapters: [],
          })
        : Response.json({}, { status: 429 });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'summary', detail: 'detailed' }, owner))
        .status,
      429,
    );
    assert.equal(
      (await call(notes, 'GET', null, owner, '?id=' + n.id)).data.note.summary.title,
      'All topics',
    );
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('PDF export is private and reports missing study material without a provider call', async () => {
  const n = await create('pdf-owner');
  assert.equal((await call(pdfExport, 'POST', { id: n.id }, 'someone-else')).status, 404);
  assert.equal((await call(pdfExport, 'POST', { id: n.id }, null)).status, 401);
  assert.equal(
    (
      await call(pdfExport, 'POST', { id: n.id }, 'pdf-owner', '', {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
  assert.equal(
    (await call(pdfExport, 'POST', { id: n.id, scope: 'quiz' }, 'pdf-owner')).data.code,
    'NO_MATERIAL',
  );
});
const text =
  'A useful study session starts with one clear goal. Put distracting devices out of reach before beginning your work. After a short break, record what you finished and identify the next small action.';
async function call(module, method = 'GET', payload, owner = 'alice', query = '', headers = {}) {
  const req = new Request('https://test.example/api/test' + query, {
    method,
    headers: { 'content-type': 'application/json', origin: 'https://test.example', ...headers },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
  const response = await context.run(owner, () => module[method](req));
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function create(owner = 'alice') {
  const r = await call(notes, 'POST', { kind: 'text', title: 'A study note', text }, owner);
  assert.equal(r.status, 201);
  return r.data.note;
}

test('every additional study tool generates, persists after reload, and stays private', async () => {
  const owner = 'all-study-tools';
  const note = await create(owner);
  const fixtures = {
    insights: { glossary: [{ term: 'Goal', definition: 'A clear study objective.', segmentIds: [0] }], actions: [], caveats: [] },
    flashcards: { cards: [{ front: 'How should a session start?', back: 'Choose one clear goal.', segmentIds: [0] }] },
    quiz: { questions: [{ question: 'What comes first?', options: ['A goal', 'Distraction', 'A break', 'A report'], correctIndex: 0, explanation: 'Start with a clear goal.', segmentIds: [0] }] },
    mindmap: { title: 'Study routine', branches: [{ label: 'Start', details: ['Choose a goal'] }] },
    slides: { slides: [{ title: 'Start with a goal', bullets: ['Choose one clear objective'], notes: 'Use the source routine.' }] },
    translation: { text: '[0] Commencez par un objectif clair.' },
    chat: { answer: 'Choose one clear goal.', segmentIds: [0] },
  };
  const originalFetch = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  try {
    for (const [action, fixture] of Object.entries(fixtures)) {
      globalThis.fetch = async () => geminiResult(fixture);
      const generated = await call(actions, 'POST', {
        id: note.id, action, language: 'French', question: action === 'chat' ? 'How do I start?' : undefined,
      }, owner);
      assert.equal(generated.status, 200, action);
      const saved = (await call(notes, 'GET', null, owner, '?id=' + note.id)).data;
      if (action === 'chat') {
        assert.equal(saved.messages.length, 2);
        assert.equal(saved.messages[1].answer, fixture.answer);
      } else {
        for (const [key, value] of Object.entries(fixture)) assert.deepEqual(saved.artifacts[action][key], value, action);
      }
      assert.equal((await call(notes, 'GET', null, 'another-study-owner', '?id=' + note.id)).status, 404);
    }
    assert.equal((await call(notes, 'PATCH', { id: note.id, annotations: 'My own interpretation.' }, owner)).status, 200);
    assert.equal((await call(notes, 'GET', null, owner, '?id=' + note.id)).data.note.annotations, 'My own interpretation.');
  } finally {
    globalThis.fetch = originalFetch;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});
test('unauthenticated access is denied and cross-origin writes fail', async () => {
  assert.equal((await call(notes, 'GET', null, null)).status, 401);
  assert.equal(
    (
      await call(notes, 'POST', { kind: 'text', title: 'x', text }, 'alice', '', {
        origin: 'https://evil.example',
      })
    ).status,
    403,
  );
});
test('real migrated database supports private CRUD and basic generation', async () => {
  const n = await create('crud');
  const summary = await call(actions, 'POST', { id: n.id, action: 'basic' }, 'crud');
  assert.equal(summary.status, 200);
  assert.equal(summary.data.result.engine, 'extractive');
  const patch = await call(
    notes,
    'PATCH',
    { id: n.id, annotations: 'My reflection', folder: 'Research', starred: true },
    'crud',
  );
  assert.equal(patch.data.note.annotations, 'My reflection');
  assert.equal(patch.data.note.starred, 1);
  const read = await call(notes, 'GET', null, 'crud', '?id=' + n.id);
  assert.equal(read.data.note.summary.engine, 'extractive');
  assert.equal(read.headers.get('cache-control'), 'no-store');
  assert.equal((await call(notes, 'GET', null, 'stranger', '?id=' + n.id)).status, 404);
  assert.equal((await call(notes, 'PATCH', { id: n.id, title: 'stolen' }, 'stranger')).status, 404);
  assert.equal(
    (await call(actions, 'POST', { id: n.id, action: 'basic' }, 'stranger')).status,
    404,
  );
  assert.equal((await call(notes, 'DELETE', { id: n.id }, 'stranger')).status, 404);
  assert.equal((await call(notes, 'DELETE', { id: n.id }, 'crud')).status, 200);
  assert.equal((await call(notes, 'GET', null, 'crud', '?id=' + n.id)).status, 404);
});
test('missing service credentials do not produce fake results', async () => {
  const n = await create('missing');
  const r = await call(actions, 'POST', { id: n.id, action: 'summary' }, 'missing');
  assert.equal(r.status, 503);
  assert.equal(r.data.code, 'AI_NOT_CONFIGURED');
  const y = await call(
    notes,
    'POST',
    { kind: 'youtube', title: 'video', url: 'https://youtu.be/dQw4w9WgXcQ' },
    'missing',
  );
  assert.equal(y.status, 503);
  assert.equal(y.data.code, 'TRANSCRIPT_NOT_CONFIGURED');
  const s = await call(workspace, 'GET', null, 'missing');
  assert.equal(s.data.ai, false);
  assert.equal(s.data.youtube, false);
});
test('async provider transcripts persist across requests; failed provider states remain visible', async () => {
  const previous = globalThis.fetch;
  env.SUPADATA_API_KEY = 'test-key';
  try {
    globalThis.fetch = async () => Response.json({ jobId: 'job-123' }, { status: 202 });
    const r = await call(
      notes,
      'POST',
      { kind: 'youtube', title: 'Video', url: 'https://youtu.be/dQw4w9WgXcQ' },
      'youtube',
    );
    assert.equal(r.status, 201);
    assert.equal(r.data.note.status, 'processing');
    globalThis.fetch = async () =>
      Response.json({
        status: 'completed',
        result: { content: [{ text, offset: 4500, duration: 10000 }] },
      });
    const ready = await call(notes, 'PATCH', { id: r.data.note.id, poll: true }, 'youtube');
    assert.equal(ready.data.note.status, 'ready');
    assert.equal(ready.data.note.transcript[0].start, 4.5);
    globalThis.fetch = async () => Response.json({ jobId: 'job-456' }, { status: 202 });
    const second = await call(
      notes,
      'POST',
      { kind: 'youtube', title: 'Video', url: 'https://youtu.be/dQw4w9WgXcQ' },
      'youtube',
    );
    globalThis.fetch = async () => Response.json({ status: 'failed' });
    const failed = await call(notes, 'PATCH', { id: second.data.note.id, poll: true }, 'youtube');
    assert.equal(failed.data.note.status, 'failed');
    assert.ok(failed.data.note.error);
  } finally {
    globalThis.fetch = previous;
    delete env.SUPADATA_API_KEY;
  }
});
test('valid AI summaries persist; invented citations and truncated output are rejected', async () => {
  const n = await create('ai');
  const previous = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  const result = {
    title: 'Study',
    overview: 'Choose one task.',
    keyPoints: [{ text: 'Choose a goal.', segmentIds: [0] }],
    chapters: [],
  };
  try {
    globalThis.fetch = async () =>
      Response.json({
        choices: [{ message: { content: JSON.stringify(result) }, finish_reason: 'stop' }],
      });
    const r = await call(actions, 'POST', { id: n.id, action: 'summary' }, 'ai');
    assert.equal(r.status, 200);
    assert.equal(r.data.result.engine, 'ai');
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...result,
                keyPoints: [{ text: 'bad', segmentIds: [9999] }],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'summary' }, 'ai')).data.code,
      'INVALID_CITATION',
    );
    globalThis.fetch = async () => Response.json({ choices: [{ finish_reason: 'length' }] });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'summary' }, 'ai')).data.code,
      'OUTPUT_LIMIT',
    );
  } finally {
    globalThis.fetch = previous;
    delete env.GROQ_API_KEY;
  }
});
test('study artifacts and chat save to their note and are deleted with it', async () => {
  const n = await create('artifacts');
  const previous = globalThis.fetch;
  env.GROQ_API_KEY = 'test-key';
  try {
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                cards: [
                  { front: 'What should you choose?', back: 'A clear goal.', segmentIds: [0] },
                ],
              }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'flashcards' }, 'artifacts')).status,
      200,
    );
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({ answer: 'Choose one clear goal.', segmentIds: [0] }),
            },
            finish_reason: 'stop',
          },
        ],
      });
    assert.equal(
      (
        await call(
          actions,
          'POST',
          { id: n.id, action: 'chat', question: 'What should I choose?' },
          'artifacts',
        )
      ).status,
      200,
    );
    const saved = await call(notes, 'GET', null, 'artifacts', '?id=' + n.id);
    assert.equal(saved.data.artifacts.flashcards.cards.length, 1);
    assert.equal(saved.data.messages.length, 2);
    await call(notes, 'DELETE', { id: n.id }, 'artifacts');
    assert.equal(
      (
        await env.DB.prepare('SELECT COUNT(*) as n FROM messages WHERE note_id=?')
          .bind(n.id)
          .first()
      ).n,
      0,
    );
    assert.equal(
      (
        await env.DB.prepare('SELECT COUNT(*) as n FROM artifacts WHERE note_id=?')
          .bind(n.id)
          .first()
      ).n,
      0,
    );
  } finally {
    globalThis.fetch = previous;
    delete env.GROQ_API_KEY;
  }
});
test('database rate limits apply across repeated API calls', async () => {
  const n = await create('rate');
  for (let i = 0; i < 19; i++)
    assert.equal((await call(actions, 'POST', { id: n.id, action: 'basic' }, 'rate')).status, 200);
  assert.equal((await call(actions, 'POST', { id: n.id, action: 'basic' }, 'rate')).status, 429);
});

test('Gemini summaries and source chat persist with the selected provider and credentials', async () => {
  const n = await create('gemini');
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_MODEL = 'gemini-3.8-flash';
  env.GEMINI_API_KEY = 'gemini-test-key';
  env.OPENAI_API_KEY = 'unused-openai-key';
  const generated = {
    title: 'Focused study',
    overview: 'Start with a clear goal.',
    keyPoints: [{ text: 'Reduce distractions.', segmentIds: [0] }],
    chapters: [],
  };
  const respond = (value) =>
    Response.json({
      candidates: [
        {
          finishReason: 'STOP',
          content: {
            parts: [
              { thought: true, text: 'Internal reasoning is not output JSON.' },
              { text: JSON.stringify(value) },
            ],
          },
        },
      ],
    });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      assert.match(new URL(url).pathname, /gemini-3\.8-flash:generateContent$/);
      assert.equal(new URL(url).search, '');
      assert.equal(options.headers['x-goog-api-key'], 'gemini-test-key');
      assert.equal(options.headers.Authorization, undefined);
      const payload = JSON.parse(options.body);
      assert.match(payload.systemInstruction.parts[0].text, /Summarize in Hindi/);
      assert.match(payload.contents[0].parts[0].text, /clear goal/);
      assert.equal(payload.generationConfig.responseMimeType, 'application/json');
      assert.equal(payload.generationConfig.thinkingConfig.thinkingLevel, 'low');
      return respond(generated);
    };
    const result = await call(
      actions,
      'POST',
      { id: n.id, action: 'summary', language: 'Hindi' },
      'gemini',
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.result.language, 'Hindi');
    const saved = await call(notes, 'GET', null, 'gemini', '?id=' + n.id);
    assert.equal(saved.data.note.summary.overview, generated.overview);
    globalThis.fetch = async () => respond({ answer: 'Choose a clear goal.', segmentIds: [0] });
    assert.equal(
      (
        await call(
          actions,
          'POST',
          { id: n.id, action: 'chat', question: 'How do I start?' },
          'gemini',
        )
      ).status,
      200,
    );
    assert.equal((await call(notes, 'GET', null, 'gemini', '?id=' + n.id)).data.messages.length, 2);
    const status = await call(workspace, 'GET', null, 'gemini');
    assert.equal(status.data.provider, 'gemini');
    assert.equal(status.data.ai, true);
    assert.equal(status.data.model, 'gemini-3.8-flash');
    assert.ok(!JSON.stringify(status.data).includes('test-key'));
  } finally {
    globalThis.fetch = previous;
    for (const key of ['AI_PROVIDER', 'GEMINI_MODEL', 'GEMINI_API_KEY', 'OPENAI_API_KEY'])
      delete env[key];
  }
});

test('Gemini selection never falls back to OpenAI when a key is missing or quota runs out', async () => {
  const n = await create('gemini-quota');
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.OPENAI_API_KEY = 'unused-openai-key';
  let calls = 0;
  try {
    globalThis.fetch = async (url) => {
      calls++;
      assert.equal(new URL(url).hostname, 'generativelanguage.googleapis.com');
      return Response.json(
        { error: { message: 'Do not expose provider internals or secrets.' } },
        { status: 429 },
      );
    };
    const missing = await call(actions, 'POST', { id: n.id, action: 'summary' }, 'gemini-quota');
    assert.equal(missing.data.code, 'AI_NOT_CONFIGURED');
    assert.match(missing.data.error, /Basic summary/);
    assert.equal(calls, 0);
    env.GEMINI_API_KEY = 'gemini-test-key';
    const quota = await call(actions, 'POST', { id: n.id, action: 'summary' }, 'gemini-quota');
    assert.equal(quota.status, 429);
    assert.equal(quota.data.code, 'PROVIDER_LIMIT');
    assert.match(quota.data.error, /Basic summary/);
    assert.ok(!quota.data.error.includes('provider internals'));
    assert.equal(calls, 1);
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'basic' }, 'gemini-quota')).status,
      200,
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = previous;
    for (const key of ['AI_PROVIDER', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) delete env[key];
  }
});

test('Gemini blocked, malformed, truncated, and invented-citation output cannot overwrite saved work', async () => {
  const n = await create('gemini-invalid');
  await call(actions, 'POST', { id: n.id, action: 'basic' }, 'gemini-invalid');
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'gemini-test-key';
  try {
    for (const [response, code] of [
      [{ promptFeedback: { blockReason: 'SAFETY' } }, 'AI_BLOCKED'],
      [{ candidates: [{ finishReason: 'SAFETY' }] }, 'AI_BLOCKED'],
      [{ candidates: [{ finishReason: 'MAX_TOKENS' }] }, 'OUTPUT_LIMIT'],
      [
        { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'bad JSON' }] } }] },
        'INVALID_AI_OUTPUT',
      ],
      [
        {
          candidates: [
            {
              finishReason: 'STOP',
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      title: 'bad',
                      overview: 'bad',
                      keyPoints: [{ text: 'bad', segmentIds: [9999] }],
                      chapters: [],
                    }),
                  },
                ],
              },
            },
          ],
        },
        'INVALID_CITATION',
      ],
    ]) {
      globalThis.fetch = async () => Response.json(response);
      assert.equal(
        (await call(actions, 'POST', { id: n.id, action: 'summary' }, 'gemini-invalid')).data.code,
        code,
      );
    }
    const saved = await call(notes, 'GET', null, 'gemini-invalid', '?id=' + n.id);
    assert.equal(saved.data.note.summary.engine, 'extractive');
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('public audio upload is disabled and cannot spend any provider credentials', async () => {
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'gemini-test-key';
  let calls = 0;
  try {
    globalThis.fetch = async (url, options) => {
      calls++;
      assert.equal(new URL(url).hostname, 'api.openai.com');
      assert.equal(options.headers.Authorization, 'Bearer audio-openai-key');
      return new Response(text);
    };
    assert.equal(
      (await call(transcribe, 'POST', {}, 'audio-isolation')).data.code,
      'AUDIO_UNAVAILABLE',
    );
    assert.equal(calls, 0);
    env.OPENAI_API_KEY = 'audio-openai-key';
    const data = new FormData();
    data.append('file', new File(['test audio'], 'sample.mp3', { type: 'audio/mpeg' }));
    data.append('title', 'Audio test');
    const response = await context.run('audio-isolation', () =>
      transcribe.POST(
        new Request('https://test.example/api/transcribe', {
          method: 'POST',
          headers: { origin: 'https://test.example' },
          body: data,
        }),
      ),
    );
    assert.equal(response.status, 503);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previous;
    for (const key of ['AI_PROVIDER', 'GEMINI_API_KEY', 'OPENAI_API_KEY']) delete env[key];
  }
});

test('signed-in accounts have separate libraries and private export payloads', async () => {
  const alice = await create('hosted-alice');
  const bob = await create('hosted-bob');
  await call(notes, 'PATCH', { id: alice.id, annotations: 'Alice private notes' }, 'hosted-alice');
  const list = await call(notes, 'GET', null, 'hosted-bob');
  assert.deepEqual(
    list.data.notes.map((note) => note.id),
    [bob.id],
  );
  assert.equal((await call(pdfExport, 'POST', { id: alice.id }, 'hosted-bob')).status, 404);
  const exported = await call(pdfExport, 'POST', { id: alice.id }, 'hosted-alice');
  assert.equal(exported.status, 200);
  assert.equal(exported.data.note.annotations, 'Alice private notes');
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  assert.equal(
    (
      await call(notes, 'GET', null, null, '', {
        'oai-authenticated-user-id': 'hosted-alice',
      })
    ).status,
    401,
  );
});

test('daily budgets resist concurrent requests and remain separate for each visitor', async () => {
  const owner = 'quota-race';
  await consumeService(owner, 'ai', 19);
  const results = await Promise.allSettled([1, 2, 3].map(() => consumeService(owner, 'ai')));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal((await usage(owner)).ai, 20);
  await consumeService('quota-other', 'ai');
  assert.equal((await usage('quota-other')).ai, 1);
  const note = await create(owner);
  assert.equal((await call(actions, 'POST', { id: note.id, action: 'basic' }, owner)).status, 200);
  assert.equal((await call(pdfExport, 'POST', { id: note.id }, owner)).status, 200);
  assert.equal((await usage(owner)).ai, 20);
  const day = Math.floor(Date.now() / 86400000);
  await env.DB.prepare('UPDATE limits SET count=100 WHERE owner=? AND bucket=?')
    .bind('service:ai:shared', day)
    .run();
  await assert.rejects(consumeService('quota-fresh', 'ai'), { code: 'DAILY_LIMIT' });
  assert.equal(
    (await usage('quota-fresh')).ai,
    0,
    'shared exhaustion must not charge personal allowance',
  );
  await env.DB.prepare('DELETE FROM limits WHERE owner=? AND bucket=?')
    .bind('service:ai:shared', day)
    .run();
});

test('free plan is server-owned and billing is disabled for every account', async () => {
  const response = await call(workspace, 'GET', null, 'free-account');
  assert.deepEqual(response.data.plan, { id: 'free', name: 'Free', billingEnabled: false });
  assert.equal(response.data.dailyLimits.ai, 20);
  assert.ok(response.data.resetAt > Date.now());
  await env.DB.prepare("UPDATE accounts SET plan='pro' WHERE owner=?").bind('free-account').run();
  assert.equal((await call(workspace, 'GET', null, 'free-account')).data.plan.id, 'free');
});

test('import retries create one note and charge one unit, scoped to the signed-in account', async () => {
  const previous = globalThis.fetch;
  env.SUPADATA_API_KEY = 'fixture';
  let calls = 0;
  const input = {
    kind: 'youtube',
    requestId: crypto.randomUUID(),
    title: 'Retry',
    url: 'https://www.youtube.com/live/xOadPtH83Oo',
  };
  try {
    globalThis.fetch = async (_url, init) => {
      calls++;
      assert.equal(init.redirect, 'manual');
      return Response.json({ content: [{ text, offset: 0 }] });
    };
    const first = await call(notes, 'POST', input, 'retry-owner');
    const second = await call(notes, 'POST', input, 'retry-owner');
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.data.note.id, first.data.note.id);
    assert.equal(calls, 1);
    assert.equal((await usage('retry-owner')).youtube, 1);
    assert.equal(
      (await call(notes, 'POST', { ...input, title: 'Changed' }, 'retry-owner')).status,
      409,
    );
    const other = await call(notes, 'POST', input, 'retry-other');
    assert.equal(other.status, 201);
    assert.notEqual(other.data.note.id, first.data.note.id);
  } finally {
    globalThis.fetch = previous;
    delete env.SUPADATA_API_KEY;
  }
});

test('concurrent duplicate imports call the provider once', async () => {
  const previous = globalThis.fetch;
  env.SUPADATA_API_KEY = 'fixture';
  let complete;
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const input = {
    kind: 'youtube',
    requestId: crypto.randomUUID(),
    title: 'Concurrent',
    url: 'https://youtu.be/dQw4w9WgXcQ',
  };
  try {
    globalThis.fetch = async () => {
      started();
      return new Promise((resolve) => {
        complete = resolve;
      });
    };
    const first = call(notes, 'POST', input, 'concurrent-import');
    await ready;
    assert.equal(
      (await call(notes, 'POST', input, 'concurrent-import')).data.code,
      'IMPORT_IN_PROGRESS',
    );
    complete(Response.json({ content: [{ text, offset: 0 }] }));
    assert.equal((await first).status, 201);
    assert.equal((await usage('concurrent-import')).youtube, 1);
  } finally {
    globalThis.fetch = previous;
    delete env.SUPADATA_API_KEY;
  }
});

test('failed provider requests refund personal allowances and allow the same import to retry', async () => {
  const previous = globalThis.fetch;
  env.SUPADATA_API_KEY = 'fixture';
  env.GEMINI_API_KEY = 'fixture';
  env.AI_PROVIDER = 'gemini';
  const input = {
    kind: 'youtube',
    requestId: crypto.randomUUID(),
    title: 'Failure',
    url: 'https://youtu.be/dQw4w9WgXcQ',
  };
  try {
    globalThis.fetch = async () => {
      throw new TypeError('secret provider request details');
    };
    const failed = await call(notes, 'POST', input, 'failed-import');
    assert.equal(failed.status, 502);
    assert.equal(failed.data.code, 'PROVIDER_NETWORK');
    assert.ok(!failed.data.error.includes('secret'));
    assert.equal((await usage('failed-import')).youtube, 0);
    globalThis.fetch = async () => Response.json({ content: [{ text, offset: 0 }] });
    assert.equal((await call(notes, 'POST', input, 'failed-import')).status, 201);
    assert.equal((await usage('failed-import')).youtube, 1);
    const note = await create('failed-ai');
    globalThis.fetch = async () => Response.json({}, { status: 429 });
    const generated = await call(actions, 'POST', { id: note.id, action: 'summary' }, 'failed-ai');
    assert.equal(generated.status, 429);
    assert.equal(generated.headers.get('retry-after'), '60');
    assert.equal((await usage('failed-ai')).ai, 0);
  } finally {
    globalThis.fetch = previous;
    for (const key of ['SUPADATA_API_KEY', 'GEMINI_API_KEY', 'AI_PROVIDER']) delete env[key];
  }
});

test('a failed async transcription refunds once even with concurrent polling', async () => {
  const previous = globalThis.fetch;
  env.SUPADATA_API_KEY = 'fixture';
  try {
    globalThis.fetch = async () => Response.json({ jobId: 'job-refund' }, { status: 202 });
    const result = await call(
      notes,
      'POST',
      { kind: 'youtube', title: 'Async', url: 'https://youtu.be/dQw4w9WgXcQ' },
      'async-refund',
    );
    assert.equal((await usage('async-refund')).youtube, 1);
    globalThis.fetch = async () => Response.json({ status: 'failed' });
    await Promise.all(
      [1, 2].map(() =>
        call(notes, 'PATCH', { id: result.data.note.id, poll: true }, 'async-refund'),
      ),
    );
    assert.equal((await usage('async-refund')).youtube, 0);
    assert.equal(
      (await call(notes, 'GET', null, 'async-refund', '?id=' + result.data.note.id)).data.note
        .status,
      'failed',
    );
  } finally {
    globalThis.fetch = previous;
    delete env.SUPADATA_API_KEY;
  }
});

test('300,000-character Hindi imports, resumable summaries and exports preserve the final section', async () => {
  const owner = 'large-resume';
  const source = 'अ'.repeat(299990) + ' FINALEND.';
  const created = await call(
    notes,
    'POST',
    { kind: 'text', title: 'Long Hindi source', text: source },
    owner,
  );
  assert.equal(created.status, 201);
  const n = created.data.note;
  assert.equal(n.transcript.map((s) => s.text).join(''), source);
  await call(actions, 'POST', { id: n.id, action: 'basic' }, owner);
  // An in-flight pre-update run must keep its original ten chunk boundaries.
  await env.DB.prepare('INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?)').bind(n.id,'__summary_progress',JSON.stringify({runId:crypto.randomUUID(),language:'Hindi',detail:'detailed',parts:[],totalParts:10,lockUntil:0}),Date.now()).run();
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  let calls = 0;
  let seen = '';
  const input = {
    id: n.id,
    action: 'summary',
    detail: 'detailed',
    language: 'Hindi',
    incremental: true,
  };
  const success = async (_url, options) => {
    calls++;
    const content = JSON.parse(options.body).contents[0].parts[0].text;
    seen += content;
    return geminiResult({
      title: 'Complete guide',
      overview: 'Saved part',
      keyPoints: [
        { text: content.includes('FINALEND') ? 'FINALEND' : `Part ${calls}`, segmentIds: [0] },
      ],
      chapters: [],
    });
  };
  try {
    globalThis.fetch = success;
    let step = await call(actions, 'POST', input, owner);
    assert.equal(step.status, 200);
    assert.equal(step.data.completedParts, 1);
    assert.equal(step.data.totalParts, 10);
    assert.equal(step.data.progress.preview.keyPoints[0].text, 'Part 1');
    assert.equal(step.data.progress.preview.coverage.reviewedSegments, 0);
    assert.equal(step.data.progress.completedParts, 1);
    const replay = await call(
      actions,
      'POST',
      { ...input, runId: step.data.runId, completedParts: 0 },
      owner,
    );
    assert.equal(replay.data.completedParts, 1);
    assert.equal(calls, 1);
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    assert.equal(
      (await call(actions, 'POST', { ...input, runId: step.data.runId, completedParts: 1 }, owner))
        .status,
      503,
    );
    assert.equal((await usage(owner)).ai, 1);
    const during = await call(notes, 'GET', null, owner, '?id=' + n.id);
    assert.equal(during.data.note.summary.engine, 'extractive');
    assert.equal(during.data.artifacts.__summary_progress, undefined);
    assert.equal(during.data.summaryProgress.completedParts, 1);
    assert.equal(during.data.summaryProgress.preview.keyPoints[0].text, 'Part 1');
    assert.equal(during.data.summaryProgress.state, 'paused');
    assert.match(during.data.summaryProgress.error, /temporarily unavailable/);
    // Legacy AI errors were saved with a misleading video-transcription message.
    // Reading them corrects the message without changing the saved part or source.
    const legacyRow=await env.DB.prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?').bind(n.id,'__summary_progress').first();
    const legacy={...JSON.parse(legacyRow.content),error:'This video could not be transcribed. Use a public, completed video, or paste its transcript. Live, private or restricted videos may be unavailable.'};
    await env.DB.prepare('UPDATE artifacts SET content=? WHERE note_id=? AND kind=?').bind(JSON.stringify(legacy),n.id,'__summary_progress').run();
    const corrected=await call(notes,'GET',null,owner,'?id='+n.id);
    assert.match(corrected.data.summaryProgress.error,/AI model was unavailable/);
    assert.equal(corrected.data.summaryProgress.completedParts,1);
    assert.equal(corrected.data.summaryProgress.preview.keyPoints[0].text,'Part 1');
    assert.deepEqual(corrected.data.note.transcript,during.data.note.transcript);
    // No run ID simulates reopening the page: generation resumes rather than restarting.
    globalThis.fetch = success;
    step = await call(actions, 'POST', input, owner);
    assert.equal(step.data.completedParts, 2);
    while (!step.data.result) {
      step = await call(
        actions,
        'POST',
        { ...input, runId: step.data.runId, completedParts: step.data.completedParts },
        owner,
      );
      assert.equal(step.status, 200);
    }
    assert.equal(calls, 10);
    assert.match(seen, /FINALEND/);
    assert.equal(step.data.result.coverage.parts, 10);
    assert.equal(step.data.result.keyPoints.at(-1).text, 'FINALEND');
    const finalReplay = await call(
      actions,
      'POST',
      { ...input, runId: step.data.runId, completedParts: 9 },
      owner,
    );
    assert.deepEqual(finalReplay.data.result, step.data.result);
    assert.equal(calls, 10);
    const exported = await call(pdfExport, 'POST', { id: n.id }, owner);
    assert.equal((await call(notes, 'GET', null, owner, '?id=' + n.id)).data.summaryProgress, null);
    assert.equal(exported.status, 200);
    assert.deepEqual(exported.data.note.summary, step.data.result);
    assert.match(exported.data.note.transcript.at(-1).text, /FINALEND/);
    assert.equal(exported.data.artifacts.__summary_progress, undefined);
    assert.equal((await call(actions, 'POST', input, 'stranger')).status, 404);
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('simultaneous summary steps use one provider call and save one part', async () => {
  const owner = 'summary-lease';
  const n = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  let finish, signal;
  const ready = new Promise((resolve) => {
    signal = resolve;
  });
  try {
    globalThis.fetch = async () => {
      signal();
      return new Promise((resolve) => {
        finish = resolve;
      });
    };
    const input = { id: n.id, action: 'summary', incremental: true };
    const first = call(actions, 'POST', input, owner);
    await ready;
    const running = await call(notes, 'GET', null, owner, '?id=' + n.id);
    assert.equal(running.data.summaryProgress.state, 'running');
    assert.equal(running.data.summaryProgress.preview, null);
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'basic' }, owner)).data.code,
      'SUMMARY_IN_PROGRESS',
    );
    assert.equal((await call(actions, 'POST', input, owner)).data.code, 'SUMMARY_IN_PROGRESS');
    finish(
      geminiResult({
        title: 'Saved',
        overview: 'All parts',
        keyPoints: [{ text: 'A goal', segmentIds: [0] }],
        chapters: [],
      }),
    );
    assert.equal((await first).status, 200);
    assert.equal((await usage(owner)).ai, 1);
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('a first-part failure remains visible after reopening and Basic summary clears paused progress', async () => {
  const owner = 'summary-reopen';
  const n = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  try {
    globalThis.fetch = async () => Response.json({}, { status: 503 });
    assert.equal(
      (await call(actions, 'POST', { id: n.id, action: 'summary', incremental: true }, owner))
        .status,
      503,
    );
    const reopened = await call(notes, 'GET', null, owner, '?id=' + n.id);
    assert.equal(reopened.data.summaryProgress.state, 'paused');
    assert.equal(reopened.data.summaryProgress.completedParts, 0);
    assert.equal(reopened.data.summaryProgress.preview, null);
    assert.match(reopened.data.summaryProgress.error, /temporarily unavailable/);
    assert.equal((await call(notes, 'GET', null, 'someone-else', '?id=' + n.id)).status, 404);
    assert.equal((await call(actions, 'POST', { id: n.id, action: 'basic' }, owner)).status, 200);
    const basic = await call(notes, 'GET', null, owner, '?id=' + n.id);
    assert.equal(basic.data.summaryProgress, null);
    assert.equal(basic.data.note.summary.engine, 'extractive');
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('Gemini routing falls back on unavailable models and never retries auth or quota errors', async () => {
  const { geminiGenerate } = await import('../.test-runtime/provider.mjs');
  const previous = globalThis.fetch;
  let calls = [];
  try {
    globalThis.fetch = async (url, init) => {
      calls.push({ url, payload: JSON.parse(init.body) });
      if (calls.length === 1) return new Response(null, { status: 404 });
      return geminiResult({ answer: 'blue', segmentIds: [0] });
    };
    const result = await geminiGenerate(
      'fixture',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      { generationConfig: { responseMimeType: 'application/json' } },
      10000,
    );
    assert.equal(result.model, 'gemini-3.5-flash-lite');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].payload.generationConfig.thinkingConfig.thinkingLevel, 'low');
    assert.equal(calls[1].payload.generationConfig.thinkingConfig, undefined);
    for (const [status, code] of [
      [400, 'PROVIDER_REQUEST'],
      [401, 'PROVIDER_AUTH'],
      [429, 'PROVIDER_LIMIT'],
    ]) {
      calls = [];
      globalThis.fetch = async () => {
        calls.push(1);
        return new Response(null, { status });
      };
      await assert.rejects(
        geminiGenerate('fixture', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', {}, 10000),
        { code },
      );
      assert.equal(calls.length, 1);
    }
  } finally {
    globalThis.fetch = previous;
  }
});

test('source insights persist with valid citations and cannot be read by another owner', async () => {
  const owner = 'source-insights';
  const note = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  const payload = {
    glossary: [{ term: 'Goal', definition: 'The specific aim of a session.', segmentIds: [0] }],
    actions: [],
    caveats: [],
  };
  try {
    globalThis.fetch = async (_url, init) => {
      const config = JSON.parse(init.body).generationConfig;
      assert.equal(config.responseSchema.properties.glossary.type, 'ARRAY');
      assert.ok(config.responseSchema.required.includes('caveats'));
      return geminiResult(payload);
    };
    const result = await call(actions, 'POST', { id: note.id, action: 'insights' }, owner);
    assert.equal(result.status, 200);
    assert.equal(
      (await call(notes, 'GET', null, owner, '?id=' + note.id)).data.artifacts.insights.glossary[0]
        .term,
      'Goal',
    );
    assert.equal((await call(notes, 'GET', null, 'different-owner', '?id=' + note.id)).status, 404);
    globalThis.fetch = async () =>
      geminiResult({ ...payload, glossary: [{ ...payload.glossary[0], segmentIds: [999] }] });
    assert.equal(
      (await call(actions, 'POST', { id: note.id, action: 'insights' }, owner)).data.code,
      'INVALID_CITATION',
    );
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('connection diagnostics require authentication and validate real provider output', async () => {
  const diagnostics = await import('../.test-runtime/diagnostics.mjs');
  assert.equal((await call(diagnostics, 'POST', {}, null)).status, 401);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  try {
    globalThis.fetch = async () => geminiResult({ answer: 'The square is blue.', segmentIds: [0] });
    const result = await call(diagnostics, 'POST', {}, 'diagnostics-owner');
    assert.equal(result.status, 200);
    assert.equal(result.data.ok, true);
    assert.equal(result.data.model, 'gemini:gemini-3.6-flash');
    assert.equal((await usage('diagnostics-owner')).ai, 1);
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});

test('combined export preserves requested order, excludes source bodies and rejects incomplete or foreign notes', async () => {
  const batch = await import('../.test-runtime/export-batch.mjs');
  const owner = 'pdf-collection';
  const selected = [await create(owner), await create(owner), await create(owner)];
  const ids = selected.map((note) => note.id);
  assert.equal((await call(batch, 'POST', { ids }, null)).status, 401);
  assert.equal((await call(batch, 'POST', { ids }, owner)).data.code, 'INCOMPLETE_BATCH');
  for (const id of ids)
    assert.equal((await call(actions, 'POST', { id, action: 'basic' }, owner)).status, 200);
  const exported = await call(batch, 'POST', { ids: [ids[2], ids[0], ids[1]] }, owner);
  assert.equal(exported.status, 200);
  assert.equal(exported.data.notes.length, 3);
  assert.ok(
    exported.data.notes.every(
      (note) => note.summary && note.transcript.every((segment) => segment.text === ''),
    ),
  );
  assert.equal(exported.headers.get('cache-control'), 'no-store');
  await call(notes, 'PATCH', { id: ids[2], title: 'Third PDF' }, owner);
  assert.equal(
    (await call(batch, 'POST', { ids: [ids[2], ids[0]] }, owner)).data.notes[0].title,
    'Third PDF',
  );
  const foreign = await create('another-pdf-owner');
  const rejected = await call(batch, 'POST', { ids: [ids[0], foreign.id] }, owner);
  assert.equal(rejected.status, 404);
  assert.equal(rejected.data.notes, undefined);
  assert.equal((await call(batch, 'POST', { ids: [ids[0], ids[0]] }, owner)).status, 400);
  assert.equal((await call(batch, 'POST', { ids: [] }, owner)).status, 400);
  assert.equal(
    (
      await call(
        batch,
        'POST',
        { ids: Array.from({ length: 11 }, () => crypto.randomUUID()) },
        owner,
      )
    ).status,
    400,
  );
  await env.DB.prepare('INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?)')
    .bind(
      ids[0],
      '__summary_progress',
      JSON.stringify({
        runId: crypto.randomUUID(),
        language: 'English',
        detail: 'balanced',
        parts: [],
        totalParts: 1,
        lockUntil: 0,
      }),
      Date.now(),
    )
    .run();
  assert.equal((await call(batch, 'POST', { ids }, owner)).data.code, 'INCOMPLETE_BATCH');
});

test('Gemini temporary failures retry with backoff, then use the configured fallback on overload', async () => {
  const { geminiGenerate } = await import('../.test-runtime/provider.mjs');
  const previous = globalThis.fetch;
  let now = 0;
  const waits = [];
  const clock = {
    now: () => now,
    random: () => 0,
    wait: async (ms) => {
      waits.push(ms);
      now += ms;
    },
  };
  const urls = [];
  try {
    globalThis.fetch = async (url) => {
      urls.push(url);
      return urls.length < 3
        ? new Response(null, { status: 503 })
        : geminiResult({ answer: 'Recovered' });
    };
    const result = await geminiGenerate(
      'fixture',
      'gemini-3.6-flash',
      'gemini-3.5-flash-lite',
      {},
      10000,
      clock,
    );
    assert.equal(result.model, 'gemini-3.5-flash-lite');
    assert.deepEqual(waits, [1000, 2000]);
    assert.match(urls[0], /3.6-flash/);
    assert.equal(urls[0], urls[1]);
    assert.match(urls[2], /3.5-flash-lite/);
    urls.length = 0;
    waits.length = 0;
    now = 0;
    globalThis.fetch = async (url) => {
      urls.push(url);
      return new Response(null, { status: 503, headers: { 'retry-after': '60' } });
    };
    await assert.rejects(
      geminiGenerate('fixture', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', {}, 10000, clock),
      { code: 'PROVIDER_BUSY' },
    );
    assert.equal(urls.length, 1);
    assert.equal(waits.length, 0, 'do not retry before Retry-After or exceed deadline');
    urls.length = 0;
    waits.length = 0;
    now = 0;
    globalThis.fetch = async (url) => {
      urls.push(url);
      return new Response(null, { status: 500 });
    };
    await assert.rejects(
      geminiGenerate('fixture', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', {}, 10000, clock),
      { code: 'PROVIDER_BUSY' },
    );
    assert.equal(urls.length, 3);
    assert.equal(new Set(urls).size, 1, 'internal errors retry the same model');
    assert.deepEqual(waits, [1000, 2000]);
    urls.length = 0;
    waits.length = 0;
    now = 0;
    globalThis.fetch = async () => {
      urls.push('network');
      throw new TypeError('network');
    };
    await assert.rejects(
      geminiGenerate('fixture', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', {}, 10000, clock),
      { code: 'PROVIDER_NETWORK' },
    );
    assert.equal(urls.length, 1);
    assert.equal(waits.length, 0);
  } finally {
    globalThis.fetch = previous;
  }
});

test('a transient error is recovered within a summary step without repeating already saved parts', async () => {
  const owner = 'summary-transient-recovery';
  const n = await create(owner);
  const previous = globalThis.fetch;
  env.AI_PROVIDER = 'gemini';
  env.GEMINI_API_KEY = 'fixture';
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return new Response(null, { status: 503 });
      return geminiResult({
        title: 'Recovered summary',
        overview: 'The source describes choosing a goal.',
        keyPoints: [{ text: 'Choose a specific goal.', segmentIds: [0] }],
        chapters: [],
      });
    };
    const input = { id: n.id, action: 'summary', incremental: true };
    const response = await call(actions, 'POST', input, owner);
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.deepEqual(response.data.result.models, ['gemini:gemini-3.6-flash']);
    const replay = await call(
      actions,
      'POST',
      { ...input, runId: response.data.runId, completedParts: 0 },
      owner,
    );
    assert.equal(replay.status, 200);
    assert.equal(calls, 2);
    assert.equal((await usage(owner)).ai, 1);
    assert.equal((await call(notes, 'GET', null, owner, '?id=' + n.id)).data.summaryProgress, null);
  } finally {
    globalThis.fetch = previous;
    delete env.AI_PROVIDER;
    delete env.GEMINI_API_KEY;
  }
});


test('oversized new detailed runs fail before spending quota or creating progress',async()=>{
 const owner='summary-preflight';
 const created=await call(notes,'POST',{kind:'text',text:'Study fact '.repeat(20000),title:'Large study source'},owner);
 assert.equal(created.status,201);
 env.AI_PROVIDER='groq';env.GROQ_API_KEY='fixture';const previous=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;throw new Error('No provider call expected');};
 try {
  const result=await call(actions,'POST',{id:created.data.note.id,action:'summary',detail:'detailed',incremental:true},owner);
  assert.equal(result.status,409);assert.equal(result.data.code,'SUMMARY_ALLOWANCE');assert.equal(calls,0);
  assert.equal((await usage(owner)).ai,0);
  const progress=await env.DB.prepare('SELECT content FROM artifacts WHERE note_id=? AND kind=?').bind(created.data.note.id,'__summary_progress').first();
  assert.equal(progress,null);
 } finally {globalThis.fetch=previous;delete env.AI_PROVIDER;delete env.GROQ_API_KEY;}
});
