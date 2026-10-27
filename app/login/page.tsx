'use client';
import { useRef, useState, type FormEvent } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { credentialsError } from '@/lib/auth-validation';
import { findStudyTool } from '@/lib/study-tools';
import { ArrowRight, FileText, CirclePlay, BookOpen, Layers, Network, MessageSquare } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState('');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url || !key || submitting.current) return;
    const validationError = credentialsError(email, password, register, confirmPassword);
    if (validationError) {
      setMessage(validationError);
      return;
    }
    submitting.current = true;
    setBusy(true); setMessage('');
    try {
      const client = createBrowserClient(url, key);
      const credentials = { email: email.trim(), password };
      const { data, error } = register
        ? await client.auth.signUp(credentials)
        : await client.auth.signInWithPassword(credentials);
      if (error) {
        if (error.code === 'weak_password') setMessage('Choose a stronger password. Use a longer, unique password with a mix of letters, numbers and symbols.');
        else if (error.status === 429) setMessage('Too many attempts. Wait a few minutes and try again.');
        else if (error.code === 'email_not_confirmed') setMessage('This account still requires email confirmation. Contact the app owner to finish account setup.');
        else setMessage(register ? 'Could not create an account. Try signing in if you already have one, or try again later.' : 'Could not sign in. Check your email and password and try again.');
        return;
      }
      if (data.session) {
        const tool = findStudyTool(new URLSearchParams(window.location.search).get('tool'));
        window.location.assign(tool ? '/?start=' + tool.id : '/');
      }
      else setMessage('Account setup did not return a sign-in session. Contact the app owner to finish setup before signing in.');
    } catch { setMessage('Connection failed. Please try again.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <main className="login-page study-login">
    <header className="login-brand"><img src="/favicon.svg" alt="" width="32" height="32"/><span>noteflow.</span><a href="/welcome">Explore the tools <ArrowRight size={16}/></a></header>
    <div className="login-layout"><section className="login-intro">
      <h1>Watch less.<br/>Understand more.</h1>
      <p className="login-lead">Bring a video, a document, or an idea. Build clear study notes with the source always within reach.</p>
      <div className="login-inputs"><span><CirclePlay size={19}/> YouTube</span><span><FileText size={19}/> PDFs & documents</span><span><BookOpen size={19}/> Text & transcripts</span></div>
      <div className="login-workflow"><h2>From source to understanding</h2><p>Read the notes beside your source. Check a reference. Ask a follow-up. Then put what you learned into practice.</p><div><span><Layers size={18}/> Flashcards & quizzes</span><span><Network size={18}/> Mind maps & slides</span><span><MessageSquare size={18}/> Source-based chat</span></div></div>
      <p className="login-plan">Free study tools · Provider limits apply · Private notes</p>
    </section><section className="login-card" id="signin" aria-label="Account access">
    <h2>{register ? 'Start your library' : 'Welcome back'}</h2><p>{register ? 'A place for everything you want to learn.' : 'Your notes, sources and study tools are waiting.'}</p>
    {!url || !key ? <p role="alert">Sign-in setup is incomplete. The app owner needs to add the Supabase environment variables and redeploy.</p> :
    <form onSubmit={submit} aria-busy={busy}>
      <label>Email address<input name="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} type="email" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)} /></label>
      <label>Password<input name="password" required autoComplete={register ? 'new-password' : 'current-password'} type="password" minLength={register ? 8 : undefined} value={password} disabled={busy} aria-describedby={register ? 'password-help' : undefined} onChange={e=>setPassword(e.target.value)} /></label>
      {register && <>
        <small id="password-help">Use at least 8 characters. Save your password somewhere safe; email password resets are unavailable.</small>
        <label>Confirm password<input name="confirmPassword" required autoComplete="new-password" type="password" value={confirmPassword} disabled={busy} onChange={e=>setConfirmPassword(e.target.value)} /></label>
      </>}
      <button className="primary" disabled={busy}>{busy ? (register ? 'Creating account…' : 'Signing in…') : register ? 'Create account' : 'Sign in'}</button>
      <button className="text-button" type="button" disabled={busy} onClick={()=>{setRegister(!register);setPassword('');setConfirmPassword('');setMessage('');}}>{register ? 'Already have an account? Sign in' : 'New to NoteFlow? Create an account'}</button>
      <p role="status">{message}</p>
    </form>}
    <small>Your notes are private to your account. AI output may contain mistakes; check source citations.</small>
  </section></div><footer className="login-footer">Make room for the next idea.<span><a href="/access">Plans & access</a> · <a href="/help">Help & FAQ</a> · Personal notes · Practice · PDF exports</span></footer></main>;
}
