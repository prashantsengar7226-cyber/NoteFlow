'use client';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { api, recoverableImport } from '@/lib/api-client';
import { summarySourceChunks } from '@/lib/study';
import {
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  BookOpen,
  Sparkles,
  CirclePlay,
  FileText,
  Mic,
  Folder,
  Star,
  Settings,
  ChevronDown,
  ChevronRight,
  X,
  Check,
  LoaderCircle,
  Link2,
  Play,
  MessageSquare,
  Network,
  Layers,
  ListChecks,
  Presentation,
  Languages,
  Download,
  Copy,
  Trash2,
  Volume2,
  Square,
  PanelLeftClose,
  Menu,
  AlertCircle,
  Clock,
  ExternalLink,
  MoreHorizontal,
  Upload,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Zap,
  Home,
  ArrowLeft,
  UserRound,
  LayoutGrid,
  List,
  CreditCard,
} from 'lucide-react';
import {
  MAX_TEXT,
  asMarkdown,
  asSrt,
  timestamp,
  sourceNotesReason,
  type Segment,
  type Summary,
  type SummaryProgress,
} from '@/lib/core';
import { PdfBatch } from './pdf-batch';
import { AISettings } from './ai-settings';
import { SummaryQueue } from './summary-queue';
import { queuedSummary } from '@/lib/queue-client';
import { extractPdfText } from '@/lib/pdf-import';
import { StudyControls } from './study-controls';
import { GenerationLoader, SummarySkeleton } from './generation-loader';
import { InstallApp } from './install-app';
import { LibrarySkeleton, MotionControl } from './workspace-motion';
import { AccountPanel } from './account-panel';
import type { PdfNote, PdfArtifacts, PdfScope } from '@/lib/pdf';
type Note = {
  id: string;
  title: string;
  source: string;
  video_id: string | null;
  status: string;
  error: string | null;
  folder: string;
  starred: number;
  created_at: number;
  updated_at: number;
  transcript: Segment[];
  summary: Summary | null;
  annotations: string;
};
type ListNote = Omit<Note, 'transcript' | 'summary' | 'annotations'>;
type Flashcard = { front: string; back: string; segmentIds: number[] };
type Question = {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  segmentIds: number[];
};
type Artifacts = {
  insights?: {
    glossary: { term: string; definition: string; segmentIds: number[] }[];
    actions: { title: string; description: string; segmentIds: number[] }[];
    caveats: { text: string; segmentIds: number[] }[];
  };
  flashcards?: { cards: Flashcard[] };
  quiz?: { questions: Question[] };
  mindmap?: { title: string; branches: { label: string; details: string[] }[] };
  slides?: { slides: { title: string; bullets: string[]; notes: string }[] };
  translation?: { text: string; language: string };
};
type Message = { role: string; answer: string; segmentIds?: number[] };
type Status = {
  ai: boolean;
  provider: 'gemini' | 'groq' | 'openrouter' | 'router';
  providers: ('gemini' | 'groq' | 'openrouter')[];
  audio: boolean;
  youtube: boolean;
  model: string | null;
  fallbackModel: string | null;
  limits: { characters: number; batch: number; uploadMB: number; notes: number };
  dailyLimits: { ai: number | null; youtube: number };
  featureRouting?: boolean;
  weeklyAI?: { used:number; limit:number|null; resetAt:number } | null;
  connection?: {mode:string;enabled:boolean};
  usage: { ai: number; youtube: number };
  plan: { id: string; name: string; billingEnabled: boolean };
  access?: string;
  billing?: {
    enabled: boolean;
    launch: boolean;
    model: string;
    amount: number | null;
    currency: string;
    testMode: boolean;
  };
  resetAt: number;
};
type Tab =
  | 'insights'
  | 'summary'
  | 'transcript'
  | 'notes'
  | 'mindmap'
  | 'flashcards'
  | 'quiz'
  | 'slides'
  | 'translation';
const tools = [
  { id: 'summary', label: 'Summary', icon: FileText },
  { id: 'transcript', label: 'Transcript', icon: ListChecks },
  { id: 'notes', label: 'My notes', icon: Pencil },
  { id: 'insights', label: 'Insights', icon: BookOpen },
  { id: 'mindmap', label: 'Mind map', icon: Network },
  { id: 'flashcards', label: 'Flashcards', icon: Layers },
  { id: 'quiz', label: 'Quiz', icon: ListChecks },
  { id: 'slides', label: 'Slides', icon: Presentation },
  { id: 'translation', label: 'Translate', icon: Languages },
] as const;
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
const sample = `Focused work means giving one meaningful task your full attention without switching to messages, social feeds, or unrelated work. A useful first step is to choose a specific outcome, such as drafting the introduction to a report, rather than an open-ended goal like being productive. Clear outcomes make it easier to tell whether a work session succeeded.
Before starting a focused session, put distracting devices out of reach and close unrelated browser tabs. Keep a piece of paper nearby to capture thoughts that would otherwise cause you to switch tasks. Write the thought down and return to the current task instead of acting on it immediately.
Time blocks help give attention a boundary. A beginner might choose a twenty-five-minute block followed by a short break. The best session length varies by person and task. Treat the first few sessions as experiments and adjust their length based on how well you can stay engaged.
Breaks are most useful when they allow a change of activity. Stand up, drink water, or look away from the screen. Jumping into a fast-moving social feed may make returning to the task more difficult. There is no single break schedule that works for everyone.
At the end of a session, write down what you completed and the next small action. This makes the next session easier to begin. Review your notes weekly and look for recurring distractions. Change one part of your routine at a time so that you can see whether it helps.
Focused work is not a replacement for collaboration. Teams also need deliberate time for questions, shared decisions, and feedback. Agreeing on response expectations can create room for both focused individual work and effective communication. This example is an original practice transcript, not a recording or a research study.`;
function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Spinner() {
  return <LoaderCircle className="spin" size={17} />;
}
function IconBox({ children, tone = 'purple' }: { children: ReactNode; tone?: string }) {
  return <span className={`iconbox ${tone}`}>{children}</span>;
}
function Empty({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export default function Workspace({ name }: { name: string }) {
  const [notes, setNotes] = useState<ListNote[]>([]),
    [status, setStatus] = useState<Status | null>(null),
    [page, setPage] = useState('home'),
    [folderFilter, setFolderFilter] = useState(''),
    [search, setSearch] = useState(''),
    [loading, setLoading] = useState(true),
    [mobile, setMobile] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [quickSource, setQuickSource] = useState('youtube');
  const [quickUrl, setQuickUrl] = useState('');
  const [libraryLayout, setLibraryLayout] = useState<'grid' | 'list'>('grid');
  const [sortOrder, setSortOrder] = useState('recent');
  const [narrowNavigation, setNarrowNavigation] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [diagnostic, setDiagnostic] = useState('');
  const [checkingAI, setCheckingAI] = useState(false);
  const providerNames = { gemini: 'Google Gemini', groq: 'Groq', openrouter: 'OpenRouter and its selected model provider' };
  const aiProviderName = status?.providers?.length
    ? status.providers.map(provider => providerNames[provider]).join(', ')
    : 'the configured AI providers';
  const [note, setNote] = useState<Note | null>(null),
    [artifacts, setArtifacts] = useState<Artifacts>({}),
    [messages, setMessages] = useState<Message[]>([]),
    [tab, setTab] = useState<Tab>('summary'),
    [annotations, setAnnotations] = useState(''),
    [question, setQuestion] = useState(''),
    [busy, setBusy] = useState(''),
    [toast, setToast] = useState(''),
    [error, setError] = useState('');
  const [summaryWork, setSummaryWork] = useState<{
    id: string;
    mode: 'summary' | 'basic';
    completedParts?: number;
    totalParts?: number;
  } | null>(null);
  const summaryPending = !!note && summaryWork?.id === note.id;
  const [queuedNoteIds,setQueuedNoteIds] = useState<string[]>([]);
  const summaryInQueue = !!note && queuedNoteIds.includes(note.id);
  const [summaryProgress, setSummaryProgress] = useState<SummaryProgress | null>(null);
  const sourceFallback = !!note?.summary?.fallback;
  const visibleSummary = sourceFallback ? note?.summary : summaryProgress?.preview ?? note?.summary;
  const partialSummary = !sourceFallback && !!summaryProgress?.preview;
  const [importOpen, setImportOpen] = useState(false),
    [importKind, setImportKind] = useState('youtube'),
    [source, setSource] = useState(''),
    [title, setTitle] = useState(''),
    [upload, setUpload] = useState<File | null>(null),
    [language, setLanguage] = useState('English'),
    [detail, setDetail] = useState('balanced'),
    [importMode, setImportMode] = useState('basic');
  const [exportOpen, setExportOpen] = useState(false),
    [cardIndex, setCardIndex] = useState(0),
    [flipped, setFlipped] = useState(false),
    [answers, setAnswers] = useState<Record<number, number>>({}),
    [transcriptSearch, setTranscriptSearch] = useState(''),
    [activeSegment, setActiveSegment] = useState<number | null>(null),
    [speaking, setSpeaking] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [renameOpen, setRenameOpen] = useState(false),
    [rename, setRename] = useState(''),
    [folderName, setFolderName] = useState('Inbox');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    currentId = useRef<string | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    modalRef = useRef<HTMLDivElement>(null),
    modalTitle = useRef<HTMLInputElement>(null);
  const importRequests = useRef(new Map<string, string>());
  const importRunning = useRef(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 760px)');
    const update = () => {
      setNarrowNavigation(query.matches);
      if (!query.matches) setMobile(false);
    };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page, folderFilter, note?.id]);
  useEffect(() => {
    if (!mobile) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebarRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobile(false);
      if (event.key !== 'Tab') return;
      const buttons = Array.from(
        sidebarRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [],
      );
      if (!buttons.length) return;
      if (event.shiftKey && document.activeElement === buttons[0]) {
        event.preventDefault();
        buttons.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === buttons.at(-1)) {
        event.preventDefault();
        buttons[0].focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKey);
      before?.focus();
    };
  }, [mobile]);
  const pendingImportSummary = useRef<{
    id: string;
    mode: 'basic' | 'summary';
    language: string;
    detail: string;
  } | null>(null);
  function refreshUsage() {
    void api<Status>('/api/workspace')
      .then(setStatus)
      .catch(() => {});
  }
  async function createSource(payload: Record<string, unknown>) {
    const fingerprint = JSON.stringify(payload);
    const requestId = importRequests.current.get(fingerprint) ?? crypto.randomUUID();
    importRequests.current.set(fingerprint, requestId);
    return recoverableImport<Note>({ ...payload, requestId });
  }
  function notice(text: string) {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4000);
  }
  async function refresh() {
    const data = await api<{ notes: ListNote[] }>('/api/notes');
    setNotes(data.notes);
  }
  useEffect(() => {
    Promise.all([api<Status>('/api/workspace'), api<{ notes: ListNote[] }>('/api/notes')])
      .then(([s, n]) => {
        setStatus(s);
        setNotes(n.notes);
        setImportMode(s.ai ? 'ai' : 'basic');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  useEffect(() => {
    if (!importOpen && !deleteOpen && !renameOpen) return;
    const before = document.activeElement as HTMLElement | null;
    const dialog = modalRef.current;
    const first = dialog?.querySelector<HTMLElement>('button,input,textarea,select');
    first?.focus();
    function keys(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) {
        setImportOpen(false);
        setDeleteOpen(false);
        setRenameOpen(false);
      }
      if (e.key === 'Tab') {
        const els = Array.from(
          dialog?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]',
          ) || [],
        );
        if (!els.length) return;
        if (e.shiftKey && document.activeElement === els[0]) {
          e.preventDefault();
          els.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === els.at(-1)) {
          e.preventDefault();
          els[0].focus();
        }
      }
    }
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('keydown', keys);
      before?.focus();
    };
  }, [importOpen, deleteOpen, renameOpen, busy]);
  async function openNote(id: string) {
    setBusy('open');
    setError('');
    currentId.current = id;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    try {
      const data = await api<{
        note: Note;
        artifacts: Artifacts;
        messages: Message[];
        summaryProgress: SummaryProgress | null;
      }>(`/api/notes?id=${encodeURIComponent(id)}`);
      if (currentId.current !== id) return;
      setNote(data.note);
      setSummaryProgress(data.summaryProgress);
      if (data.summaryProgress) {
        setLanguage(data.summaryProgress.language);
        setDetail(data.summaryProgress.detail);
      }
      setAnnotations(data.note.annotations);
      setArtifacts(data.artifacts);
      setMessages(data.messages);
      setPage('note');
      setTab('summary');
      setAnswers({});
      setCardIndex(0);
      setFlipped(false);
      setTranscriptSearch('');
      setMobile(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  useEffect(() => {
    if (!note || note.status !== 'processing') return;
    const id = note.id;
    let inFlight = false;
    let disposed = false;
    const timer = setInterval(async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const data = await api<{ note: Note }>('/api/notes', 'PATCH', { id, poll: true });
        if (!disposed && currentId.current === id) {
          setNote(data.note);
          if (data.note.status !== 'processing') {
            void refresh();
            const planned = pendingImportSummary.current;
            if (data.note.status === 'ready' && planned?.id === id) {
              pendingImportSummary.current = null;
              setSummaryWork({ id, mode: planned.mode });
              setBusy(planned.mode);
              try {
                const generated =
                  planned.mode === 'summary'
                    ? await requestSummary(id, planned)
                    : await api<{ result: Summary }>('/api/actions', 'POST', {
                        id,
                        action: 'basic',
                      });
                if (currentId.current === id)
                  setNote((n) => (n?.id === id ? { ...n, summary: generated.result } : n));
              } catch (error) {
                if (currentId.current === id) setError((error as Error).message);
              } finally {
                setSummaryWork((work) => (work?.id === id ? null : work));
                setBusy('');
                refreshUsage();
              }
            } else
              notice(
                data.note.status === 'ready'
                  ? 'Transcript ready. Choose a summary mode to continue.'
                  : 'Transcription failed. Open the note for details.',
              );
          }
        }
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      } finally {
        inFlight = false;
      }
    }, 10000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [note?.id, note?.status]);
  useEffect(() => {
    if (!note || summaryPending || summaryProgress?.state !== 'running') return;
    const id = note.id;
    let inFlight = false;
    const timer = setInterval(async () => {
      if (document.hidden || inFlight) return;
      inFlight = true;
      try {
        await reloadSummary(id);
      } catch {
        /* A later poll can recover a network failure. */
      } finally {
        inFlight = false;
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [note?.id, summaryPending, summaryProgress?.state]);
  function navigate(next: string, folder = '') {
    if (next === 'settings')
      void api<Status>('/api/workspace')
        .then(setStatus)
        .catch(() => {});
    setPage(next);
    setFolderFilter(folder);
    setMobile(false);
    setSearch('');
    setError('');
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }
  function openImport(kind = 'youtube') {
    importRequests.current.clear();
    setImportKind(kind);
    setSource('');
    setTitle('');
    setUpload(null);
    setError('');
    setImportOpen(true);
    setMobile(false);
  }
  const [studyCount, setStudyCount] = useState(10);
  const [difficulty, setDifficulty] = useState('mixed');
  const [studyFocus, setStudyFocus] = useState('balanced');
  async function reloadSummary(id: string) {
    const data = await api<{ note: Note; summaryProgress: SummaryProgress | null }>(
      `/api/notes?id=${encodeURIComponent(id)}`,
    );
    if (currentId.current === id) {
      setSummaryProgress(data.summaryProgress);
      setNote((n) => (n?.id === id ? { ...n, summary: data.note.summary } : n));
    }
  }
  async function requestSummary(id: string, preferences = { language, detail }) {
    try {
      const result = await queuedSummary(id, preferences, job => {
        setSummaryWork(work => work?.id === id ? {...work, completedParts:job.completedParts,totalParts:job.totalParts} : work);
        void reloadSummary(id).catch(()=>{});
      });
      if (!result) throw new Error('Summary paused. Saved parts remain available.');
      await reloadSummary(id);
      return {result,added:undefined};
    } catch(error) { await reloadSummary(id).catch(()=>{}); throw error; }
  }
  async function checkAI() {
    setCheckingAI(true);
    setDiagnostic('');
    try {
      const result = await api<{ model: string; latencyMs: number }>(
        '/api/diagnostics',
        'POST',
        {},
      );
      setDiagnostic(
        `Connected · ${result.model} · ${(result.latencyMs / 1000).toFixed(1)}s. Short test passed; long sources take longer.`,
      );
    } catch (error) {
      setDiagnostic((error as Error).message);
    } finally {
      setCheckingAI(false);
      refreshUsage();
    }
  }
  async function generate(action: string, resume = false) {
    if (!note || busy) return;
    const id = note.id;
    setBusy(action);
    setError('');
    if (action === 'summary' || action === 'basic') setSummaryWork({ id, mode: action });
    try {
      const data =
        action === 'summary'
          ? await requestSummary(
              id,
              resume && summaryProgress
                ? {
                    language: summaryProgress.language,
                    detail: summaryProgress.detail,
                  }
                : { language, detail },
            )
          : await api<{ result: unknown; added?: number }>('/api/actions', 'POST', {
              id,
              action,
              language,
              detail,
              count: studyCount,
              difficulty,
              focus: studyFocus,
              ...(action === 'chat' ? { question } : {}),
            });
      if (currentId.current !== id) return;
      if (action === 'summary' || action === 'basic') {
        if (!(data.result as Summary).fallback) setSummaryProgress(null);
        setNote((n) => (n ? { ...n, summary: data.result as Summary } : n));
        notice((data.result as Summary).fallback ? 'Source notes ready · AI enhancement is separate' : 'Summary saved');
      } else if (action === 'chat') {
        setMessages((m) => [
          ...m,
          { role: 'user', answer: question },
          { ...(data.result as Omit<Message, 'role'>), role: 'assistant' },
        ]);
        setQuestion('');
      } else {
        setArtifacts((a) => ({ ...a, [action]: data.result }));
        if (action === 'flashcards') {
          setCardIndex(artifacts.flashcards?.cards.length ?? 0);
          setFlipped(false);
        }
        // Appending questions preserves answers to the previous questions.
        notice(
          data.added === undefined
            ? 'Saved to this note'
            : `${data.added} new ${action === 'quiz' ? 'questions' : 'cards'} added`,
        );
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (action === 'summary' || action === 'basic')
        setSummaryWork((work) => (work?.id === id ? null : work));
      setBusy('');
      refreshUsage();
    }
  }
  async function save(patch: Record<string, unknown>) {
    if (!note) return;
    const id = note.id;
    setBusy('save');
    try {
      const data = await api<{ note: Note }>('/api/notes', 'PATCH', { id, ...patch });
      if (currentId.current === id) setNote(data.note);
      await refresh();
      notice('Changes saved');
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy('');
    }
  }
  async function readFile(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (importKind === 'document' && files.length > 1) {
      if (files.length > 10 || files.some((file) => !file.name.toLowerCase().endsWith('.pdf'))) {
        setError('Select up to 10 PDFs for a combined summary, or one other document.');
        e.target.value = '';
        return;
      }
      setBatchFiles(files);
      setImportOpen(false);
      setBatchOpen(true);
      e.target.value = '';
      return;
    }
    const file = files[0];
    if (!file) return;
    // A rejected replacement must never leave the previous file's text importable.
    setSource('');
    setUpload(file);
    setTitle(file.name.replace(/\.[^.]+$/, ''));
    setError('');
    if (importKind === 'audio') return;
    if (!/\.(pdf|txt|md|srt|vtt)$/i.test(file.name)) {
      setError('Choose a PDF, text, Markdown, SRT or VTT file.');
      setUpload(null);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('Choose a file under 20 MB.');
      setUpload(null);
      return;
    }
    setBusy('file');
    try {
      let text = '';
      if (file.name.toLowerCase().endsWith('.pdf')) {
        text = await extractPdfText(file);
      } else {
        text = await file.text();
      }
      if (text.length > MAX_TEXT) throw new Error('This file exceeds 300,000 characters.');
      setSource(text);
    } catch (e) {
      setError((e as Error).message);
      setSource('');
      setUpload(null);
    } finally {
      setBusy('');
    }
  }
  async function importSource(example = false) {
    if (busy || importRunning.current) return;
    importRunning.current = true;
    setBusy('import');
    setError('');
    let created: Note[] = [];
    try {
      if (importKind === 'audio' && !example) {
        if (!upload) throw new Error('Choose an audio or video file first.');
        const form = new FormData();
        form.append('file', upload);
        const r = await fetch('/api/transcribe', { method: 'POST', body: form });
        const data = (await r.json()) as { note: Note; error?: string };
        if (!r.ok) throw new Error(data.error);
        created = [data.note];
      } else if (importKind === 'youtube' && !example) {
        const urls = source
          .split(/\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (!urls.length) throw new Error('Paste a YouTube video link.');
        if (urls.length > 5) throw new Error('Import up to five video links at a time.');
        for (let i = 0; i < urls.length; i++) {
          const data = await createSource({
            kind: 'youtube',
            url: urls[i],
            title: title.trim()
              ? urls.length > 1
                ? `${title} · ${i + 1}`
                : title
              : `YouTube video · ${new Date().toLocaleDateString()}`,
            folder: 'Inbox',
          });
          created.push(data.note);
        }
      } else {
        const data = await createSource({
          kind: 'text',
          text: example ? sample : source,
          title: example ? 'Sample · The science of focused work' : title.trim() || 'Untitled note',
          folder: example ? 'Examples' : 'Inbox',
        });
        created = [data.note];
      }
      const first = created[0];
      const summaryMode = example || importMode === 'basic' ? 'basic' : 'summary';
      pendingImportSummary.current =
        first.status === 'processing'
          ? { id: first.id, mode: summaryMode, language, detail }
          : null;
      setSummaryProgress(null);
      if (first.status === 'ready') {
        setSummaryWork({ id: first.id, mode: summaryMode });
        setBusy(summaryMode);
      }
      currentId.current = first.id;
      setNote(first);
      setAnnotations('');
      setArtifacts({});
      setMessages([]);
      setAnswers({});
      setCardIndex(0);
      setFlipped(false);
      setTab('summary');
      setPage('note');
      setImportOpen(false);
      void refresh().catch(() => {});
      if (first.status === 'ready') {
        try {
          const { result } =
            summaryMode === 'summary'
              ? await requestSummary(first.id)
              : await api<{ result: Summary }>('/api/actions', 'POST', {
                  id: first.id,
                  action: summaryMode,
                  language,
                  detail,
                });
          if (currentId.current === first.id) setNote({ ...first, summary: result });
        } catch (e) {
          if (currentId.current === first.id)
            setError(`Your source was saved. ${(e as Error).message}`);
        } finally {
          setSummaryWork((work) => (work?.id === first.id ? null : work));
        }
      }
      notice(
        created.length > 1
          ? `${created.length} videos imported. Open each note to summarize.`
          : 'Source saved to your library',
      );
    } catch (e) {
      if (created.length && importKind === 'youtube') {
        // Retrying a partial batch should only submit the remaining links.
        setSource(
          source
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(created.length)
            .join('\n'),
        );
      }
      setError(
        `${created.length ? `${created.length} source(s) saved before the error. ` : ''}${(e as Error).message}`,
      );
      await refresh().catch(() => {});
    } finally {
      importRunning.current = false;
      setBusy('');
      refreshUsage();
    }
  }
  function jump(id: number) {
    const s = note?.transcript.find((s) => s.id === id);
    setActiveSegment(id);
    setTab('transcript');
    setTimeout(
      () =>
        document
          .getElementById(`segment-${id}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      80,
    );
    if (s?.start !== null && s?.start !== undefined && note?.video_id) {
      const frame = document.getElementById('video-player') as HTMLIFrameElement | null;
      if (frame)
        frame.src = `https://www.youtube-nocookie.com/embed/${note.video_id}?start=${Math.floor(s.start)}&autoplay=1`;
    }
  }
  function citations(ids?: number[]) {
    return ids?.map((id) => (
      <button
        className="citation"
        key={id}
        onClick={() => jump(id)}
        title={`View source segment ${id + 1}`}
      >
        {timestamp(note?.transcript.find((s) => s.id === id)?.start ?? null) === 'Text'
          ? `§${id + 1}`
          : timestamp(note?.transcript.find((s) => s.id === id)?.start ?? null)}
      </button>
    ));
  }
  function exportNote(format: string) {
    if (!note) return;
    const name = note.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'note';
    if (format === 'md')
      download(name + '.md', asMarkdown(note.title, note.summary, annotations), 'text/markdown');
    if (format === 'txt')
      download(
        name + '-transcript.txt',
        note.transcript
          .map((s) => `${s.start !== null ? timestamp(s.start) + ' ' : ''}${s.text}`)
          .join('\n'),
      );
    if (format === 'srt') download(name + '.srt', asSrt(note.transcript));
    if (format === 'json')
      download(
        name + '.json',
        JSON.stringify({ note, artifacts, messages }, null, 2),
        'application/json',
      );
    if (format === 'pdf') void exportPdf('all');
    setExportOpen(false);
  }
  async function exportPdf(scope: string) {
    if (!note || busy) return;
    const id = note.id;
    setBusy('pdf');
    setError('');
    setExportOpen(false);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, scope, annotations }),
      });
      if (!response.ok) {
        const failure = (await response.json()) as { error?: string };
        throw new Error(failure.error || 'PDF export failed. Please try again.');
      }
      const payload = (await response.json()) as {
        note: PdfNote;
        artifacts: PdfArtifacts;
        scope: PdfScope;
      };
      const { createStudyPdf } = await import('@/lib/pdf');
      const bytes = await createStudyPdf(payload.note, payload.artifacts, payload.scope);
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download =
        (note.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 80) || 'note') + `-${scope}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (currentId.current === id) notice('PDF downloaded');
    } catch (error) {
      if (currentId.current === id) setError((error as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function copy() {
    if (!note) return;
    try {
      await navigator.clipboard.writeText(asMarkdown(note.title, note.summary, annotations));
      notice('Copied to clipboard');
    } catch {
      setError('Clipboard access is unavailable. Download the note instead.');
    }
  }
  function listen() {
    if (!visibleSummary) return;
    if (!('speechSynthesis' in window)) {
      setError('Read aloud is not supported in this browser.');
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(
      visibleSummary.overview + ' ' + visibleSummary.keyPoints.map((p) => p.text).join('. '),
    );
    const codes: Record<string, string> = {
      English: 'en-US',
      Hindi: 'hi-IN',
      Spanish: 'es-ES',
      French: 'fr-FR',
      German: 'de-DE',
      Portuguese: 'pt-BR',
      Japanese: 'ja-JP',
      Korean: 'ko-KR',
      Chinese: 'zh-CN',
      Arabic: 'ar-SA',
    };
    speech.lang = codes[visibleSummary.language] || navigator.language;
    speech.onend = () => setSpeaking(false);
    speech.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(speech);
    setSpeaking(true);
  }
  const folders = [...new Set(notes.map((n) => n.folder))].sort();
  const filtered = notes.filter(
    (n) =>
      (page !== 'starred' || n.starred) &&
      (page !== 'folder' || n.folder === folderFilter) &&
      (n.title + ' ' + n.folder).toLowerCase().includes(search.toLowerCase()),
  );
  filtered.sort((a, b) =>
    sortOrder === 'title'
      ? a.title.localeCompare(b.title)
      : sortOrder === 'oldest'
        ? a.updated_at - b.updated_at
        : b.updated_at - a.updated_at,
  );
  const cards = artifacts.flashcards?.cards || [];
  const quiz = artifacts.quiz?.questions || [];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace-main">
        Skip to workspace
      </a>
      {mobile && (
        <button
          className="sidebar-scrim"
          onClick={() => setMobile(false)}
          aria-label="Close navigation"
        />
      )}
      <aside
        id="workspace-navigation"
        ref={sidebarRef}
        inert={narrowNavigation && !mobile}
        className={`sidebar ${mobile ? 'mobile-open' : ''}`}
      >
        <button className="brand" onClick={() => navigate('home')}>
          <span className="brand-mark">
            n<span>↗</span>
          </span>
          <span>
            noteflow<span className="brand-dot">.</span>
          </span>
        </button>
        <div className="workspace-chip">
          <span className="avatar-sm">{name === 'there' ? 'P' : name.charAt(0).toUpperCase()}</span>
          <div>
            Personal workspace<small>A space for your next idea</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <button className="primary new-note" onClick={() => openImport()}>
          <Plus size={18} /> New note <kbd>＋</kbd>
        </button>
        <nav aria-label="Main navigation">
          <span className="nav-label">WORKSPACE</span>
          <button className={page === 'home' ? 'active' : ''} onClick={() => navigate('home')}>
            <Home size={18} />
            Overview
          </button>
          <button
            className={page === 'library' ? 'active' : ''}
            onClick={() => navigate('library')}
          >
            <BookOpen size={18} />
            My library<span className="nav-count">{notes.length}</span>
          </button>
          <button
            className={page === 'starred' ? 'active' : ''}
            onClick={() => navigate('starred')}
          >
            <Star size={18} />
            Favorites
          </button>
          <button className={page === 'plans' ? 'active' : ''} onClick={() => navigate('plans')}>
            <CreditCard size={18} />
            Plans & access<span className="nav-plan-tag">{status?.plan.name || 'Free'}</span>
          </button>
          <div className="nav-label folder-label">
            COLLECTIONS <Folder size={14} />
          </div>
          {folders.map((f) => (
            <button
              key={f}
              onClick={() => navigate('folder', f)}
              className={page === 'folder' && folderFilter === f ? 'active' : ''}
            >
              <Folder size={17} />
              <span className="truncate">{f}</span>
              <span className="nav-count">{notes.filter((n) => n.folder === f).length}</span>
            </button>
          ))}
          {!folders.length && <p className="nav-hint">Your collections will appear here.</p>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-plan-card">
            <div>
              <span className="sidebar-plan-icon">
                <Sparkles size={16} />
              </span>
              <strong>{status?.plan.name || 'Free'} plan</strong>
              <span className="sidebar-plan-status">
                {status?.billing?.launch === false ? 'ACTIVE' : 'LAUNCH'}
              </span>
            </div>
            <p>
              {status?.billing?.launch === false
                ? 'Your account. Your learning tools.'
                : 'All available tools, included.'}
            </p>
            <div className="sidebar-usage-label">
              <span>{status?.featureRouting ? 'Summaries & insights this week' : 'AI operations today'}</span>
              <strong>
                {status?.connection?.mode === 'personal' ? 'Personal key' : status?.featureRouting ? (status.weeklyAI?.limit === null ? 'Admin · no user cap' : `${status.weeklyAI?.used ?? 0} / 20`) : `${status?.usage.ai ?? 0} / ${status?.dailyLimits.ai ?? 20}`}
              </strong>
            </div>
            <progress
              max={Math.max(1, status?.featureRouting ? 20 : status?.dailyLimits.ai ?? 20)}
              value={status?.featureRouting ? status.weeklyAI?.used ?? 0 : status?.usage.ai ?? 0}
              aria-label={status?.featureRouting ? 'Weekly summaries and insights allowance used' : 'Daily AI allowance used'}
            />
            <button onClick={() => navigate('plans')}>
              View plan & usage <ArrowUpRight size={14} />
            </button>
          </div>
          <button
            className={`settings-nav ${page === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings size={17} />
            Settings
          </button>
          <button
            className={`profile profile-button ${page === 'account' ? 'active' : ''}`}
            onClick={() => navigate('account')}
            aria-label="Your account"
          >
            <span className="profile-avatar">
              {name === 'there' ? 'P' : name.charAt(0).toUpperCase()}
            </span>
            <div>
              {name === 'there' ? 'My workspace' : name}
              <small>
                <span className="green-dot" />
                {status?.plan.name || 'Free'} plan
              </small>
            </div>
            <ChevronRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="workspace-navigation"
            >
              <Menu size={20} />
            </button>
            <BookOpen size={16} />
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>
              {page === 'home'
                ? 'Overview'
                : page === 'note'
                  ? 'My library'
                  : page === 'account'
                    ? 'Account'
                    : page === 'plans'
                      ? 'Plans & access'
                      : page === 'settings'
                        ? 'Settings'
                        : page === 'folder'
                          ? folderFilter
                          : page === 'starred'
                            ? 'Favorites'
                            : 'My library'}
            </strong>
          </div>
          <div className="topbar-right">
            <MotionControl />
            <form action="/auth/signout" method="POST"><button className="text-button" type="submit">
              Sign out
            </button></form>
            <span className="private-badge">
              <ShieldCheck size={14} />
              Only you
            </span>
            <button
              className="icon-button"
              onClick={() => navigate('settings')}
              aria-label="Settings"
            >
              <Settings size={18} />
            </button>
            <span className="profile-avatar small">
              {name === 'there' ? 'P' : name.charAt(0).toUpperCase()}
            </span>
          </div>
        </header>
        {error && !(page === 'note' && tab === 'summary' && !importOpen) && (
          <div className="error-banner" role="alert">
            <AlertCircle size={18} />
            <span>{error}</span>
            {error.includes('Sign in with your account') && (
              <a href="/login" target="_top">
                Sign in
              </a>
            )}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={16} />
            </button>
          </div>
        )}
        <SummaryQueue onUpdated={jobs => { setQueuedNoteIds(jobs.map(job=>job.noteId)); if(currentId.current) void reloadSummary(currentId.current).catch(()=>{}); }} />
        {page === 'plans' || page === 'account' ? (
          <AccountPanel view={page} onUpdated={refreshUsage} />
        ) : page === 'settings' ? (
          <main
            id="workspace-main"
            tabIndex={-1}
            className="content settings-content page-enter"
            key="settings"
          >
            <div className="product-heading">
              <div>
                <span className="eyebrow">WORKSPACE SETTINGS</span>
                <h1>Make Noteflow work for you.</h1>
                <p className="lead">Connections, installation, and how your data is handled.</p>
              </div>
              <button className="secondary" onClick={() => navigate('account')}>
                <UserRound size={16} />
                Your account
              </button>
            </div>
            <InstallApp />
            <section className="settings-plan-link">
              <div>
                <strong>{status?.plan.name || 'Free'} plan</strong>
                <p>
                  {status?.billing?.launch === false
                    ? 'Review your account access and daily allowances.'
                    : 'All available tools are included during the free launch. Daily allowances apply.'}
                </p>
              </div>
              <button className="secondary" onClick={() => navigate('plans')}>
                Plans & usage <ArrowRight size={15} />
              </button>
            </section>
            <div className="settings-grid">
              <div className="settings-card">
                <IconBox>
                  <Sparkles size={24} />
                </IconBox>
                <div>
                  <h3>AI generation · {aiProviderName}</h3>
                  <p>Summaries, questions, study tools, and translations.</p>
                </div>
                <span className={`status-pill ${status?.ai ? 'connected' : 'pending'}`}>
                  {status?.ai ? 'Key configured' : 'Setup needed'}
                </span>
                {status?.ai ? (
                  <small>
                    Default: {status.model}.{' '}
                    {status.fallbackModel
                      ? `Fallback if unavailable: ${status.fallbackModel}. `
                      : ''}
                    {status.provider === 'gemini'
                      ? 'Free-tier limits apply when your Google project is on the Free tier.'
                      : 'A key is saved; generation depends on provider availability and quota.'}
                  </small>
                ) : (
                  <div className="setup-note">
                    AI generation needs to be enabled by the site owner. You can use Basic summary
                    now. API keys stay on the server.
                  </div>
                )}
                <button
                  className="secondary"
                  disabled={!status?.ai || checkingAI || !!busy}
                  onClick={checkAI}
                >
                  {checkingAI ? <Spinner /> : <Zap size={16} />}Test AI connection
                </button>
                <small>
                  Uses one daily AI call. Tests a short answer and its source reference.
                </small>
                {diagnostic && (
                  <p role="status" className="connection-result">
                    {diagnostic}
                  </p>
                )}
                {status?.provider === 'gemini' && (
                  <small>
                    AI is provided by the site owner. Free-tier content may be used to improve
                    Google’s products. When the shared quota runs out, use Basic summary or wait for
                    a reset.
                  </small>
                )}
                <small>
                  YouTube imports use Supadata. Audio/video file uploads are not enabled on this
                  public site; paste a transcript or import subtitles instead.
                </small>
              </div>
              <div className="settings-card">
                <IconBox tone="red">
                  <CirclePlay size={24} />
                </IconBox>
                <div>
                  <h3>YouTube transcription</h3>
                  <p>Fetch captions or request transcription for publicly accessible videos.</p>
                </div>
                <span className={`status-pill ${status?.youtube ? 'connected' : 'pending'}`}>
                  {status?.youtube ? 'Key configured' : 'Setup needed'}
                </span>
                {!status?.youtube && (
                  <div className="setup-note">
                    YouTube import needs to be enabled by the site owner. Text, PDF and subtitle
                    imports are available now.
                  </div>
                )}
              </div>
            </div>
            <AISettings onUpdated={refreshUsage} featureRouting={status?.featureRouting} />
            <section className="settings-panel">
              <h2>Included in your workspace</h2>
              <div className="included-grid">
                {[
                  'Private note library',
                  'Basic extractive summaries',
                  'Text, PDF & subtitle import',
                  'Markdown, text & JSON export',
                  'Notes and collections',
                  'Browser read-aloud',
                ].map((t) => (
                  <div key={t}>
                    <Check size={17} />
                    {t}
                  </div>
                ))}
              </div>
              <p>
                Your notes belong to your signed-in account. NoteFlow AI uses shared provider quotas. Personal AI uses your selected provider account; YouTube imports still use the site allowance.
              </p>
            </section>
            <section className="settings-panel">
              <h2>{status?.featureRouting ? 'Your usage allowances' : 'Your daily allowance'}</h2>
              <p>
                {status?.connection?.mode === 'personal' ? 'Personal AI: no NoteFlow daily cap' : status?.featureRouting ? `${status.weeklyAI?.used ?? 0} summary and insight operations reserved or completed this week${status.weeklyAI?.limit === null ? ' · admin: no user cap' : ' out of 20'}` : `${status?.usage.ai ?? 0} of ${status?.dailyLimits.ai ?? 20} NoteFlow AI operations used`} ·{' '}
                {status?.usage.youtube ?? 0} of {status?.dailyLimits.youtube ?? 3} YouTube imports
                used.
              </p>
              {status?.featureRouting ? <p>Small AI tools have no daily operation cap; provider limits and short-term throttles apply. A full summary counts once, including its automatic retries. Weekly allowance resets Monday at 00:00 IST. YouTube imports reset daily. Basic source notes and PDF utilities do not use AI allowance.</p> : <p>
                {status?.resetAt
                  ? `Next reset: ${new Date(status.resetAt).toLocaleString()}. `
                  : 'Resets at midnight UTC. '}
                Each summary part uses an operation and a separate source review. Regenerating a rejected part uses another operation. Provider requests may be billable even when unsuccessful. Shared service limits may be reached sooner. Basic summaries,
                studying saved material and PDF downloads use no AI allowance.
              </p>}
            </section>
            <section className="settings-panel">
              <h2>Current processing limits</h2>
              <div className="limit-grid">
                <div>
                  <strong>300,000</strong>
                  <span>characters per source</span>
                </div>
                <div>
                  <strong>5</strong>
                  <span>videos per batch</span>
                </div>
                <div>
                  <strong>20 MB</strong>
                  <span>per upload</span>
                </div>
                <div>
                  <strong>1,000</strong>
                  <span>notes per workspace</span>
                </div>
              </div>
              <p>
                PDFs must contain selectable text. YouTube playlists, channel subscriptions, voice
                cloning and image/video generation are not
                implemented in this version. Read-aloud uses your browser’s available voices.
              </p>
            </section>
            <section className="settings-panel">
              <h2>Your data</h2>
              <p>
                Notes are saved to your private workspace. Generating AI content sends the source to{' '}
                {aiProviderName}. Importing a YouTube link sends the link to Supadata. Audio/video
                file transcription is currently disabled. Original uploaded files are not retained.
                Delete a note to remove its transcript, generated content, and saved chat from this
                workspace.
              </p>
            </section>
          </main>
        ) : page === 'note' && note ? (
          <main id="workspace-main" tabIndex={-1} className="note-content page-enter" key={note.id}>
            <div className="note-heading">
              <button className="back-link" onClick={() => navigate('library')}>
                <ArrowLeft size={16} />
                My library
              </button>
              <div className="note-actions">
                <button
                  className={`icon-button ${note.starred ? 'is-starred' : ''}`}
                  disabled={!!busy}
                  onClick={() => save({ starred: !note.starred })}
                  aria-label={note.starred ? 'Remove from favorites' : 'Add to favorites'}
                >
                  <Star size={18} fill={note.starred ? 'currentColor' : 'none'} />
                </button>
                <button
                  className="icon-button"
                  onClick={() => {
                    setRename(note.title);
                    setFolderName(note.folder);
                    setRenameOpen(true);
                  }}
                  aria-label="Edit title and collection"
                >
                  <Pencil size={17} />
                </button>
                <button className="icon-button" onClick={copy} aria-label="Copy summary">
                  <Copy size={17} />
                </button>
                <div className="export-wrap">
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => setExportOpen(!exportOpen)}
                  >
                    <Download size={15} />
                    Export
                    <ChevronDown size={13} />
                  </button>
                  {exportOpen && (
                    <div className="dropdown">
                      {[
                        ['md', 'Markdown summary'],
                        ['txt', 'Transcript (.txt)'],
                        ...(note.transcript.some((s) => s.start !== null)
                          ? [['srt', 'Subtitles (.srt)']]
                          : []),
                        ['json', 'Full note (.json)'],
                        ['pdf', 'Complete study pack (.pdf)'],
                      ].map(([f, label]) => (
                        <button key={f} onClick={() => exportNote(f)}>
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  className="icon-button danger"
                  onClick={() => setDeleteOpen(true)}
                  aria-label="Delete note"
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <div className="note-title-row">
              <span className="source-tag">
                {note.source === 'YouTube' ? <CirclePlay size={15} /> : <FileText size={15} />}{' '}
                {note.source}
              </span>
              <span className="dot-separator">·</span>
              <span>{note.folder}</span>
              <span className="dot-separator">·</span>
              <span>
                {new Date(note.created_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
            <h1 className="note-title">{note.title}</h1>
            {note.status === 'processing' ? (
              <GenerationLoader key={note.id} mode="transcript" />
            ) : note.status === 'failed' ? (
              <Empty
                icon={<AlertCircle />}
                title="The source could not be processed"
                text={note.error || 'Try importing this video again.'}
              />
            ) : (
              <div className="note-grid">
                <aside className="study-source" aria-label="Source material">
                  <div className="study-source-heading"><h2>Your source</h2><span>{note.source}</span></div>
                  {note.video_id ? (
                    <div className="video-wrap">
                      <iframe
                        id="video-player"
                        title={note.title}
                        src={`https://www.youtube-nocookie.com/embed/${note.video_id}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                      />
                    </div>
                  ) : <p className="source-preview">{note.transcript.slice(0, 3).map(segment => segment.text).join(' ').slice(0, 340)}{note.transcript.reduce((n, segment) => n + segment.text.length, 0) > 340 ? '…' : ''}</p>}
                  <div className="source-facts"><span>{note.transcript.length.toLocaleString()} source sections</span><button onClick={() => setTab('transcript')}>Read transcript <ArrowUpRight size={14}/></button></div>
                  {note.video_id && <p className="source-scope">Notes use the transcript. Visuals and on-screen text are not analyzed.</p>}
                </aside>
                <section className="note-main">
                  <div
                    className="note-tabs"
                    role="tablist"
                    aria-label="Note tools"
                    onKeyDown={(event) => {
                      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                      event.preventDefault();
                      const index = tools.findIndex((tool) => tool.id === tab);
                      const next =
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tools.length - 1
                            : (index + (event.key === 'ArrowRight' ? 1 : -1) + tools.length) %
                              tools.length;
                      setTab(tools[next].id as Tab);
                      setError('');
                      event.currentTarget
                        .querySelector<HTMLButtonElement>(`#note-tab-${tools[next].id}`)
                        ?.focus();
                    }}
                  >
                    {tools.map((t) => (
                      <button
                        key={t.id}
                        role="tab"
                        id={`note-tab-${t.id}`}
                        aria-controls="note-tool-panel"
                        tabIndex={tab === t.id ? 0 : -1}
                        aria-selected={tab === t.id}
                        onClick={() => {
                          setTab(t.id);
                          setError('');
                        }}
                        className={tab === t.id ? 'active' : ''}
                      >
                        <t.icon size={15} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div
                    id="note-tool-panel"
                    className="note-panel panel-enter"
                    role="tabpanel"
                    aria-labelledby={`note-tab-${tab}`}
                    tabIndex={0}
                    key={tab}
                  >
                    {tab === 'summary' && (
                      <>
                        {summaryPending && summaryWork && (
                          <GenerationLoader
                            key={`${summaryWork.id}-${summaryWork.mode}`}
                            mode={summaryWork.mode}
                            completedParts={summaryWork.completedParts}
                            totalParts={summaryWork.totalParts}
                            compact={!!visibleSummary}
                          />
                        )}
                        {sourceFallback && (
                          <section className="summary-progress" aria-label="Source notes ready">
                            <div role="status">
                              <h2>Source notes are ready</h2>
                              <p>{sourceNotesReason(note.summary!.fallback!.reason)} These excerpts use the original transcript and require no AI quota. They keep the source language. AI enhancement can continue separately.</p>
                            </div>
                            <button className="secondary" onClick={() => setTab('transcript')}><FileText size={15} /> Read full transcript</button>
                          </section>
                        )}
                        {summaryProgress && (
                          <section className="summary-progress" aria-label="Summary progress">
                            <div role="status" aria-live="polite">
                              <h2>
                                {sourceFallback ? summaryInQueue ? 'AI enhancement is queued' : 'AI enhancement is paused' : summaryInQueue ? 'Your summary is queued for automatic recovery' : summaryPending || summaryProgress.state === 'running'
                                  ? 'Your summary is in progress'
                                  : 'Your summary is paused'}
                              </h2>
                              <p>
                                {summaryProgress.completedParts} of {summaryProgress.totalParts}{' '}
                                parts saved.
                                {sourceFallback ? ' Checked AI parts are saved. Your source notes are shown below.' : partialSummary
                                  ? ' The partial summary is shown below. Remaining sections have not been summarized yet.'
                                  : ' Your source is saved. Continue to create the summary.'}
                              </p>
                            </div>
                            {!summaryPending && !summaryInQueue && summaryProgress.state !== 'running' && (
                              <button
                                className="primary"
                                disabled={!!busy}
                                onClick={() => generate('summary', true)}
                              >
                                <RefreshCw size={15} /> Resume summary
                              </button>
                            )}
                          </section>
                        )}
                        {!summaryPending && !summaryInQueue && (error || (!sourceFallback && summaryProgress?.error)) && (
                          <div className="summary-error" role="alert">
                            <AlertCircle size={18} />
                            <p>{error || summaryProgress?.error}</p>
                          </div>
                        )}
                        {visibleSummary ? (
                          <>
                            <div className="section-top">
                              <h2 className="summary-heading">Overview</h2>
                              <div className="summary-tools">
                                <span className="mode-badge">
                                  {visibleSummary.engine === 'ai'
                                    ? partialSummary
                                      ? 'Partial AI summary'
                                      : 'AI summary'
                                    : sourceFallback ? 'Source notes · no AI' : 'Basic · source excerpts'}
                                </span>
                                <button
                                  className="icon-button"
                                  onClick={listen}
                                  aria-label={speaking ? 'Stop reading' : 'Read summary aloud'}
                                >
                                  {speaking ? <Square size={15} /> : <Volume2 size={17} />}
                                </button>
                              </div>
                            </div>
                            <div className="overview-box">
                              <Sparkles size={21} />
                              <p>{visibleSummary.overview}</p>
                            </div>
                            {note.summary?.sourceChecks && <p className="source-check-note">Source review: {note.summary.sourceChecks.checkedParts} of {note.summary.sourceChecks.totalParts} parts checked. Checks compare notes with the transcript; they do not independently verify facts or analyze video visuals.</p>}
                              <h2>{sourceFallback ? 'Selected source excerpts' : 'Key takeaways'}</h2>
                            <ol className="takeaways">
                              {visibleSummary.keyPoints.map((p, i) => (
                                <li key={i}>
                                  <span className="takeaway-number">
                                    {String(i + 1).padStart(2, '0')}
                                  </span>
                                  <div>
                                    <p>{p.text}</p>
                                    <div className="citations">{citations(p.segmentIds)}</div>
                                  </div>
                                </li>
                              ))}
                            </ol>
                            {!!visibleSummary.chapters.length && (
                              <>
                                <h2>Chapter by chapter</h2>
                                <div className="chapters">
                                  {visibleSummary.chapters.map((c, i) => (
                                    <div key={i}>
                                      <div className="chapter-heading">
                                        {citations([c.segmentId])}
                                        <h3>{c.title}</h3>
                                      </div>
                                      <p>{c.summary}</p>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                            <p className="source-disclaimer">
                              {visibleSummary.engine === 'ai'
                                ? 'AI can make mistakes. Use the source links to check important details.'
                                : 'Basic mode selects sentences from your source. It does not create an AI-written summary.'}
                            </p>
                            {!!visibleSummary.models?.length && (
                              <p className="study-coverage">
                                Models used in recorded parts: {visibleSummary.models.join(', ')}.
                                Older saved parts may not have model records.
                              </p>
                            )}
                            {visibleSummary.coverage && (
                              <p className="study-coverage">
                                Processed {visibleSummary.coverage.reviewedSegments} of{' '}
                                {visibleSummary.coverage.totalSegments} source sections in{' '}
                                {visibleSummary.coverage.parts}{' '}
                                {visibleSummary.coverage.parts === 1 ? 'part' : 'parts'}.{' '}
                                {visibleSummary.coverage.citedSegments !== undefined && `${visibleSummary.coverage.citedSegments} sections referenced in the notes. `}
                                Processing every section does not guarantee every fact is included. Check important details against the transcript.
                              </p>
                            )}
                            <button
                              className="secondary"
                              disabled={!!busy || partialSummary}
                              onClick={() => exportPdf('summary')}
                            >
                              <Download size={15} />
                              {partialSummary
                                ? 'PDF available when the summary is complete'
                                : 'Download summary PDF'}
                            </button>
                          </>
                        ) : summaryPending ? (
                          <SummarySkeleton />
                        ) : summaryProgress ? null : (
                          <Empty
                            icon={<Sparkles size={27} />}
                            title="Make the main ideas stand out"
                            text="Generate a structured summary, or use basic mode to select key sentences directly from your source."
                          />
                        )}
                        <p className="generation-estimate">{status?.featureRouting ? 'One weekly operation for this complete summary, including retries' : `${summaryProgress && summaryProgress.language === language && summaryProgress.detail === detail ? summaryProgress.totalParts - summaryProgress.completedParts : summarySourceChunks(note.transcript, detail).length} AI operations for this summary`} · {status?.connection?.mode === 'personal' ? 'no NoteFlow cap; provider limits apply' : status?.featureRouting ? (status.weeklyAI?.limit === null ? 'admin: no user cap' : `${Math.max(0,20-(status.weeklyAI?.used ?? 0))} available this week`) : `${Math.max(0, (status?.dailyLimits.ai ?? 20) - (status?.usage.ai ?? 0))} available today` }. Detailed keeps smaller sections for more thorough notes.</p>
                        <div className="generation-bar">
                          <div className="select-group">
                            <label>
                              Language
                              <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                              >
                                {languages.map((l) => (
                                  <option key={l}>{l}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Detail
                              <select value={detail} onChange={(e) => setDetail(e.target.value)}>
                                <option value="concise">Concise</option>
                                <option value="balanced">Balanced</option>
                                <option value="detailed">Detailed study guide</option>
                              </select>
                            </label>
                          </div>
                          <div className="generation-buttons">
                            <button
                              className="secondary"
                              disabled={!!busy}
                              onClick={() => generate('basic')}
                            >
                              {busy === 'basic' ? <Spinner /> : <FileText size={15} />}
                              {busy === 'basic' ? 'Finding key ideas…' : 'Basic summary'}
                            </button>
                            <button
                              className="primary"
                              disabled={!!busy}
                              onClick={() => generate('summary')}
                            >
                              {busy === 'summary' ? <Spinner /> : <Sparkles size={15} />}{' '}
                              {summaryPending && summaryWork?.mode === 'summary'
                                ? 'Creating your summary…'
                                : summaryProgress &&
                                    summaryProgress.language === language &&
                                    summaryProgress.detail === detail
                                  ? 'Resume summary'
                                  : visibleSummary
                                    ? sourceFallback ? 'Enhance with AI' : 'Regenerate with AI'
                                    : 'Generate with AI'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                    {tab === 'transcript' && (
                      <>
                        <div className="section-top">
                          <h2>Source transcript</h2>
                          <button className="secondary" onClick={() => exportNote('txt')}>
                            <Download size={14} />
                            Download
                          </button>
                        </div>
                        <label className="search-field">
                          <Search size={16} />
                          <input
                            value={transcriptSearch}
                            onChange={(e) => setTranscriptSearch(e.target.value)}
                            placeholder="Search in transcript…"
                            aria-label="Search transcript"
                          />
                        </label>
                        <div className="transcript-list">
                          {note.transcript
                            .filter((s) =>
                              s.text.toLowerCase().includes(transcriptSearch.toLowerCase()),
                            )
                            .map((s) => (
                              <div
                                id={`segment-${s.id}`}
                                className={`segment ${activeSegment === s.id ? 'highlight' : ''}`}
                                key={s.id}
                              >
                                <button onClick={() => jump(s.id)}>
                                  {s.start !== null ? timestamp(s.start) : `§${s.id + 1}`}
                                </button>
                                <p>{s.text}</p>
                              </div>
                            ))}
                          {!note.transcript.some((s) =>
                            s.text.toLowerCase().includes(transcriptSearch.toLowerCase()),
                          ) && <p className="muted">No matching transcript segments.</p>}
                        </div>
                      </>
                    )}
                    {tab === 'notes' && (
                      <>
                        <div className="section-top">
                          <div>
                            <h2>Your own thinking</h2>
                            <p className="muted">
                              Add connections, questions, and ideas worth keeping.
                            </p>
                          </div>
                          <button
                            className="primary"
                            disabled={!!busy || annotations === note.annotations}
                            onClick={() => save({ annotations })}
                          >
                            {busy === 'save' ? <Spinner /> : <Check size={16} />}Save notes
                          </button>
                        </div>
                        <textarea
                          className="annotation-editor"
                          value={annotations}
                          onChange={(e) => setAnnotations(e.target.value)}
                          maxLength={30000}
                          placeholder="What stood out to you?"
                          aria-label="Personal notes"
                        />
                        <p className="muted">
                          {annotations !== note.annotations
                            ? 'Unsaved changes — save before opening another note.'
                            : 'All changes saved.'}
                        </p>
                      </>
                    )}
                    {tab === 'insights' && (
                      <>
                        <div className="section-top">
                          <div>
                            <h2>Understand it. Put it into practice.</h2>
                            <p className="muted">
                              Definitions, practical steps and qualifications grounded in this
                              source.
                            </p>
                          </div>
                          <button
                            className="secondary"
                            disabled={!!busy}
                            onClick={() => generate('insights')}
                          >
                            {busy === 'insights' ? <Spinner /> : <Sparkles size={16} />}
                            {artifacts.insights ? 'Regenerate' : 'Create insights'}
                          </button>
                        </div>
                        {artifacts.insights ? (
                          <div className="insights-grid">
                            <section>
                              <h3>Key terms</h3>
                              {artifacts.insights.glossary.map((item, index) => (
                                <article className="insight-card" key={index}>
                                  <h4>{item.term}</h4>
                                  <p>{item.definition}</p>
                                  {citations(item.segmentIds)}
                                </article>
                              ))}
                            </section>
                            <section>
                              <h3>Practical steps</h3>
                              {artifacts.insights.actions.length ? (
                                artifacts.insights.actions.map((item, index) => (
                                  <article className="insight-card" key={index}>
                                    <h4>
                                      {index + 1}. {item.title}
                                    </h4>
                                    <p>{item.description}</p>
                                    {citations(item.segmentIds)}
                                  </article>
                                ))
                              ) : (
                                <p>No practical steps are stated in this source.</p>
                              )}
                              <h3>Qualifications & limitations</h3>
                              {artifacts.insights.caveats.length ? (
                                artifacts.insights.caveats.map((item, index) => (
                                  <article className="insight-card" key={index}>
                                    <p>{item.text}</p>
                                    {citations(item.segmentIds)}
                                  </article>
                                ))
                              ) : (
                                <p>
                                  No explicit qualifications were found. This does not mean the
                                  source has no limitations.
                                </p>
                              )}
                            </section>
                          </div>
                        ) : (
                          <Empty
                            icon={<BookOpen size={30} />}
                            title="Go beyond the summary"
                            text="Build a cited glossary, extract practical steps, and keep track of the source’s qualifications. These also appear in your full study-pack PDF."
                          />
                        )}
                      </>
                    )}
                    {tab === 'mindmap' &&
                      (artifacts.mindmap ? (
                        <>
                          <div className="section-top">
                            <h2>See how it connects</h2>
                            <button
                              className="icon-button"
                              disabled={!!busy}
                              onClick={() => generate('mindmap')}
                              aria-label="Regenerate mind map"
                            >
                              <RefreshCw size={16} />
                            </button>
                          </div>
                          <div className="mindmap">
                            <div className="map-root">
                              <Network size={19} />
                              {artifacts.mindmap.title}
                            </div>
                            <div className="map-branches">
                              {artifacts.mindmap.branches.map((b, i) => (
                                <div className="map-branch" key={i}>
                                  <h3>{b.label}</h3>
                                  <ul>
                                    {b.details.map((d, j) => (
                                      <li key={j}>{d}</li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <Empty
                          icon={<Network size={30} />}
                          title="Connect the dots"
                          text="Turn your source into a visual outline of its main ideas and supporting details."
                        >
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => generate('mindmap')}
                          >
                            {busy === 'mindmap' ? <Spinner /> : <Sparkles size={16} />}Create mind
                            map
                          </button>
                        </Empty>
                      ))}
                    {(tab === 'flashcards' || tab === 'quiz') && (
                      <StudyControls
                        kind={tab}
                        items={tab === 'quiz' ? quiz : cards}
                        segments={note.transcript}
                        count={studyCount}
                        difficulty={difficulty}
                        focus={studyFocus}
                        busy={busy}
                        onCount={setStudyCount}
                        onDifficulty={setDifficulty}
                        onFocus={setStudyFocus}
                        onGenerate={() => generate(tab)}
                        onPdf={() => exportPdf(tab)}
                        onJump={jump}
                      />
                    )}
                    {tab === 'flashcards' &&
                      (cards.length ? (
                        <>
                          <div className="section-top">
                            <h2>Make it stick</h2>
                            <span className="muted">
                              {cardIndex + 1} of {cards.length}
                            </span>
                          </div>
                          <button
                            className={`flashcard ${flipped ? 'flipped' : ''}`}
                            onClick={() => setFlipped(!flipped)}
                          >
                            <span className="eyebrow">
                              {flipped ? 'THE ANSWER' : 'QUICK RECALL'}
                            </span>
                            <h3>{flipped ? cards[cardIndex]?.back : cards[cardIndex]?.front}</h3>
                            <span className="flip-label">
                              Click to {flipped ? 'see question' : 'reveal answer'}{' '}
                              <RefreshCw size={13} />
                            </span>
                          </button>
                          <div className="flashcard-controls">
                            <button
                              className="secondary"
                              disabled={cardIndex === 0}
                              onClick={() => {
                                setCardIndex(cardIndex - 1);
                                setFlipped(false);
                              }}
                            >
                              <ArrowLeft size={15} />
                              Previous
                            </button>
                            <div>{citations(cards[cardIndex]?.segmentIds)}</div>
                            <button
                              className="secondary"
                              disabled={cardIndex === cards.length - 1}
                              onClick={() => {
                                setCardIndex(cardIndex + 1);
                                setFlipped(false);
                              }}
                            >
                              Next
                              <ArrowRight size={15} />
                            </button>
                          </div>
                          <button
                            className="text-button"
                            onClick={() =>
                              download(
                                'flashcards.tsv',
                                cards
                                  .map((c) =>
                                    [c.front, c.back]
                                      .map((s) => s.replace(/[\t\r\n]/g, ' '))
                                      .join('\t'),
                                  )
                                  .join('\n'),
                              )
                            }
                          >
                            <Download size={15} />
                            Export cards for Anki
                          </button>
                        </>
                      ) : (
                        <Empty
                          icon={<Layers size={30} />}
                          title="Remember more of what you learn"
                          text="Generate source-grounded flashcards and test your recall, one idea at a time."
                        >
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => generate('flashcards')}
                          >
                            {busy === 'flashcards' ? <Spinner /> : <Sparkles size={16} />}Create
                            flashcards
                          </button>
                        </Empty>
                      ))}
                    {tab === 'quiz' &&
                      (quiz.length ? (
                        <>
                          <div className="section-top">
                            <h2>Put your knowledge to work</h2>
                            <span className="status-pill connected">
                              {Object.keys(answers).length}/{quiz.length} answered
                            </span>
                          </div>
                          {quiz.map((q, i) => (
                            <section className="quiz-question" key={i}>
                              <span className="eyebrow">QUESTION {i + 1}</span>
                              <h3>{q.question}</h3>
                              <div className="quiz-options">
                                {q.options.map((o, j) => (
                                  <button
                                    key={j}
                                    disabled={answers[i] !== undefined}
                                    className={
                                      answers[i] !== undefined
                                        ? j === q.correctIndex
                                          ? 'correct'
                                          : j === answers[i]
                                            ? 'incorrect'
                                            : ''
                                        : ''
                                    }
                                    onClick={() => setAnswers({ ...answers, [i]: j })}
                                  >
                                    <span>{String.fromCharCode(65 + j)}</span>
                                    {o}
                                    {answers[i] !== undefined && j === q.correctIndex && (
                                      <Check size={16} />
                                    )}
                                  </button>
                                ))}
                              </div>
                              {answers[i] !== undefined && (
                                <div className="quiz-explanation">
                                  <p>{q.explanation}</p>
                                  {citations(q.segmentIds)}
                                </div>
                              )}
                            </section>
                          ))}
                          {Object.keys(answers).length === quiz.length && (
                            <div className="quiz-score">
                              <strong>
                                {quiz.filter((q, i) => answers[i] === q.correctIndex).length}/
                                {quiz.length}
                              </strong>
                              <p>Keep building those connections.</p>
                              {quiz.some((q, i) => answers[i] !== q.correctIndex) && (
                                <button
                                  className="secondary"
                                  onClick={() =>
                                    setAnswers(
                                      Object.fromEntries(
                                        Object.entries(answers).filter(
                                          ([index, answer]) =>
                                            quiz[Number(index)].correctIndex === answer,
                                        ),
                                      ),
                                    )
                                  }
                                >
                                  Retry missed questions
                                </button>
                              )}
                              <button className="secondary" onClick={() => setAnswers({})}>
                                <RefreshCw size={15} />
                                Try again
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <Empty
                          icon={<ListChecks size={30} />}
                          title="A little practice goes a long way"
                          text="Create a short quiz with explanations and links back to your source."
                        >
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => generate('quiz')}
                          >
                            {busy === 'quiz' ? <Spinner /> : <Sparkles size={16} />}Create a quiz
                          </button>
                        </Empty>
                      ))}
                    {tab === 'slides' &&
                      (artifacts.slides ? (
                        <>
                          <div className="section-top">
                            <h2>Ready to share an idea</h2>
                            <button
                              className="secondary"
                              disabled={!!busy}
                              onClick={() => exportPdf('slides')}
                            >
                              <Download size={15} />
                              Download slides PDF
                            </button>
                          </div>
                          <div className="slides">
                            {artifacts.slides.slides.map((s, i) => (
                              <article className="slide" key={i}>
                                <span className="eyebrow">
                                  NOTEFLOW / {String(i + 1).padStart(2, '0')}
                                </span>
                                <h2>{s.title}</h2>
                                <ul>
                                  {s.bullets.map((b, j) => (
                                    <li key={j}>{b}</li>
                                  ))}
                                </ul>
                                <details>
                                  <summary>Speaker notes</summary>
                                  <p>{s.notes}</p>
                                </details>
                              </article>
                            ))}
                          </div>
                          <button
                            className="text-button"
                            onClick={() =>
                              download(
                                'slides.md',
                                artifacts
                                  .slides!.slides.map(
                                    (s) =>
                                      `# ${s.title}\n\n${s.bullets.map((b) => '- ' + b).join('\n')}\n\nNotes: ${s.notes}`,
                                  )
                                  .join('\n\n---\n\n'),
                                'text/markdown',
                              )
                            }
                          >
                            <Download size={15} />
                            Export slide content
                          </button>
                        </>
                      ) : (
                        <Empty
                          icon={<Presentation size={30} />}
                          title="From learning to presenting"
                          text="Generate a slide outline with key points and speaker notes. Print it or export the content."
                        >
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => generate('slides')}
                          >
                            {busy === 'slides' ? <Spinner /> : <Sparkles size={16} />}Create slides
                          </button>
                        </Empty>
                      ))}
                    {tab === 'translation' && (
                      <>
                        <div className="section-top">
                          <h2>Ideas without language barriers</h2>
                        </div>
                        <div className="translation-controls">
                          <label>
                            Translate into
                            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                              {languages
                                .filter((l) => l !== 'Source language')
                                .map((l) => (
                                  <option key={l}>{l}</option>
                                ))}
                            </select>
                          </label>
                          <button
                            className="primary"
                            disabled={!!busy}
                            onClick={() => generate('translation')}
                          >
                            {busy === 'translation' ? <Spinner /> : <Languages size={16} />}
                            Translate
                          </button>
                        </div>
                        {artifacts.translation ? (
                          <>
                            <span className="mode-badge">{artifacts.translation.language}</span>
                            <div className="translation-text">{artifacts.translation.text}</div>
                            <button
                              className="text-button"
                              onClick={() =>
                                download('translation.txt', artifacts.translation!.text)
                              }
                            >
                              <Download size={15} />
                              Download translation
                            </button>
                          </>
                        ) : (
                          <p className="muted">
                            Translate up to 16,000 characters of source text. Source references are
                            preserved in the result.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </section>
                <aside className="chat-panel">
                  <div className="chat-heading">
                    <IconBox>
                      <Sparkles size={17} />
                    </IconBox>
                    <div>
                      <h3>Ask your source</h3>
                      <span>Answers grounded in this note</span>
                    </div>
                    <span className={`connection-dot ${status?.ai ? 'online' : ''}`} />
                  </div>
                  <div className="chat-messages">
                    {!messages.length ? (
                      <div className="chat-welcome">
                        <div className="chat-orb">
                          <MessageSquare size={28} />
                          <span>✦</span>
                        </div>
                        <h3>Go a little deeper.</h3>
                        <p>
                          Ask a question. Find a connection.
                          <br />
                          Make the idea your own.
                        </p>
                        {[
                          'What are the main ideas?',
                          'How can I apply this?',
                          'Explain the most important concept.',
                        ].map((q) => (
                          <button key={q} onClick={() => setQuestion(q)}>
                            {q}
                            <ArrowUpRight size={14} />
                          </button>
                        ))}
                      </div>
                    ) : (
                      messages.map((m, i) => (
                        <div key={i} className={`chat-message ${m.role}`}>
                          <span className="chat-role">
                            {m.role === 'user' ? 'YOU' : 'NOTEFLOW'}
                          </span>
                          <p>{m.answer}</p>
                          {m.role === 'assistant' && <div>{citations(m.segmentIds)}</div>}
                        </div>
                      ))
                    )}
                    {busy === 'chat' && (
                      <div className="chat-thinking">
                        <Spinner />
                        Reading your source…
                      </div>
                    )}
                  </div>
                  <form
                    className="chat-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void generate('chat');
                    }}
                  >
                    <textarea
                      aria-label="Ask a question about this source"
                      placeholder="Ask anything about this source…"
                      value={question}
                      maxLength={2000}
                      onChange={(e) => setQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (question.trim() && !busy) void generate('chat');
                        }
                      }}
                    />
                    <div>
                      <span>
                        {status?.ai ? 'AI · source-linked answers' : 'AI connection needed'}
                      </span>
                      <button
                        className="send-button"
                        disabled={!!busy || !question.trim()}
                        aria-label="Send question"
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </form>
                  <p className="chat-footnote">Answers use excerpts from this note.</p>
                </aside>
              </div>
            )}
          </main>
        ) : (
          <main
            id="workspace-main"
            tabIndex={-1}
            className={`content page-enter ${page === 'home' ? 'study-home' : ''}`}
            key={page + folderFilter}
          >
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  {page === 'home' ? 'YOUR WORKSPACE' : 'YOUR PERSONAL KNOWLEDGE SPACE'}
                </div>
                <h1>
                  {page === 'home'
                    ? name === 'there'
                      ? 'What would you like to learn?'
                      : `Welcome back, ${name}.`
                    : page === 'starred'
                      ? 'Favorites'
                      : page === 'folder'
                        ? folderFilter
                        : 'Your library'}
                </h1>
                <p className="lead">
                  {page === 'home'
                    ? 'Start with a video, document or text. Turn it into notes you can study.'
                    : 'Find a thought. Pick up where you left off.'}
                </p>
              </div>
              <div className="date-chip">
                <span className="date-day">{new Date().getDate()}</span>
                <span>
                  {new Date().toLocaleDateString(undefined, { month: 'short' })}
                  <small>{new Date().toLocaleDateString(undefined, { weekday: 'long' })}</small>
                </span>
              </div>
            </div>
            {page === 'home' && (
              <>
                <div className="workspace-stats">
                  <div>
                    <span>
                      <BookOpen size={15} />
                      Saved notes
                    </span>
                    <strong>{notes.length}</strong>
                    <small>In your private workspace</small>
                  </div>
                  <div>
                    <span>
                      <Folder size={15} />
                      Collections
                    </span>
                    <strong>{folders.length}</strong>
                    <small>Organized your way</small>
                  </div>
                  <div>
                    <span>
                      <Star size={15} />
                      Favorites
                    </span>
                    <strong>{notes.filter((n) => n.starred).length}</strong>
                    <small>Your essential references</small>
                  </div>
                  <div>
                    <span>
                      <Sparkles size={15} />
                      AI allowance
                    </span>
                    <strong>
                      {status?.connection?.mode === 'personal' ? 'Personal key' : status?.featureRouting ? (status.weeklyAI?.limit === null ? 'Admin' : Math.max(0,20-(status.weeklyAI?.used ?? 0))) : Math.max(0, (status?.dailyLimits.ai ?? 20) - (status?.usage.ai ?? 0))}
                      {status?.connection?.mode !== 'personal' && status?.weeklyAI?.limit !== null && <small> / {status?.featureRouting ? 20 : status?.dailyLimits.ai ?? 20}</small>}
                    </strong>
                    <small>{status?.connection?.mode === 'personal' ? 'Provider limits apply' : status?.featureRouting ? 'Summaries & insights remaining this week' : 'Operations remaining today'}</small>
                  </div>
                </div>
                <div className="dashboard-create-grid">
                  <section className="source-composer">
                    <div className="composer-heading">
                      <span className="composer-icon">
                        <Plus size={20} />
                      </span>
                      <div>
                        <h2>Create something worth keeping</h2>
                        <p>Start with a video, document, or text.</p>
                      </div>
                    </div>
                    <div className="source-switch" role="tablist" aria-label="Source type">
                      {[
                        { id: 'youtube', label: 'YouTube', icon: CirclePlay },
                        { id: 'document', label: 'Documents', icon: FileText },
                        { id: 'text', label: 'Text', icon: Pencil },
                      ].map((item) => (
                        <button
                          key={item.id}
                          role="tab"
                          aria-selected={quickSource === item.id}
                          tabIndex={quickSource === item.id ? 0 : -1}
                          aria-controls="quick-source-panel"
                          id={`quick-source-${item.id}`}
                          onClick={() => setQuickSource(item.id)}
                          onKeyDown={(event) => {
                            const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                            if (!keys.includes(event.key)) return;
                            event.preventDefault();
                            const sources = ['youtube', 'document', 'text'];
                            const index = sources.indexOf(item.id);
                            const next =
                              event.key === 'Home'
                                ? 0
                                : event.key === 'End'
                                  ? 2
                                  : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
                            setQuickSource(sources[next]);
                            document.getElementById(`quick-source-${sources[next]}`)?.focus();
                          }}
                          className={quickSource === item.id ? 'active' : ''}
                        >
                          <item.icon size={15} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <div
                      id="quick-source-panel"
                      role="tabpanel"
                      aria-labelledby={`quick-source-${quickSource}`}
                      className="composer-body panel-enter"
                      key={quickSource}
                    >
                      {quickSource === 'youtube' ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            openImport('youtube');
                            setSource(quickUrl.trim());
                          }}
                        >
                          <label className="quick-url">
                            <Link2 size={18} />
                            <input
                              type="url"
                              required
                              aria-label="YouTube video URL"
                              placeholder="Paste a YouTube link…"
                              value={quickUrl}
                              onChange={(event) => setQuickUrl(event.target.value)}
                            />
                            <button className="primary" type="submit">
                              Continue <ArrowRight size={16} />
                            </button>
                          </label>
                          <p className="composer-hint">
                            <ShieldCheck size={12} />
                            Public, completed videos. Choose your summary settings next.
                          </p>
                        </form>
                      ) : quickSource === 'document' ? (
                        <div className="composer-document">
                          <FileText size={26} />
                          <div>
                            <strong>Bring your documents together</strong>
                            <p>Import one document or combine multiple PDF summaries.</p>
                          </div>
                          <div>
                            <button className="secondary" onClick={() => openImport('document')}>
                              Import file
                            </button>
                            <button
                              className="primary"
                              onClick={() => {
                                setBatchFiles([]);
                                setBatchOpen(true);
                              }}
                            >
                              Multiple PDFs <ArrowRight size={15} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="composer-document">
                          <Pencil size={25} />
                          <div>
                            <strong>Turn any text into study material</strong>
                            <p>Paste your notes, an article, or a transcript to get started.</p>
                          </div>
                          <button className="primary" onClick={() => openImport('text')}>
                            Paste text <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="composer-footer">
                      <span>
                        <Sparkles size={13} />
                        Summaries · Flashcards · Quizzes · Mind maps
                      </span>
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() => importSource(true)}
                      >
                        Try a sample <ArrowUpRight size={14} />
                      </button>
                    </div>
                  </section>
                  <aside className="dashboard-access">
                    <span className="access-kicker">
                      <span />
                      {status?.billing?.launch === false ? 'YOUR PLAN' : 'FREE LAUNCH'}
                    </span>
                    <h2>
                      {status?.billing?.launch === false
                        ? 'Your tools, in one place.'
                        : 'The full toolkit. Yours to explore.'}
                    </h2>
                    <p>
                      {status?.billing?.launch === false
                        ? 'Manage your access, daily allowances, and one-time purchases.'
                        : 'All available features are open during launch. No card required.'}
                    </p>
                    <div className="access-tools">
                      <span>
                        <Check size={14} />
                        Private workspace
                      </span>
                      <span>
                        <Check size={14} />
                        Source-linked insights
                      </span>
                      <span>
                        <Check size={14} />
                        Combined PDF exports
                      </span>
                    </div>
                    <button onClick={() => navigate('plans')}>
                      Explore your plan <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
                <div className="tool-section-heading">
                  <span>QUICK ACTIONS</span>
                </div>
                <section className="quick-tools">
                  <button onClick={() => openImport('youtube')}>
                    <IconBox tone="red">
                      <CirclePlay size={23} />
                    </IconBox>
                    <div>
                      <h3>YouTube video</h3>
                      <p>Watch less. Understand more.</p>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                  <button onClick={() => openImport('document')}>
                    <IconBox tone="purple">
                      <FileText size={23} />
                    </IconBox>
                    <div>
                      <h3>PDF & documents</h3>
                      <p>Bring the important pages to life.</p>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    onClick={() => {
                      setBatchFiles([]);
                      setBatchOpen(true);
                    }}
                  >
                    <IconBox tone="orange">
                      <Layers size={23} />
                    </IconBox>
                    <div>
                      <h3>PDF collection</h3>
                      <p>Multiple PDFs. One clear summary pack.</p>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                  <button onClick={() => openImport('text')}>
                    <IconBox tone="sage">
                      <Pencil size={23} />
                    </IconBox>
                    <div>
                      <h3>Paste text</h3>
                      <p>Give your thoughts a little structure.</p>
                    </div>
                    <ArrowUpRight size={17} />
                  </button>
                </section>
              </>
            )}
            <section className="library-section">
              <div className="library-heading">
                <div>
                  <h2>
                    {page === 'home'
                      ? 'Recent notes'
                      : page === 'starred'
                        ? 'Favorites'
                        : page === 'folder'
                          ? folderFilter
                          : 'All notes'}
                    <span className="count-badge">{filtered.length}</span>
                  </h2>
                  {page === 'home' && <p>Pick up where you left off.</p>}
                </div>
                <div className="library-actions">
                  <label className="sort-control">
                    <span className="sr-only">Sort notes</span>
                    <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                      <option value="recent">Recently updated</option>
                      <option value="oldest">Oldest first</option>
                      <option value="title">Title A–Z</option>
                    </select>
                  </label>
                  <div className="view-switch" aria-label="Library layout">
                    <button
                      aria-label="Grid view"
                      aria-pressed={libraryLayout === 'grid'}
                      onClick={() => setLibraryLayout('grid')}
                    >
                      <LayoutGrid size={16} />
                    </button>
                    <button
                      aria-label="List view"
                      aria-pressed={libraryLayout === 'list'}
                      onClick={() => setLibraryLayout('list')}
                    >
                      <List size={17} />
                    </button>
                  </div>
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Search notes"
                      placeholder="Search your notes…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  {page === 'home' ? (
                    <button className="text-button" onClick={() => navigate('library')}>
                      View all <ArrowRight size={15} />
                    </button>
                  ) : (
                    <button className="primary" onClick={() => openImport()}>
                      <Plus size={16} />
                      New note
                    </button>
                  )}
                </div>
              </div>
              {loading ? (
                <LibrarySkeleton />
              ) : filtered.length ? (
                <div className={`note-cards ${libraryLayout === 'list' ? 'note-list' : ''}`}>
                  {filtered.slice(0, page === 'home' ? 6 : 1000).map((n, i) => (
                    <button
                      className="note-card"
                      style={{ animationDelay: `${Math.min(i, 5) * 45}ms` }}
                      key={n.id}
                      onClick={() => openNote(n.id)}
                      disabled={busy === 'open'}
                    >
                      <div className={`note-card-cover cover-${i % 4}`}>
                        <div className="cover-pattern" />
                        {n.source === 'YouTube' ? (
                          <CirclePlay size={35} />
                        ) : n.source === 'Audio / video' ? (
                          <Mic size={35} />
                        ) : (
                          <FileText size={35} />
                        )}
                        <span className="cover-source">{n.source}</span>
                        {!!n.starred && (
                          <Star className="cover-star" size={15} fill="currentColor" />
                        )}
                      </div>
                      <div className="note-card-body">
                        <span className="card-collection">{n.folder}</span>
                        <h3>{n.title}</h3>
                        <div className="card-meta">
                          <span>
                            <Clock size={12} />
                            {new Date(n.updated_at).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                          <span className={n.status === 'ready' ? '' : 'processing-label'}>
                            {n.status === 'processing'
                              ? 'Processing…'
                              : n.status === 'failed'
                                ? 'Needs attention'
                                : 'Open note'}
                            <ArrowUpRight size={13} />
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : search ? (
                <Empty
                  icon={<Search size={28} />}
                  title="No matching notes"
                  text="Try another search, or create a note on something new."
                />
              ) : (
                <div className="library-empty">
                  <div className="empty-paper-stack">
                    <div />
                    <div>
                      <BookOpen size={25} />
                    </div>
                  </div>
                  <div>
                    <h3>
                      {page === 'starred'
                        ? 'Keep your best ideas close.'
                        : 'Your next great idea belongs here.'}
                    </h3>
                    <p>
                      {page === 'starred'
                        ? 'Star a note to find it here.'
                        : 'Start with a video, a document, or a thought you want to keep.'}
                    </p>
                  </div>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => (page === 'starred' ? navigate('library') : importSource(true))}
                  >
                    {busy === 'import' ? <Spinner /> : <Sparkles size={16} />}{' '}
                    {page === 'starred' ? 'Browse library' : 'Try a sample'}
                  </button>
                </div>
              )}
            </section>
            {page === 'home' && (
              <section className="bottom-strip">
                <div>
                  <span className="small-orb">
                    <Network size={20} />
                  </span>
                  <div>
                    <strong>Don’t just save it. Make it yours.</strong>
                    <p>Turn any note into a mind map, flashcards, or a quick quiz.</p>
                  </div>
                </div>
                <button className="text-button" onClick={() => openImport('text')}>
                  Start with your notes <ArrowRight size={15} />
                </button>
              </section>
            )}
            <footer className="workspace-footer">
              <span>Noteflow · Your knowledge workspace</span>
              <span>
                <ShieldCheck size={13} />
                Your workspace is private
              </span>
            </footer>
          </main>
        )}
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      <PdfBatch
        open={batchOpen}
        initialFiles={batchFiles}
        aiAvailable={!!status?.ai}
        onClose={() => {
          setBatchOpen(false);
          void refresh().catch(() => {});
          refreshUsage();
        }}
      />
      {importOpen && (
        <div className="modal-backdrop">
          <div
            className="import-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="import-title"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">A NEW DISCOVERY</span>
                <h2 id="import-title">Where does your curiosity lead?</h2>
                <p className="modal-intro">Choose a source. We’ll help you find the essentials.</p>
              </div>
              <button
                className="icon-button"
                disabled={!!busy}
                onClick={() => setImportOpen(false)}
                aria-label="Close import"
              >
                <X size={20} />
              </button>
            </div>
            <div className="import-tabs">
              {[
                { id: 'youtube', label: 'YouTube', icon: CirclePlay },
                { id: 'document', label: 'Document', icon: FileText },
                { id: 'audio', label: 'Audio / video', icon: Mic },
                { id: 'text', label: 'Paste text', icon: Pencil },
              ].map((t) => (
                <button
                  disabled={!!busy}
                  className={importKind === t.id ? 'active' : ''}
                  key={t.id}
                  onClick={() => {
                    setImportKind(t.id);
                    setSource('');
                    setUpload(null);
                    setError('');
                  }}
                >
                  <t.icon size={17} />
                  {t.label}
                </button>
              ))}
            </div>
            <div className="modal-body">
              {busy === 'import' && <GenerationLoader mode="import" compact />}
              {error && (
                <div className="inline-error" role="alert">
                  <AlertCircle size={16} />
                  <div>
                    {error}
                    {error.includes('Sign in with your account') && (
                      <p>
                        <a href="/login" target="_top">
                          Sign in with your account
                        </a>
                      </p>
                    )}
                    {importKind === 'youtube' && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={() => {
                          setImportKind('text');
                          setSource('');
                          setError('');
                        }}
                      >
                        Paste a transcript instead
                      </button>
                    )}
                  </div>
                </div>
              )}
              <label className="field-label">
                Note title <span>optional</span>
                <input
                  ref={modalTitle}
                  value={title}
                  maxLength={180}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your new idea a name"
                />
              </label>
              {importKind === 'youtube' ? (
                <>
                  <label className="field-label">
                    YouTube link
                    <textarea
                      className="url-input"
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=…"
                      rows={3}
                    />
                  </label>
                  <p className="field-hint">
                    Add up to 5 video links, one per line. Public, completed videos only.
                  </p>
                  {!status?.youtube && (
                    <div className="connection-notice">
                      <AlertCircle size={17} />
                      <div>
                        <strong>YouTube connection needed</strong>
                        <p>
                          The site owner needs to restore the YouTube connection. You can paste a
                          transcript now.
                        </p>
                      </div>
                    </div>
                  )}
                </>
              ) : importKind === 'text' ? (
                <label className="field-label">
                  Your source text
                  <textarea
                    className="source-input"
                    value={source}
                    maxLength={MAX_TEXT}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Paste an article, lecture notes, or a video transcript…"
                  />
                  <span className="field-hint">
                    {source.length.toLocaleString()} / 300,000 characters
                  </span>
                </label>
              ) : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    className="sr-only"
                    aria-label="Choose a source file"
                    multiple={importKind === 'document'}
                    accept={
                      importKind === 'audio'
                        ? '.mp3,.mp4,.m4a,.wav,.webm,.mpeg,.mpga'
                        : '.pdf,.txt,.md,.srt,.vtt'
                    }
                    onChange={readFile}
                  />
                  <button
                    className="upload-zone"
                    disabled={!!busy || (importKind === 'audio' && !status?.audio)}
                    onClick={() => fileInput.current?.click()}
                  >
                    <div className="upload-circle">
                      {busy === 'file' ? <Spinner /> : <Upload size={24} />}
                    </div>
                    <strong>{upload ? upload.name : 'Choose files to get started'}</strong>
                    <span>
                      {importKind === 'audio'
                        ? 'MP3, MP4, M4A, WAV, WebM · up to 20 MB'
                        : 'PDF, TXT, Markdown, SRT or VTT · up to 20 MB'}
                    </span>
                    <span className="secondary small-button">Browse files</span>
                  </button>
                  {importKind === 'document' && (
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() => {
                        setBatchFiles([]);
                        setImportOpen(false);
                        setBatchOpen(true);
                      }}
                    >
                      Multiple PDFs → one summary PDF
                    </button>
                  )}
                  {importKind === 'document' && (
                    <p className="field-hint">
                      PDF: selectable text, up to 150 pages and 300,000 characters. Scanned PDFs
                      need OCR.
                    </p>
                  )}
                  {importKind === 'audio' && (
                    <div className="connection-notice">
                      <AlertCircle size={17} />
                      <p>
                        Audio/video file transcription is currently unavailable. Import subtitles,
                        paste a transcript or use a YouTube link instead.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="import-options">
                <label className="field-label">
                  Summary mode
                  <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                    <option value="basic">Basic · selected source sentences</option>
                    <option value="ai">AI · structured insights</option>
                  </select>
                </label>
                <label className="field-label">
                  Output language
                  <select
                    value={language}
                    disabled={importMode === 'basic'}
                    onChange={(e) => setLanguage(e.target.value)}
                  >
                    {languages.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="privacy-hint">
                <ShieldCheck size={13} />
                {importKind === 'youtube'
                  ? `Links are processed by Supadata.${importMode === 'ai' ? ` AI mode also sends the transcript to ${aiProviderName}.` : ''}`
                  : importKind === 'audio'
                    ? 'Audio/video file uploads are currently disabled.'
                    : importMode === 'ai'
                      ? `Your content is sent to ${aiProviderName} for processing.`
                      : 'Basic mode uses source sentences. No AI provider is called.'}
              </p>
            </div>
            <div className="modal-footer">
              <button className="text-button" disabled={!!busy} onClick={() => importSource(true)}>
                Try an example instead
              </button>
              <button
                className="primary"
                disabled={!!busy || (importKind === 'audio' && !status?.audio)}
                onClick={() => importSource()}
              >
                {busy ? <Spinner /> : <Sparkles size={17} />}{' '}
                {busy === 'file' ? 'Reading file…' : busy ? 'Processing…' : 'Create note'}
                {!busy && <ArrowRight size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteOpen && (
        <div className="modal-backdrop">
          <div
            className="small-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-title"
          >
            <h2 id="delete-title">Delete this note?</h2>
            <p>
              Its transcript, study materials, and chat will be permanently removed from your
              workspace.
            </p>
            <div className="modal-buttons">
              <button className="secondary" onClick={() => setDeleteOpen(false)}>
                Keep note
              </button>
              <button
                className="danger-button"
                disabled={!!busy}
                onClick={async () => {
                  if (!note) return;
                  setBusy('delete');
                  try {
                    await api('/api/notes', 'DELETE', { id: note.id });
                    setDeleteOpen(false);
                    setNote(null);
                    currentId.current = null;
                    navigate('library');
                    await refresh();
                    notice('Note deleted');
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Delete note
              </button>
            </div>
          </div>
        </div>
      )}
      {renameOpen && (
        <div className="modal-backdrop">
          <div
            className="small-modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-title"
          >
            <h2 id="rename-title">A place for this idea</h2>
            <label className="field-label">
              Note title
              <input value={rename} maxLength={180} onChange={(e) => setRename(e.target.value)} />
            </label>
            <label className="field-label">
              Collection
              <input
                value={folderName}
                maxLength={60}
                list="collection-options"
                onChange={(e) => setFolderName(e.target.value)}
              />
              <datalist id="collection-options">
                {folders.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </datalist>
            </label>
            <div className="modal-buttons">
              <button className="secondary" onClick={() => setRenameOpen(false)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={!!busy || !rename.trim() || !folderName.trim()}
                onClick={async () => {
                  if (await save({ title: rename, folder: folderName })) setRenameOpen(false);
                }}
              >
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
