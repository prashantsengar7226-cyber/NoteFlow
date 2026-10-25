import PDFDocument from 'pdfkit';
import { AppError, timestamp, type Segment, type Summary } from './core';

type Card = { front: string; back: string; segmentIds: number[] };
type Question = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  segmentIds: number[];
};
export type PdfScope = 'all' | 'summary' | 'flashcards' | 'quiz' | 'transcript' | 'slides';
export type PdfNote = {
  title: string;
  source: string;
  video_id: string | null;
  transcript: Segment[];
  summary: Summary | null;
  annotations: string;
};
export type PdfArtifacts = {
  insights?: {
    glossary: { term: string; definition: string; segmentIds: number[] }[];
    actions: { title: string; description: string; segmentIds: number[] }[];
    caveats: { text: string; segmentIds: number[] }[];
  };
  flashcards?: { cards: Card[] };
  quiz?: { questions: Question[] };
  slides?: { slides: { title: string; bullets: string[]; notes: string }[] };
  mindmap?: { title: string; branches: { label: string; details: string[] }[] };
  translation?: { text: string; language: string };
};

export type PdfFonts = Record<'regular' | 'bold' | 'hindi' | 'arabic' | 'cjk', ArrayBuffer>;
async function loadFonts(text: string): Promise<PdfFonts> {
  const files = {
    regular: 'NotoSans-Regular.ttf',
    bold: 'NotoSans-Bold.ttf',
    hindi: /[\u0900-\u097F]/u.test(text)
      ? 'NotoSansDevanagari-Regular.ttf'
      : 'NotoSans-Regular.ttf',
    arabic: /[\u0600-\u06FF]/u.test(text) ? 'NotoSansArabic-Regular.ttf' : 'NotoSans-Regular.ttf',
    cjk: /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u.test(text)
      ? 'NotoSansCJKjp-Regular.otf'
      : 'NotoSans-Regular.ttf',
  };
  const loaded = new Map<string, ArrayBuffer>();
  for (const filename of new Set(Object.values(files))) {
    const response = await fetch('/fonts/' + filename);
    if (!response.ok)
      throw new Error('The PDF font could not be downloaded. Check your connection and try again.');
    loaded.set(filename, await response.arrayBuffer());
  }
  return Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, loaded.get(file)!]),
  ) as PdfFonts;
}
/** Generates a searchable PDF in the visitor's browser, using public font assets. */
export async function createStudyPdf(
  note: PdfNote,
  artifacts: PdfArtifacts,
  scope: PdfScope,
  suppliedFonts?: PdfFonts,
): Promise<Uint8Array> {
  return createPdf([{ note, artifacts }], scope, suppliedFonts);
}
export async function createSummaryCollectionPdf(
  notes: PdfNote[],
  suppliedFonts?: PdfFonts,
): Promise<Uint8Array> {
  if (!notes.length || notes.length > 10 || notes.some((note) => !note.summary))
    throw new AppError(409, 'INCOMPLETE_BATCH', 'Select 1–10 documents with completed summaries.');
  return createPdf(
    notes.map((note) => ({ note: { ...note, annotations: '' }, artifacts: {} })),
    'summary',
    suppliedFonts,
  );
}
async function createPdf(
  entries: { note: PdfNote; artifacts: PdfArtifacts }[],
  scope: PdfScope,
  suppliedFonts?: PdfFonts,
): Promise<Uint8Array> {
  const title = entries.length > 1 ? 'Combined document summaries' : entries[0].note.title;
  const fonts = suppliedFonts ?? (await loadFonts(JSON.stringify(entries)));
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, bottom: 56, left: 48, right: 48 },
      bufferPages: true,
      // PDFKit accepts font bytes here; its older options declaration only lists names.
      font: fonts.regular as unknown as string,
      info: { Title: title, Author: 'Noteflow', Subject: 'Study notes and source references' },
    });
    const buffers: Uint8Array[] = [];
    doc.on('data', (chunk: Uint8Array) => buffers.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => {
      const output = new Uint8Array(buffers.reduce((total, chunk) => total + chunk.length, 0));
      let offset = 0;
      for (const chunk of buffers) {
        output.set(chunk, offset);
        offset += chunk.length;
      }
      resolvePdf(output);
    });
    try {
      for (const [name, data] of Object.entries(fonts)) doc.registerFont(name, data);
      const width = doc.page.width - 96;
      function room(height = 70) {
        if (doc.y + height > doc.page.height - 56) doc.addPage();
      }
      function paragraph(text: string, size = 10, bold = false, color = '#292634') {
        if (!text.trim()) return;
        // Keep script runs intact for fontkit's shaping (including Hindi conjuncts).
        const runs = text
          .replace(/\r\n/g, '\n')
          .match(
            /[\u0900-\u097F\uA8E0-\uA8FF]+[ \t]*|[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]+[ \t]*|[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]+[ \t]*|[^\u0900-\u097F\uA8E0-\uA8FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]+/gu,
          ) ?? [text];
        doc.fillColor(color).fontSize(size);
        runs.forEach((run, index) => {
          const font = /[\u0900-\u097F]/u.test(run)
            ? 'hindi'
            : /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/u.test(run)
              ? 'arabic'
              : /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF\uFF00-\uFFEF]/u.test(run)
                ? 'cjk'
                : bold
                  ? 'bold'
                  : 'regular';
          doc.font(font).text(run, { width, lineGap: 3, continued: index < runs.length - 1 });
        });
        doc.moveDown(0.6);
      }
      function heading(text: string, page = false) {
        if (page) doc.addPage();
        room(90);
        doc.moveDown(0.6);
        paragraph(text, 17, true, '#493568');
      }
      if (entries.length > 1) {
        paragraph('NOTEFLOW / DOCUMENT COLLECTION', 11, true, '#493568');
        paragraph(title, 26, true);
        paragraph(`${entries.length} documents · separate source summaries`, 12);
        heading('Documents in this collection');
        entries.forEach(({ note }, index) => {
          room();
          paragraph(`${index + 1}. ${note.title}`, 12);
        });
        paragraph(
          'Each document begins on a new page. Source section numbers refer only to that document.',
          10,
        );
      }
      for (const [documentIndex, { note, artifacts }] of entries.entries()) {
        if (entries.length > 1) {
          doc.addPage();
          paragraph(`DOCUMENT ${documentIndex + 1} OF ${entries.length}`, 10, true, '#493568');
        }
        function references(ids: number[]) {
          paragraph(
            'Source: ' +
              ids
                .map((id) => {
                  const segment = note.transcript.find((s) => s.id === id);
                  return `Section ${id + 1}${segment?.start != null ? ` (${timestamp(segment.start)})` : ''}`;
                })
                .join(', '),
            8,
            false,
            '#61596B',
          );
        }
        paragraph('Noteflow', 11, true, '#493568');
        paragraph(note.title, 23, true);
        const labels: Record<PdfScope, string> = {
          all: 'Complete study pack',
          summary: 'Summary and key points',
          flashcards: 'Flashcards',
          quiz: 'Practice quiz and answer key',
          transcript: 'Source transcript',
          slides: 'Presentation notes',
        };
        paragraph(`${labels[scope]} | ${note.source}`, 10, false, '#61596B');
        if (note.video_id) paragraph(`https://www.youtube.com/watch?v=${note.video_id}`, 9);
        paragraph(
          'AI-generated material may omit details or contain errors. Check important points against the source references.',
          8,
          false,
          '#61596B',
        );
        const include = (section: PdfScope) => scope === 'all' || scope === section;
        if (include('summary')) {
          if (note.summary) {
            heading('Overview');
            paragraph(note.summary.overview);
            heading('Key points');
            note.summary.keyPoints.forEach((point, index) => {
              room();
              paragraph(`${index + 1}. ${point.text}`);
              references(point.segmentIds);
            });
            if (note.summary.chapters.length) heading('Chapter notes');
            note.summary.chapters.forEach((chapter) => {
              room(90);
              paragraph(chapter.title, 12, true);
              paragraph(chapter.summary);
              references([chapter.segmentId]);
            });
          } else paragraph('No summary has been generated for this note.');
          if (note.annotations.trim()) {
            heading('My notes');
            paragraph(note.annotations);
          }
        }
        const cards = artifacts.flashcards?.cards ?? [];
        if (include('flashcards') && cards.length) {
          heading(`Flashcards (${cards.length})`, scope === 'all');
          cards.forEach((card, index) => {
            room(95);
            paragraph(`${index + 1}. ${card.front}`, 11, true);
            paragraph(card.back);
            references(card.segmentIds);
          });
        }
        const questions = artifacts.quiz?.questions ?? [];
        if (include('quiz') && questions.length) {
          heading(`Practice quiz (${questions.length})`, scope === 'all');
          paragraph(
            'Choose one answer per question. Answers and explanations are in the next section.',
          );
          questions.forEach((question, index) => {
            room(140);
            paragraph(`${index + 1}. ${question.question}`, 11, true);
            question.options.forEach((option, j) =>
              paragraph(`${String.fromCharCode(65 + j)}. ${option}`),
            );
            doc.moveDown(0.5);
          });
          heading('Quiz answer key', true);
          questions.forEach((question, index) => {
            room(90);
            paragraph(
              `${index + 1}. ${String.fromCharCode(65 + question.correctIndex)} - ${question.options[question.correctIndex]}`,
              11,
              true,
            );
            paragraph(question.explanation);
            references(question.segmentIds);
          });
        }
        if (scope === 'all' && artifacts.insights) {
          heading('Source insights', true);
          paragraph('Key terms', 13, true);
          artifacts.insights.glossary.forEach((item) => {
            room(85);
            paragraph(item.term, 11, true);
            paragraph(item.definition);
            references(item.segmentIds);
          });
          paragraph('Practical steps', 13, true);
          artifacts.insights.actions.forEach((item) => {
            room(85);
            paragraph(item.title, 11, true);
            paragraph(item.description);
            references(item.segmentIds);
          });
          paragraph('Qualifications and limitations', 13, true);
          artifacts.insights.caveats.forEach((item) => {
            room(85);
            paragraph(item.text);
            references(item.segmentIds);
          });
        }
        if (scope === 'all' && artifacts.mindmap) {
          heading(artifacts.mindmap.title, true);
          artifacts.mindmap.branches.forEach((branch) => {
            room(90);
            paragraph(branch.label, 12, true);
            branch.details.forEach((detail) => paragraph('- ' + detail));
          });
        }
        if (include('slides') && artifacts.slides) {
          heading('Presentation notes', scope === 'all');
          artifacts.slides.slides.forEach((slide, index) => {
            room(100);
            paragraph(`${index + 1}. ${slide.title}`, 12, true);
            slide.bullets.forEach((bullet) => paragraph('- ' + bullet));
            paragraph(slide.notes);
          });
        }
        if (scope === 'all' && artifacts.translation) {
          heading(`Translation - ${artifacts.translation.language}`, true);
          paragraph(artifacts.translation.text);
        }
        if (include('transcript')) {
          heading('Source transcript', scope === 'all');
          note.transcript.forEach((segment) => {
            room(75);
            paragraph(
              `Section ${segment.id + 1}${segment.start === null ? '' : ' | ' + timestamp(segment.start)}`,
              9,
              true,
              '#493568',
            );
            paragraph(segment.text);
          });
        }
      }
      const pages = doc.bufferedPageRange();
      for (let page = 0; page < pages.count; page++) {
        doc.switchToPage(page);
        const bottom = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;
        doc
          .font('regular')
          .fontSize(8)
          .fillColor('#61596B')
          .text(`Noteflow  |  ${page + 1} / ${pages.count}`, 48, doc.page.height - 32, {
            width,
            align: 'right',
            lineBreak: false,
          });
        doc.page.margins.bottom = bottom;
      }
      doc.end();
    } catch (error) {
      doc.destroy();
      reject(
        error instanceof AppError
          ? error
          : new AppError(
              500,
              'PDF_FAILED',
              'The PDF could not be created. Your saved note is safe; try again.',
            ),
      );
    }
  });
}
