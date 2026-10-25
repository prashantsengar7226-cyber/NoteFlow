'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, FileText, Sparkles } from 'lucide-react';

type Mode = 'summary' | 'basic' | 'import' | 'transcript';

export function GenerationLoader({
  mode,
  compact = false,
  completedParts = 0,
  totalParts,
}: {
  mode: Mode;
  compact?: boolean;
  completedParts?: number;
  totalParts?: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const started = Date.now();
    let inView = true;
    const update = () => {
      setPaused(document.hidden || !inView);
      if (!document.hidden) setSeconds(Math.floor((Date.now() - started) / 1000));
    };
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            inView = entry.isIntersecting;
            update();
          });
    if (element.current) observer?.observe(element.current);
    const timer = setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    update();
    return () => {
      clearInterval(timer);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [mode]);

  const summarizing = mode === 'summary' || mode === 'basic';
  const title =
    mode === 'summary'
      ? 'Your summary is taking shape'
      : mode === 'basic'
        ? 'Finding the key ideas'
        : mode === 'transcript'
          ? 'Your transcript is on its way'
          : 'Bringing your source into Noteflow';
  const message =
    totalParts && totalParts > 1
      ? `${completedParts} of ${totalParts} parts complete. Each completed part is saved. Keep this tab open to continue; your full summary will appear here.`
      : seconds >= 25
        ? summarizing
          ? 'Still waiting for your summary. Longer sources can take more time. Keep this tab open; the result will appear here automatically.'
          : 'Still waiting for the transcript service. Longer videos can take more time. Keep this tab open while we check for the result.'
        : summarizing
          ? 'Building a summary from your source. It will appear here as soon as it’s ready.'
          : 'Preparing your source for study. We’ll show the transcript when it’s ready.';

  return (
    <div
      ref={element}
      className={`generation-loader${compact ? ' generation-loader--compact' : ''}`}
      data-paused={paused}
    >
      <div className="generation-loader-art" aria-hidden="true">
        <FileText size={30} strokeWidth={1.4} />
        <div className="generation-loader-lines">
          <i />
          <i />
          <i />
        </div>
        <span className="generation-loader-spark">
          <Sparkles size={18} />
        </span>
      </div>
      <div className="generation-loader-copy">
        <div role="status" aria-live="polite" aria-atomic="true">
          <h2>
            {title}
            <span className="generation-loader-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </h2>
          <p>{message}</p>
        </div>
        <div className="generation-loader-meta">
          {summarizing && (
            <span>
              <Check size={14} /> Source saved
            </span>
          )}
          <span aria-hidden="true">
            {seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`} elapsed
          </span>
        </div>
      </div>
      <div className="generation-loader-track" aria-hidden="true">
        <span />
      </div>
    </div>
  );
}

export function SummarySkeleton() {
  return (
    <div className="summary-skeleton" aria-hidden="true">
      <span />
      <span />
      <span />
      <div>
        <i />
        <span />
      </div>
      <div>
        <i />
        <span />
      </div>
      <div>
        <i />
        <span />
      </div>
    </div>
  );
}
