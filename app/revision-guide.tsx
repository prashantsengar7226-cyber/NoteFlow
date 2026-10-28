'use client';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, List, Search } from 'lucide-react';
import type { Segment, Summary } from '@/lib/core';
import { revisionTopics } from '@/lib/revision-guide';

export function RevisionGuide({ summary, segments, citations, partial }: {
  summary: Summary; segments: Segment[]; citations: (ids: number[]) => ReactNode; partial: boolean;
}) {
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [recall, setRecall] = useState(false);
  const [page, setPage] = useState(0);
  const [readAll, setReadAll] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [jumpTo, setJumpTo] = useState<string | null>(null);
  const topics = useMemo(() => revisionTopics(summary, segments), [summary, segments]);
  const query = search.trim().toLocaleLowerCase();
  const visible = topics.filter(t => `${t.title} ${t.explanation} ${t.points.map(p => p.text).join(' ')}`.toLocaleLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(visible.length / 6));
  const currentPage = Math.min(page, pageCount - 1);
  const displayed = readAll ? visible : visible.slice(currentPage * 6, currentPage * 6 + 6);
  useEffect(() => {
    if (!jumpTo) return;
    const heading = document.getElementById(`${prefix}-${jumpTo}`);
    heading?.scrollIntoView({block:'nearest',behavior:'instant'});
    heading?.focus({preventScroll:true});
    setJumpTo(null);
  }, [jumpTo, currentPage, prefix]);
  function turnPage(next: number) {
    setPage(next);
    setJumpTo(visible[next * 6]?.id || null);
  }
  return <section className="revision-guide" aria-label="Transcript revision guide">
    <div className="revision-meta"><span>{topics.length} {topics.length === 1 ? 'topic' : 'topics'}</span><span>{summary.keyPoints.length} {summary.keyPoints.length === 1 ? 'key point' : 'key points'}</span><span>{partial ? 'Partial guide' : 'Source-linked notes'}</span></div>
    <p className="revision-intro">{partial ? 'More sections are being processed. You can study the saved topics now.' : 'Review the ideas, then test what you remember.'} Check important details against the source.</p>
    <div className="revision-controls">
      <label htmlFor={`${prefix}-search`}><span className="sr-only">Find a topic or fact</span><Search size={17} aria-hidden="true"/>
        <input id={`${prefix}-search`} type="search" value={search} onChange={e => {setSearch(e.target.value);setPage(0);}} placeholder="Find a topic or fact…" />
      </label>
      <button type="button" className="secondary" aria-pressed={recall} onClick={() => setRecall(v => !v)}>{recall ? 'Read notes' : 'Practise recall'}</button>
    </div>
    {recall && <p className="revision-hint">Read each topic title, recall its main facts, then reveal the notes to check yourself. These are the same saved notes; no extra AI request is needed.</p>}
    {!query && !recall && <details className="revision-overview"><summary>Overview</summary><p>{summary.overview}</p></details>}
    <p className="sr-only" role="status">{visible.length} topics shown</p>
    {visible.length > 0 ? <>
      <div className="revision-navigation">
        <button type="button" className="revision-contents-toggle" aria-expanded={contentsOpen} aria-controls={`${prefix}-contents`} onClick={()=>setContentsOpen(v=>!v)}><List size={17}/><span>Contents <small>{visible.length} topics</small></span><ChevronRight size={16} className={contentsOpen?'rotated':''}/></button>
        {contentsOpen && <nav id={`${prefix}-contents`} className="revision-index" aria-label="Revision topics">{visible.map((t,index) => <button type="button" key={t.id} onClick={()=>{setPage(Math.floor(index/6));setJumpTo(t.id);setContentsOpen(false);}}><span>{index+1}</span><span>{t.title}</span><ChevronRight size={14}/></button>)}</nav>}
      </div>
      <div className="revision-page-info"><span>{readAll ? `All ${visible.length} topics` : `Topics ${currentPage*6+1}–${Math.min((currentPage+1)*6,visible.length)} of ${visible.length}`}</span>{visible.length>6 && <button type="button" onClick={()=>{setReadAll(v=>!v);setPage(0);}}>{readAll?'Read in pages':'Read all topics'}</button>}</div>
      <div key={`${recall}-${query}`} className="revision-topics">
        {displayed.map(t => <section key={t.id} className="revision-topic">
          <h3 id={`${prefix}-${t.id}`} tabIndex={-1}><span className="revision-topic-number">{topics.indexOf(t)+1}</span>{t.title}</h3>
          <details open={recall ? undefined : true}>
            <summary>{recall ? 'Reveal notes and check your recall' : 'Topic notes'}{t.points.length > 0 ? ` · ${t.points.length} ${t.points.length === 1 ? 'key point' : 'key points'}` : ''}</summary>
            {t.explanation && (t.points.length ? <details className="revision-context" open={query ? t.explanation.toLocaleLowerCase().includes(query) : undefined}><summary>Read topic explanation</summary><div className="revision-explanation"><p>{t.explanation}</p><div className="citations">{citations(t.segmentIds)}</div></div></details> : <div className="revision-explanation"><p>{t.explanation}</p><div className="citations">{citations(t.segmentIds)}</div></div>)}
            {t.points.length > 0 && <ul className="revision-facts">{t.points.map((p, i) => <li key={i}><p>{p.text}</p><div className="citations">{citations(p.segmentIds)}</div></li>)}</ul>}
          </details>
        </section>)}
      </div>
      {!readAll && pageCount>1 && <nav className="revision-pagination" aria-label="Topic pages"><button type="button" disabled={currentPage===0} onClick={()=>turnPage(currentPage-1)}><ChevronLeft size={16}/>Previous</button><span>Page {currentPage+1} of {pageCount}</span><button type="button" disabled={currentPage===pageCount-1} onClick={()=>turnPage(currentPage+1)}>Next<ChevronRight size={16}/></button></nav>}
    </> : <p>No topics match “{search}”. Clear the search to see the full guide.</p>}
    {summary.sourceChecks && <p className="source-check-note">Source review: {summary.sourceChecks.checkedParts} of {summary.sourceChecks.totalParts} displayed parts checked against the transcript. This is not independent fact verification. Video visuals and errors in the original transcript may be missing or incorrect.</p>}
  </section>;
}
