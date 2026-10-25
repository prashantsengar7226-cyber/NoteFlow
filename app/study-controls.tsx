'use client';
import { Download, Plus, LoaderCircle } from 'lucide-react';
import { STUDY_LIMIT, studyCoverage, type StudyItem } from '@/lib/study';
import type { Segment } from '@/lib/core';

export function StudyControls({
  kind,
  items,
  segments,
  count,
  difficulty,
  focus,
  busy,
  onCount,
  onDifficulty,
  onFocus,
  onGenerate,
  onPdf,
  onJump,
}: {
  kind: 'quiz' | 'flashcards';
  items: StudyItem[];
  segments: Segment[];
  count: number;
  difficulty: string;
  focus: string;
  busy: string;
  onCount: (count: number) => void;
  onDifficulty: (difficulty: string) => void;
  onFocus: (focus: string) => void;
  onGenerate: () => void;
  onPdf: () => void;
  onJump: (id: number) => void;
}) {
  const coverage = studyCoverage(segments, items);
  return (
    <div className="study-controls">
      <div className="select-group">
        <label>
          New {kind === 'quiz' ? 'questions' : 'cards'}
          <select
            value={count}
            disabled={!!busy}
            onChange={(event) => onCount(Number(event.target.value))}
          >
            {[5, 10, 20].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label>
          Difficulty
          <select
            value={difficulty}
            disabled={!!busy}
            onChange={(event) => onDifficulty(event.target.value)}
          >
            <option value="mixed">Mixed</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <label>
          Focus
          <select value={focus} disabled={!!busy} onChange={(event) => onFocus(event.target.value)}>
            <option value="balanced">All key ideas</option>
            <option value="gaps">Uncovered sections</option>
          </select>
        </label>
      </div>
      {items.length > 0 && (
        <>
          <div className="study-actions">
            <button
              className="primary"
              disabled={!!busy || items.length >= STUDY_LIMIT}
              onClick={onGenerate}
            >
              {busy === kind ? <LoaderCircle size={16} className="spin" /> : <Plus size={16} />}
              {busy === kind
                ? 'Generating…'
                : `Generate more ${kind === 'quiz' ? 'questions' : 'cards'}`}
            </button>
            <button className="secondary" disabled={!!busy} onClick={onPdf}>
              {busy === 'pdf' ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Download size={16} />
              )}
              Download PDF
            </button>
          </div>
          <p className="study-coverage">
            {items.length} saved · {coverage.covered} of {coverage.total} source sections cited. New
            items are added to this set. References help you check coverage; they do not guarantee
            every idea is included.
          </p>
          {coverage.missing.length > 0 && (
            <details className="coverage-details">
              <summary>Review {coverage.missing.length} sections without a reference</summary>
              <div>
                {coverage.missing.map((segment) => (
                  <button key={segment.id} className="citation" onClick={() => onJump(segment.id)}>
                    Section {segment.id + 1}
                  </button>
                ))}
              </div>
            </details>
          )}
          {items.length >= STUDY_LIMIT && (
            <p className="study-coverage">This set has reached its {STUDY_LIMIT}-item limit.</p>
          )}
        </>
      )}
    </div>
  );
}
