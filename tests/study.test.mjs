import test from 'node:test';
import assert from 'node:assert/strict';
import { summaryChunks, summarySourceChunks, sourceTokenEstimate, summaryBoundaryContext, summaryLanguageInstruction, mergeStudyItems, studyCoverage, studyToolContext } from '../.test-runtime/study.mjs';
import { createStudyPdf, createSummaryCollectionPdf } from '../.test-runtime/pdf.mjs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { revisionTopics } from '../.test-runtime/revision-guide.mjs';

test('revision topics preserve every claim and reference, including gaps and nonsequential IDs', () => {
  const segments=[{id:90},{id:4},{id:71},{id:2}];
  const points=[{text:'Before the first topic',segmentIds:[90]}, {text:'First topic fact',segmentIds:[4]}, {text:'Cross-topic fact',segmentIds:[71,2]}, {text:'No valid citation',segmentIds:[123]}];
  const summary={chapters:[{title:'Later',segmentId:2,summary:'Later explanation'}, {title:'Earlier',segmentId:4,summary:'Earlier explanation'}],keyPoints:points};
  const result=revisionTopics(summary,segments);
  assert.deepEqual(result.map(t=>t.title),['More revision points','Earlier','Later']);
  assert.equal(result.flatMap(t=>t.points).length,points.length);
  assert.deepEqual(new Set(result.flatMap(t=>t.points)),new Set(points));
  assert.deepEqual(result[1].points[1].segmentIds,[71,2]);
  assert.deepEqual(summary.keyPoints,points);
  assert.equal(revisionTopics({chapters:[],keyPoints:[]},[]).length,0);
});

test('summary chunking preserves every character and original reference, including oversized segments', () => {
  const segments = [
    { id: 7, start: null, text: 'A'.repeat(18000) },
    { id: 9, start: 42, text: 'The final exception matters.' },
  ];
  const chunks = summaryChunks(segments, 8000);
  assert.equal(chunks.length, 3);
  assert.equal(
    chunks
      .flat()
      .map((s) => s.text)
      .join(''),
    segments.map((s) => s.text).join(''),
  );
  assert.deepEqual([...new Set(chunks.flat().map((s) => s.id))], [7, 9]);
});
test('practice merge removes punctuation/case duplicates and coverage uses real references', () => {
  const existing = [{ front: 'What is focus?', back: 'Attention', segmentIds: [0] }];
  const merged = mergeStudyItems(
    existing,
    [
      { front: 'WHAT is focus!', back: 'Different answer', segmentIds: [0] },
      { front: 'How do you take a break?', back: 'Stand up', segmentIds: [1] },
    ],
    5,
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].back, 'Attention');
  assert.deepEqual(studyCoverage([{ id: 0 }, { id: 1 }, { id: 2 }], merged).missing, [{ id: 2 }]);
});

test('new detailed summaries never enlarge chunks for long sources; legacy runs keep their boundaries',()=>{
  const source=[{id:0,start:0,text:'A'.repeat(299990)+' FINALEND.'}];
  const current=summarySourceChunks(source,'detailed');
  assert.equal(current.length,38);
  assert.ok(current.every(chunk=>chunk.reduce((n,s)=>n+s.text.length,0)<=8000));
  assert.equal(current.flat().map(s=>s.text).join(''),source[0].text);
  assert.equal(summarySourceChunks(source,'detailed',1).length,10);
  assert.equal(summarySourceChunks(source,'balanced').length,22);
  assert.equal(summarySourceChunks(source,'balanced',2).length,19);
});

test('multilingual chunks bound estimated tokens, preserve Unicode and retain legacy boundaries', () => {
  const text = 'हिन्दी तथ्य 2026। '.repeat(1200) + '🧪 अंतिम अपवाद';
  const source = [{ id: 4, start: 10, text }, { id: 5, start: 42, text: 'Closing correction.' }];
  const chunks = summarySourceChunks(source, 'detailed');
  assert.equal(chunks.flat().map(s => s.text).join(''), source.map(s => s.text).join(''));
  assert.ok(chunks.every(chunk => sourceTokenEstimate(chunk.map(s => s.text).join('')) <= 3500));
  assert.ok(chunks.flat().every(s => s.text.isWellFormed()));
  assert.ok(chunks.length > summarySourceChunks(source, 'detailed', 2).length);
  assert.deepEqual([...new Set(chunks.flat().map(s => s.id))], [4, 5]);
});

test('summary language and bounded source context remain stable across mixed-language parts', () => {
  const source = [{ id: 0, start: 0, text: 'यह हिन्दी पाठ है। '.repeat(100) }, { id: 1, start: 1, text: 'Some English names.' }];
  assert.match(summaryLanguageInstruction(source, 'Source language'), /Devanagari/);
  assert.match(summaryLanguageInstruction(source, 'English'), /in English/);
  const context = JSON.parse(summaryBoundaryContext([[source[0]], [source[1]], [{id:2, start:2, text:'Later correction.'}]], 1));
  assert.equal(context.languageSample, source[0].text.slice(0,160));
  assert.equal(context.precedingSource, source[0].text.slice(-1400));
  assert.equal(context.followingSource, 'Later correction.');
});
test('downloaded PDF includes complete notes, cards, source, and a separate answer key', async () => {
  const fonts = {};
  for (const [key, file] of Object.entries({
    regular: 'NotoSans-Regular.ttf',
    bold: 'NotoSans-Bold.ttf',
    hindi: 'NotoSansDevanagari-Regular.ttf',
    arabic: 'NotoSansArabic-Regular.ttf',
    cjk: 'NotoSansCJKjp-Regular.otf',
  }))
    fonts[key] = new Uint8Array(await readFile('public/fonts/' + file)).buffer;
  const bytes = await createStudyPdf(
    {
      title: 'Focused work / केंद्रित अध्ययन',
      source: 'Text',
      video_id: null,
      transcript: [
        {
          id: 0,
          start: null,
          text: 'Choose a specific goal and take a break. '.repeat(7692) + 'FINAL SOURCE POINT',
        },
      ],
      summary: {
        title: 'Focus',
        overview: 'Give one task your attention.',
        keyPoints: [{ text: 'Choose a specific goal.', segmentIds: [0] }],
        chapters: [],
        engine: 'ai',
        language: 'English',
      },
      annotations:
        'My personal reflection. सभी मुख्य विचारों को समझें और महत्वपूर्ण अपवादों को न भूलें।',
    },
    {
      flashcards: {
        cards: [{ front: 'What comes first?', back: 'Choose a specific goal.', segmentIds: [0] }],
      },
      quiz: {
        questions: [
          {
            question: 'What should you choose?',
            options: ['A specific goal', 'No goal', 'More tabs', 'Distractions'],
            correctIndex: 0,
            explanation: 'Clear outcomes guide focused work.',
            segmentIds: [0],
          },
        ],
      },
    },
    'all',
    fonts,
  );
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 5)), '%PDF-');
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const pdf = await loading.promise;
  try {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }
    assert.ok(pages.some((page) => page.includes('My personal reflection.')));
    assert.ok(pages.some((page) => page.includes('What comes first?')));
    const questions = pages.findIndex((page) => page.includes('Practice quiz (1)'));
    const answers = pages.findIndex((page) => page.includes('Quiz answer key'));
    assert.ok(answers > questions);
    assert.ok(!pages[questions].includes('Clear outcomes guide focused work.'));
    assert.ok(pages.some((page) => page.includes('Source transcript')));
    assert.ok(pages.at(-1).includes('FINAL SOURCE POINT'));
  } finally {
    await loading.destroy();
  }
});

test('three document summaries export in order with a contents page and separate document pages', async () => {
  const regular = new Uint8Array(await readFile('public/fonts/NotoSans-Regular.ttf')).buffer;
  const bold = new Uint8Array(await readFile('public/fonts/NotoSans-Bold.ttf')).buffer;
  const fonts = { regular, bold, hindi: regular, arabic: regular, cjk: regular };
  const documents = ['Cell biology', 'Solar energy', 'Project planning'].map((title, index) => ({
    title,
    source: 'PDF',
    video_id: null,
    annotations: 'PRIVATE ANNOTATION SHOULD NOT APPEAR',
    transcript: [{ id: index, text: 'RAW SOURCE SHOULD NOT APPEAR', start: null }],
    summary: {
      title,
      overview: `Overview unique to document ${index + 1}.`,
      keyPoints: [{ text: `Key fact from document ${index + 1}.`, segmentIds: [index] }],
      chapters: [
        {
          title: 'Essential concepts',
          summary: `Chapter for document ${index + 1}.`,
          segmentId: index,
        },
      ],
      engine: 'ai',
      language: 'English',
    },
  }));
  const bytes = await createSummaryCollectionPdf(documents, fonts);
  if (process.env.NF_PDF_QA_PATH) await writeFile(process.env.NF_PDF_QA_PATH, bytes);
  const loading = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false });
  const pdf = await loading.promise;
  try {
    assert.equal(pdf.numPages, 4);
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const content = await (await pdf.getPage(i)).getTextContent();
      pages.push(content.items.map((item) => item.str).join(' '));
    }
    assert.match(pages[0], /Documents in this collection/);
    documents.forEach((document, index) => {
      assert.ok(pages[index + 1].includes(document.title));
      assert.ok(pages[index + 1].includes(`Overview unique to document ${index + 1}.`));
      assert.ok(pages[index + 1].includes(`Section ${index + 1}`));
    });
    assert.ok(!pages.join(' ').includes('SHOULD NOT APPEAR'));
  } finally {
    await loading.destroy();
  }
  await assert.rejects(createSummaryCollectionPdf([], fonts), { code: 'INCOMPLETE_BATCH' });
  await assert.rejects(createSummaryCollectionPdf([{ ...documents[0], summary: null }], fonts), {
    code: 'INCOMPLETE_BATCH',
  });
});

test('long multilingual tool context is bounded, source-exact and includes the end; practice rotates away from cited IDs',()=>{
 const segments=Array.from({length:100},(_,id)=>({id,start:id,text:'अध्ययन तथ्य '.repeat(120)}));
 const selected=studyToolContext(segments);
 assert.ok(sourceTokenEstimate(selected.map(s=>s.text).join(''))<=4500);
 assert.equal(selected.at(-1).id,99);
 assert.ok(selected.every(s=>segments[s.id].text.includes(s.text)));
 const next=studyToolContext(segments,selected.map(s=>({front:'test',segmentIds:[s.id]})));
 assert.ok(next.every(s=>!selected.some(old=>old.id===s.id)));
 const small=[{id:8,start:0,text:'A short source.'}];assert.equal(studyToolContext(small),small);
});
