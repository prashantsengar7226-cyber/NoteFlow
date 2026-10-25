'use client';

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

export function MotionControl() {
  const [enabled, setEnabled] = useState(true);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    try {
      setEnabled(localStorage.getItem('noteflow-motion') !== 'off');
    } catch {}
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  useEffect(() => {
    document.documentElement.dataset.motion = enabled && !reduced ? 'on' : 'off';
    return () => {
      delete document.documentElement.dataset.motion;
    };
  }, [enabled, reduced]);
  const active = enabled && !reduced;
  return (
    <button
      className="motion-control"
      aria-label={
        reduced
          ? 'Motion disabled by your device preference'
          : active
            ? 'Pause animations'
            : 'Enable animations'
      }
      aria-pressed={active}
      title={
        reduced
          ? 'Your device prefers reduced motion'
          : active
            ? 'Pause animations'
            : 'Enable animations'
      }
      disabled={reduced}
      onClick={() => {
        const next = !enabled;
        setEnabled(next);
        try {
          localStorage.setItem('noteflow-motion', next ? 'on' : 'off');
        } catch {}
      }}
    >
      {active ? <Pause size={13} /> : <Play size={13} />}
      <span>Motion {active ? 'on' : 'off'}</span>
    </button>
  );
}

export function LibrarySkeleton() {
  return (
    <div className="library-skeleton" role="status" aria-label="Loading your notes">
      <span className="sr-only">Loading your notes…</span>
      {[0, 1, 2].map((n) => (
        <div key={n} aria-hidden="true">
          <i />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}
