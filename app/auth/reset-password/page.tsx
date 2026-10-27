'use client';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import Link from 'next/link';
import {browserAuth,authErrorMessage} from '@/lib/auth-browser';
import {newPasswordError} from '@/lib/auth-validation';
import '../../login/auth.css';
export default function ResetPassword(){
  const [ready,setReady]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[message,setMessage]=useState('');
  const pending=useRef(false);
  useEffect(()=>{let active=true;Promise.resolve().then(()=>browserAuth().auth.getUser()).then(({data,error})=>{if(active)setReady(!error&&!!data.user?.email_confirmed_at);}).catch(()=>{}).finally(()=>{if(active)setChecking(false);});return()=>{active=false;};},[]);
  async function submit(e:FormEvent){e.preventDefault();if(pending.current)return;const invalid=newPasswordError(password,confirmation);if(invalid){setMessage(invalid);return;}pending.current=true;setBusy(true);setMessage('');
    try{const client=browserAuth();const verified=await client.auth.getUser();if(verified.error||!verified.data.user?.email_confirmed_at){setReady(false);return;}
      const {error}=await client.auth.updateUser({password});if(error){setMessage(error.code==='same_password'||error.code==='weak_password'?authErrorMessage(error):'Your password could not be updated. Request a new reset link and try again.');return;}
      setPassword('');setConfirmation('');setDone(true);
      // Global sign-out revokes refresh sessions. Existing access tokens expire normally.
      const result=await client.auth.signOut({scope:'global'});
      if(result.error)setMessage('Password updated. Session sign-out could not finish; use Sign out in your workspace.');
    }catch{setMessage('The request did not finish. Try signing in with your new password before repeating the reset.');}
    finally{pending.current=false;setBusy(false);}}
  return <main className="auth-reset-page"><section className="auth-card"><Link href="/welcome" className="auth-brand">noteflow.</Link><h1>{done?'Password updated':'Choose a new password'}</h1>{checking?<p role="status">Checking your secure session…</p>:done?<><p>You can now sign in with your new password.</p><Link href="/login">Back to sign in</Link></>:!ready?<><p>This reset session is missing or has expired. Request a new reset link and open it in the same browser.</p><Link href="/login">Request a new link</Link></>:<form onSubmit={submit} noValidate aria-busy={busy} onChange={()=>setMessage('')}><p>Use a unique passphrase with 12–128 characters.</p><label>New password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} required/></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy} required/></label><button className="primary" disabled={busy}>{busy?'Updating password…':'Update password'}</button></form>}{message&&<p role="alert" className="auth-feedback">{message}</p>}</section></main>;
}
