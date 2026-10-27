'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { credentialsError, emailError } from '@/lib/auth-validation';
import { browserAuth, authErrorMessage } from '@/lib/auth-browser';
import { findStudyTool } from '@/lib/study-tools';
import { ArrowRight, FileText, CirclePlay, BookOpen, Layers, Network, MessageSquare, Eye, EyeOff, MailCheck, ShieldCheck, Check } from 'lucide-react';
import './auth.css';

type Mode='login'|'signup'|'forgot'|'verify';
export default function Login() {
  const [mode,setMode]=useState<Mode>('login'),[email,setEmail]=useState(''),[name,setName]=useState('');
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[visible,setVisible]=useState(false);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState(false),[cooldown,setCooldown]=useState(0);
  const [settings,setSettings]=useState<{available:boolean;signupEnabled:boolean;emailConfirmationRequired:boolean}|null>(null);
  const submitting=useRef(false),feedback=useRef<HTMLParagraphElement>(null);
  const register=mode==='signup',emailOnly=mode==='forgot'||mode==='verify';
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/auth-status',{signal:controller.signal}).then(r=>r.json()).then(setSettings).catch(()=>{if(!controller.signal.aborted)setSettings({available:false,signupEnabled:false,emailConfirmationRequired:false});});
    if(new URLSearchParams(location.search).get('auth')==='invalid-link'){setMessage('This link is invalid, expired, already used, or opened in a different browser. Request a new link and open it in the browser where you requested it.');setFailure(true);}
    return()=>controller.abort();
  },[]);
  useEffect(()=>{if(!cooldown)return;const timer=setTimeout(()=>setCooldown(n=>Math.max(0,n-1)),1000);return()=>clearTimeout(timer);},[cooldown]);
  function change(next:Mode){setMode(next);setPassword('');setConfirmation('');setVisible(false);setMessage('');setFailure(false);}
  function report(text:string,error=false){setMessage(text);setFailure(error);if(error)requestAnimationFrame(()=>feedback.current?.focus());}
  async function submit(event:FormEvent){
    event.preventDefault();if(submitting.current)return;
    const validation=emailOnly?emailError(email):credentialsError(email,password,register,confirmation);
    if(validation){report(validation,true);return;}
    if(register&&(!name.trim()||name.trim().length>80)){report('Enter your name using 1 to 80 characters.',true);return;}
    if((register&&!settings?.signupEnabled)||(emailOnly&&!settings?.emailConfirmationRequired)){report('This option is not available yet. You can still sign in to an existing account.',true);return;}
    submitting.current=true;setBusy(true);setMessage('');setFailure(false);
    try {
      const client=browserAuth(),address=email.trim(),callback=location.origin+'/auth/callback';
      if(emailOnly){
        if(cooldown)return;
        const {error}=mode==='forgot'?await client.auth.resetPasswordForEmail(address,{redirectTo:callback+'?next=/auth/reset-password'}):await client.auth.resend({type:'signup',email:address,options:{emailRedirectTo:callback}});
        setCooldown(60);
        if(error&&error.status===429){report(authErrorMessage(error),true);return;}
        if(error&&(!error.status||error.status>=500)){report('Email could not be sent right now. Please try later or contact support.',true);return;}
        report(mode==='forgot'?'If this address has an eligible account, a password-reset link will arrive shortly. Check spam and open it in this browser.':'If this account needs confirmation, a new link will arrive shortly. Check spam and open it in this browser.');return;
      }
      const credentials={email:address,password};
      const {data,error}=register?await client.auth.signUp({...credentials,options:{data:{full_name:name.trim()},emailRedirectTo:callback}}):await client.auth.signInWithPassword(credentials);
      if(error){report(authErrorMessage(error,register),true);return;}
      if(!data.session){setMode('verify');setPassword('');setConfirmation('');setCooldown(60);report('Check your inbox. If this address is eligible for signup, you will receive a confirmation link. Open it in this browser to finish.');return;}
      const verified=await client.auth.getUser();
      if(verified.error||!verified.data.user?.email_confirmed_at){setMode('verify');setPassword('');setConfirmation('');report('Confirm your email before opening your workspace.',true);return;}
      const tool=findStudyTool(new URLSearchParams(location.search).get('tool'));
      location.assign(tool?'/?start='+tool.id:'/');
    }catch{report('The connection did not finish. Check your network and try again. If you were creating an account, try signing in before registering again.',true);}
    finally{submitting.current=false;setBusy(false);}
  }
  const title=register?'Create your account':mode==='forgot'?'Reset your password':mode==='verify'?'Check your inbox':'Welcome back';
  return <main className="login-page study-login">
    <header className="login-brand"><img src="/favicon.svg" alt="" width="32" height="32"/><span>noteflow.</span><a href="/welcome">Explore the tools <ArrowRight size={16}/></a></header>
    <div className="login-layout"><section className="login-intro"><h1>Watch less.<br/>Understand more.</h1><p className="login-lead">Bring a video, a document, or an idea. Build clear study notes with the source always within reach.</p><div className="login-inputs"><span><CirclePlay size={19}/> YouTube</span><span><FileText size={19}/> PDFs & documents</span><span><BookOpen size={19}/> Text & transcripts</span></div><div className="login-workflow"><h2>From source to understanding</h2><p>Read the notes beside your source. Check a reference. Ask a follow-up. Then put what you learned into practice.</p><div><span><Layers size={18}/> Flashcards & quizzes</span><span><Network size={18}/> Mind maps & slides</span><span><MessageSquare size={18}/> Source-based chat</span></div></div><p className="login-plan">Free study tools · Provider limits apply · Private notes</p></section>
    <section className="login-card auth-card" id="signin" aria-label="Account access">
      {emailOnly?<MailCheck size={30} className="auth-symbol"/>:<ShieldCheck size={28} className="auth-symbol"/>}
      <h2>{title}</h2><p>{register?'Start a private library for everything you want to learn.':mode==='forgot'?'We will send a secure link to your email.':mode==='verify'?'One more step before your workspace is ready.':'Sign in to continue where you left off.'}</p>
      {settings&&!settings.available&&<p className="auth-feedback" role="status">Signup availability could not be checked. Refresh to try again. You can still sign in to an existing account.</p>}
      <form onSubmit={submit} noValidate aria-busy={busy} onChange={()=>{setMessage('');setFailure(false);}}>
        {register&&<label>Your name<input name="fullName" autoComplete="name" required maxLength={80} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label>}
        <label>Email address<input name="email" required autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} type="email" value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
        {!emailOnly&&<><label htmlFor="auth-password">Password</label><div className="auth-password"><input id="auth-password" name="password" required autoComplete={register?'new-password':'current-password'} type={visible?'text':'password'} value={password} disabled={busy} aria-describedby={register?'password-help':undefined} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}
        {register&&<><div id="password-help" className="auth-password-help"><span className={Array.from(password).length>=12&&Array.from(password).length<=128?'auth-rule-met':''}><Check size={14}/>12–128 characters</span><span>Use a unique passphrase; spaces are welcome.</span></div><label>Confirm password<input name="confirmPassword" required autoComplete="new-password" type={visible?'text':'password'} value={confirmation} disabled={busy} onChange={e=>setConfirmation(e.target.value)}/></label><p className="auth-policy">{settings?.emailConfirmationRequired?'Confirm your email using the link we send after signup.':'Email verification is being prepared. Current signup uses the existing account policy.'}</p></>}
        {message&&<p ref={feedback} tabIndex={-1} role={failure?'alert':'status'} className={failure?'auth-feedback auth-error':'auth-feedback auth-success'}>{message}</p>}
        {emailOnly&&!settings?.emailConfirmationRequired&&<p className="auth-feedback">Email delivery is not enabled yet. Contact the site owner for help accessing your account.</p>}
        <button className="primary" disabled={busy||(register&&!settings?.signupEnabled)||(emailOnly&&(!settings?.emailConfirmationRequired||cooldown>0))}>{busy?'Please wait…':emailOnly&&cooldown?`Send again in ${cooldown}s`:register?'Create account':mode==='forgot'?'Send reset link':mode==='verify'?'Resend confirmation':'Sign in'}{!busy&&<ArrowRight size={17}/>}</button>
        {mode==='login'&&<div className="auth-links"><button type="button" disabled={busy} onClick={()=>change('forgot')}>Forgot password?</button><button type="button" disabled={busy} onClick={()=>change('verify')}>Resend confirmation</button></div>}
        <button className="text-button" type="button" disabled={busy} onClick={()=>change(mode==='login'?'signup':'login')}>{mode==='login'?'New to NoteFlow? Create an account':'Already have an account? Sign in'}</button>
      </form><small>Your notes stay private to your account. Never share passwords or confirmation links.</small>
    </section></div><footer className="login-footer">Make room for the next idea.<span><a href="/access">Plans & access</a> · <a href="/help">Help & FAQ</a></span></footer>
  </main>;
}
