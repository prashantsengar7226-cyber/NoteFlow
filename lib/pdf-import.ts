import { MAX_TEXT } from './core';
/** Extract one document at a time and always release PDF.js resources. */
export async function extractPdfText(file: File): Promise<string> {
  if (!file.name.toLowerCase().endsWith('.pdf'))
    throw new Error('Choose PDF files for a combined summary.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Each PDF must be under 20 MB.');
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  let text = '';
  try {
    const doc = await task.promise;
    if (doc.numPages > 150)
      throw new Error('Each PDF is limited to 150 pages. Split this document first.');
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const data = await page.getTextContent();
      text += data.items.map((item) => ('str' in item ? item.str : '')).join(' ') + '\n';
      page.cleanup();
      if (text.length > MAX_TEXT)
        throw new Error('This PDF exceeds 300,000 characters. Split it first.');
    }
    if (text.trim().length < 80)
      throw new Error(
        'This PDF has too little readable text. Scanned PDFs need OCR before importing.',
      );
    return text;
  } finally {
    await task.destroy();
  }
}
