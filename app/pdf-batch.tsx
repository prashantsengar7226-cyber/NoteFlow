'use client';
import { queuedSummary } from '@/lib/queue-client';
import { useEffect, useRef, useState } from 'react';
import { Download, FileText, LoaderCircle, X } from 'lucide-react';
import { extractPdfText } from '@/lib/pdf-import';
import type { Summary, SummaryProgress } from '@/lib/core';
import type { PdfNote } from '@/lib/pdf';

type Item = {
  key: string;
  name: string;
  file?: File;
  id?: string;
  requestId: string;
  state: 'queued' | 'working' | 'done' | 'error';
  message: string;
};
type Saved = { id: string; title: string; status: string };
class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: payload === undefined ? {} : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
    cache: 'no-store',
  });
  let value;
  try {
    value = await response.json();
  } catch {
    throw new RequestError(
      'The server response was interrupted. Retry unfinished documents; completed work is saved.',
      response.status,
    );
  }
  if (!response.ok)
    throw new RequestError(
      typeof value === 'object' &&
        value !== null &&
        'error' in value &&
        typeof value.error === 'string'
        ? value.error
        : 'Request failed. Please try again.',
      response.status,
    );
  return value as T;
}
const languages = [
  'English',
  'Hindi',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Japanese',
  'Korean',
  'Chinese',
  'Arabic',
  'Source language',
];
export function PdfBatch({
  open,
  initialFiles,
  aiAvailable,
  onClose,
}: {
  open: boolean;
  initialFiles: File[];
  aiAvailable: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const running = useRef(false);
  const pause = useRef(false);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('ai');
  const [language, setLanguage] = useState('English');
  const [detail, setDetail] = useState('balanced');
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [search, setSearch] = useState('');
  const [started, setStarted] = useState(false);
  function choose(files: File[]) {
    if (!files.length) return;
    if (
      files.length > 10 ||
      files.some((file) => !file.name.toLowerCase().endsWith('.pdf')) ||
      files.some((file) => file.size > 20 * 1024 * 1024) ||
      files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024
    ) {
      setMessage('Select 1–10 PDFs, up to 20 MB each and 100 MB in total.');
      return;
    }
    setItems(
      files.map((file) => ({
        key: crypto.randomUUID(),
        name: file.name,
        file,
        requestId: crypto.randomUUID(),
        state: 'queued',
        message: 'Waiting',
      })),
    );
    setSaved(null);
    setStarted(false);
    setMessage('');
  }
  useEffect(() => {
    if (initialFiles.length) choose(initialFiles);
  }, [initialFiles]);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current?.close();
  }, [open]);
  useEffect(() => {
    if (!busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [busy]);
  function update(key: string, patch: Partial<Item>) {
    setItems((previous) =>
      previous.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }
  async function loadSaved() {
    setMessage('');
    try {
      const result = await request<{ notes: Saved[] }>('/api/notes');
      setSaved(result.notes.filter((note) => note.status === 'ready'));
      setItems([]);
      setStarted(false);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }
  async function generate() {
    if (running.current || !items.length) return;
    running.current = true;
    pause.current = false;
    setBusy(true);
    setStarted(true);
    setMessage('');
    try {
      for (const item of items) {
        if (pause.current) break;
        if (item.state === 'done') continue;
        update(item.key, { state: 'working', message: 'Reading document…' });
        try {
          let id = item.id;
          if (!id) {
            if (!item.file) throw new Error('Reselect this PDF to continue.');
            const text = await extractPdfText(item.file);
            const created = await request<{ note: { id: string } }>('/api/notes', {
              requestId: item.requestId,
              kind: 'text',
              text,
              title: item.name.replace(/\.pdf$/i, '').slice(0, 180) || 'PDF document',
              folder: 'PDF summaries',
            });
            id = created.note.id;
            update(item.key, { id, message: 'Source saved. Preparing summary…' });
          }
          const current = await request<{
            note: { summary: Summary | null };
            summaryProgress: SummaryProgress | null;
          }>(`/api/notes?id=${encodeURIComponent(id)}`);
          if (!(current.note.summary && !current.summaryProgress)) {
            if (mode === 'basic' && !current.summaryProgress) {
              await request('/api/actions', { id, action: 'basic' });
            } else {
              const preferences = current.summaryProgress ?? {language,detail};
              const result = await queuedSummary(id, {language:preferences.language,detail:preferences.detail}, job => {
                update(item.key,{message:`Generating and checking: ${job.completedParts} saved parts`});
              },()=>pause.current);
              const complete = !!result;
              if (!complete) {
                update(item.key, { state: 'queued', message: 'Paused. Saved parts will resume.' });
                if (!pause.current)
                  setMessage('A long summary paused. Continue unfinished documents to resume.');
                break;
              }
            }
          }
          update(item.key, { state: 'done', message: 'Summary saved' });
        } catch (error) {
          update(item.key, { state: 'error', message: (error as Error).message });
          if (error instanceof RequestError && [401, 429, 503].includes(error.status)) {
            setMessage(
              (error as Error).message +
                ' Completed summaries are saved. Retry unfinished documents when the service is available.',
            );
            break;
          }
        }
      }
    } finally {
      setBusy(false);
      running.current = false;
    }
  }
  async function download() {
    if (!items.length || items.some((item) => item.state !== 'done' || !item.id)) return;
    setDownloading(true);
    setMessage('');
    try {
      const { notes } = await request<{ notes: PdfNote[] }>('/api/export-batch', {
        ids: items.map((item) => item.id),
      });
      const { createSummaryCollectionPdf } = await import('@/lib/pdf');
      const bytes = await createSummaryCollectionPdf(notes);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'noteflow-combined-summaries.pdf';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage('Combined summary PDF downloaded.');
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  const complete = items.length > 0 && items.every((item) => item.state === 'done');
  const locked = busy || downloading;
  return (
    <dialog
      ref={dialog}
      className="pdf-batch-dialog"
      aria-labelledby="pdf-batch-title"
      onCancel={(event) => {
        if (locked) event.preventDefault();
        else onClose();
      }}
    >
      <div className="modal-header">
        <div>
          <span className="eyebrow">DOCUMENT COLLECTION</span>
          <h2 id="pdf-batch-title">Multiple PDFs. One summary PDF.</h2>
        </div>
        <button
          className="icon-button"
          aria-label="Close PDF collection"
          disabled={locked}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p>
        Upload 2, 3 or more PDFs. Each document gets its own summary, key points and source
        references in one download.
      </p>
      <div className="batch-toolbar">
        <input
          ref={input}
          className="sr-only"
          aria-label="Choose PDFs for combined summary"
          type="file"
          accept=".pdf,application/pdf"
          multiple
          disabled={locked}
          onChange={(event) => {
            choose(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
        <button className="secondary" disabled={locked} onClick={() => input.current?.click()}>
          Choose PDFs
        </button>
        <button className="secondary" disabled={locked} onClick={loadSaved}>
          Use saved notes
        </button>
      </div>
      <small>
        Up to 10 PDFs · 20 MB and 150 pages each · 100 MB total. Selectable text is required;
        scanned PDFs need OCR first.
      </small>
      {saved && (
        <section className="batch-saved">
          <label>
            Find saved notes
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search document titles"
              disabled={locked}
            />
          </label>
          {saved
            .filter((note) => note.title.toLowerCase().includes(search.toLowerCase()))
            .map((note) => (
              <label className="batch-choice" key={note.id}>
                <input
                  type="checkbox"
                  checked={items.some((item) => item.id === note.id)}
                  disabled={
                    locked ||
                    started ||
                    (items.length >= 10 && !items.some((item) => item.id === note.id))
                  }
                  onChange={(event) =>
                    setItems((previous) =>
                      event.target.checked
                        ? [
                            ...previous,
                            {
                              key: note.id,
                              id: note.id,
                              name: note.title,
                              requestId: crypto.randomUUID(),
                              state: 'queued',
                              message: 'Ready to check',
                            },
                          ]
                        : previous.filter((item) => item.id !== note.id),
                    )
                  }
                />
                {note.title}
              </label>
            ))}
          {!saved.length && <p>No saved notes yet. Choose PDFs to begin.</p>}
        </section>
      )}
      <div className="batch-options">
        <label>
          Summary mode
          <select
            value={mode}
            disabled={locked || started}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="ai" disabled={!aiAvailable}>
              AI summary
            </option>
            <option value="basic">Basic summary (no AI call)</option>
          </select>
        </label>
        <label>
          Language
          <select
            value={language}
            disabled={locked || started || mode === 'basic'}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {languages.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Detail
          <select
            value={detail}
            disabled={locked || started || mode === 'basic'}
            onChange={(event) => setDetail(event.target.value)}
          >
            <option value="concise">Concise</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
      </div>
      <p className="field-hint">
        AI allowance is used separately for each document and summary part. Existing completed
        summaries are reused. Basic summaries retain the original language. Keep this tab open while
        processing; after a refresh, choose “Use saved notes” to resume imported documents.
      </p>
      <ol className="batch-queue" aria-live="polite">
        {items.map((item) => (
          <li key={item.key}>
            <FileText size={20} />
            <div>
              <strong>{item.name}</strong>
              <p className={item.state === 'error' ? 'batch-error' : ''}>{item.message}</p>
            </div>
            {item.state === 'working' && <LoaderCircle size={18} className="spin" />}
            {!locked && (
              <button
                className="icon-button"
                aria-label={`Remove ${item.name} from collection`}
                onClick={() =>
                  setItems((previous) => previous.filter((row) => row.key !== item.key))
                }
              >
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {items.length > 0 && (
        <p>
          {items.filter((item) => item.state === 'done').length} of {items.length} summaries
          complete. Removing a document only removes it from this collection; saved notes stay in
          your library.
        </p>
      )}
      {message && (
        <p role="status" className="connection-result">
          {message}
        </p>
      )}
      <div className="batch-toolbar">
        {busy ? (
          <button
            className="secondary"
            onClick={() => {
              pause.current = true;
              setMessage('Pausing after the current request saves…');
            }}
          >
            Pause after this step
          </button>
        ) : (
          <button
            className="primary"
            disabled={locked || !items.length || complete || (mode === 'ai' && !aiAvailable)}
            onClick={generate}
          >
            {started ? 'Retry / continue unfinished' : 'Generate summaries'}
          </button>
        )}
        <button className="primary" disabled={locked || !complete} onClick={download}>
          {downloading ? <LoaderCircle size={16} /> : <Download size={16} />}Download one PDF
        </button>
      </div>
    </dialog>
  );
}
