'use client';
import { useId, useMemo, useState, type ReactNode } from 'react';
import type { Segment, Summary } from '@/lib/core';
import { revisionTopics } from '@/lib/revision-guide';

export function RevisionGuide({ summary, segments, citations, partial }: {
  summary: Summary; segments: Segment[]; citations: (ids: number[]) => ReactNode; partial: boolean;
}) {
  const prefix = useId();
  const [search, setSearch] = useState('');
  const [recall, setRecall] = useState(false);
  const topics = useMemo(() => revisionTopics(summary, segments), [summary, segments]);
  const query = search.trim().toLocaleLowerCase();
  const visible = topics.filter(t => `${t.title} ${t.explanation} ${t.points.map(p => p.text).join(' ')}`.toLocaleLowerCase().includes(query));
  return <section className="revision-guide" aria-label="Transcript revision guide">
    <p className="revision-intro">{partial ? 'Partial revision guide — more source sections are still being processed.' : 'Revise the transcript topic by topic.'} {summary.keyPoints.length} {summary.keyPoints.length === 1 ? 'key point' : 'key points'} across {topics.length} {topics.length === 1 ? 'topic' : 'topics'}. Use the source references to check names, numbers and unclear statements.</p>
    <div className="revision-controls">
      <label htmlFor={`${prefix}-search`}>Find a topic or fact
        <input id={`${prefix}-search`} type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your revision guide" />
      </label>
      <button type="button" className="secondary" aria-pressed={recall} onClick={() => setRecall(v => !v)}>{recall ? 'Read notes' : 'Practise recall'}</button>
    </div>
    {recall && <p className="revision-hint">Read each topic title, recall its main facts, then reveal the notes to check yourself. These are the same saved notes; no extra AI request is needed.</p>}
    {!query && !recall && <details className="revision-overview"><summary>Read the overview</summary><p>{summary.overview}</p></details>}
    <p className="sr-only" role="status">{visible.length} topics shown</p>
    {visible.length > 0 ? <>
      <nav className="revision-index" aria-label="Revision topics">{visible.map(t => <a key={t.id} href={`#${prefix}-${t.id}`}>{t.title}</a>)}</nav>
      <div key={`${recall}-${query}`} className="revision-topics">
        {visible.map(t => <section key={t.id} id={`${prefix}-${t.id}`} className="revision-topic">
          <h3>{t.title}</h3>
          <details open={recall ? undefined : true}>
            <summary>{recall ? 'Reveal notes and check your recall' : 'Topic notes'}{t.points.length > 0 ? ` · ${t.points.length} ${t.points.length === 1 ? 'key point' : 'key points'}` : ''}</summary>
            {t.explanation && <div className="revision-explanation"><p>{t.explanation}</p><div className="citations">{citations(t.segmentIds)}</div></div>}
            {t.points.length > 0 && <ul className="revision-facts">{t.points.map((p, i) => <li key={i}><p>{p.text}</p><div className="citations">{citations(p.segmentIds)}</div></li>)}</ul>}
          </details>
        </section>)}
      </div>
    </> : <p>No topics match “{search}”. Clear the search to see the full guide.</p>}
    {summary.sourceChecks && <p className="source-check-note">Source review: {summary.sourceChecks.checkedParts} of {summary.sourceChecks.totalParts} displayed parts checked against the transcript. This is not independent fact verification. Video visuals and errors in the original transcript may be missing or incorrect.</p>}
  </section>;
}
