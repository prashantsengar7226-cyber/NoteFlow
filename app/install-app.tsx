'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Check, Download, Smartphone } from 'lucide-react';

type InstallPrompt = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
type InstallState = {
  available: boolean;
  installed: boolean;
  busy: boolean;
  message: string;
  install(): Promise<void>;
};
const InstallContext = createContext<InstallState | null>(null);

export function InstallProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const display = window.matchMedia('(display-mode: standalone)');
    const checkInstalled = () =>
      setInstalled(
        display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setMessage('Noteflow is installed. Look for its icon on your home screen.');
    };
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    display.addEventListener('change', checkInstalled);
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch(() => {
          /* Installation can still use the browser menu without offline fallback. */
        });
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      display.removeEventListener('change', checkInstalled);
    };
  }, []);
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    setMessage('');
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(
        choice.outcome === 'accepted'
          ? 'Installation requested. Follow your browser’s confirmation.'
          : 'Installation dismissed. You can install later from your browser menu.',
      );
    } catch {
      setMessage('Open your browser menu and choose Install app or Add to Home screen.');
    } finally {
      setPrompt(null);
      setBusy(false);
    }
  }
  return (
    <InstallContext.Provider value={{ available: !!prompt, installed, busy, message, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function InstallApp() {
  const state = useContext(InstallContext);
  if (!state) return null;
  return (
    <section className="settings-panel install-panel" aria-labelledby="install-title">
      <h2 id="install-title">
        <Smartphone size={20} /> Noteflow on your home screen
      </h2>
      <p>
        Open your study library in its own app window. Use the same NoteFlow account to access your
        notes across devices.
      </p>
      {state.installed ? (
        <p className="install-status">
          <Check size={18} /> You're using or have installed the Noteflow app.
        </p>
      ) : state.available ? (
        <button className="primary" disabled={state.busy} onClick={() => void state.install()}>
          <Download size={16} /> {state.busy ? 'Opening installation…' : 'Install Noteflow'}
        </button>
      ) : (
        <p>
          On Android, open Noteflow in Chrome. Open the browser menu, then choose{' '}
          <strong>Install app</strong> or <strong>Add to Home screen</strong>. If you're viewing it
          inside another app, open the link in Chrome first.
        </p>
      )}
      {state.message && (
        <p role="status" aria-live="polite">
          {state.message}
        </p>
      )}
      <p className="install-note">
        An internet connection is needed for your library, imports and AI. Website updates appear
        when you reopen the app online.
      </p>
    </section>
  );
}
