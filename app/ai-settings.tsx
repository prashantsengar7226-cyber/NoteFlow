'use client';
import {useEffect,useState} from 'react';
import {queueRequest} from '@/lib/queue-client';
type Connection={enabled:boolean;mode:string;provider?:string;model?:string};
const defaults:Record<string,string>={gemini:'gemini-3.5-flash-lite',groq:'openai/gpt-oss-120b',openrouter:'openrouter/free'};
export function AISettings({onUpdated}:{onUpdated:()=>void}) {
  const [connection,setConnection]=useState<Connection>();
  const [provider,setProvider]=useState('gemini');
  const [model,setModel]=useState(defaults.gemini);
  const [key,setKey]=useState('');
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  useEffect(()=>{queueRequest<Connection>('/api/ai-connection').then(setConnection).catch(()=>setMessage('Could not load your AI connection. Refresh to try again.'));},[]);
  async function change(remove=false) {
    setBusy(true);setMessage('');
    try {
      const result=await queueRequest<Connection>('/api/ai-connection',remove?'DELETE':'POST',remove?undefined:{provider,model,key,consent});
      setConnection(result);setKey('');setConsent(false);onUpdated();
      setMessage(remove?'Personal key removed. NoteFlow AI is active.':'Connection tested and saved. Your personal AI is active.');
    } catch(e) {setMessage((e as Error).message);setKey('');}
    finally {setBusy(false);}
  }
  return <section className="settings-panel personal-ai-settings" aria-labelledby="personal-ai-title">
    <h2 id="personal-ai-title">Choose your AI connection</h2>
    <p><strong>{connection?.mode==='personal'?`Personal AI · ${connection.provider}`:'NoteFlow AI · 20 operations per day'}</strong></p>
    <p>Connect your own key for no NoteFlow daily AI cap. Your provider’s limits and charges still apply. Request-rate, source-size and YouTube import limits remain in place. A personal key does not automatically improve accuracy.</p>
    {connection && !connection.enabled ? <p role="status">Personal connections will be available after the site owner completes secure key-storage setup.</p> : <form onSubmit={e=>{e.preventDefault();void change();}}>
      <div className="ai-fields">
        <label>Provider<select value={provider} disabled={busy} onChange={e=>{setProvider(e.target.value);setModel(defaults[e.target.value]);}}><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></label>
        <label>Model ID<input value={model} required maxLength={120} disabled={busy} onChange={e=>setModel(e.target.value)} /></label>
      </div>
      <p><a href={provider==='gemini'?'https://aistudio.google.com/apikey':provider==='groq'?'https://console.groq.com/keys':'https://openrouter.ai/settings/keys'} target="_blank" rel="noreferrer">Create a key with {provider}</a>. Use a model available on your account.</p>
      <label>API key<input type="password" autoComplete="off" spellCheck={false} required minLength={20} maxLength={512} value={key} disabled={busy} onChange={e=>setKey(e.target.value)} /></label>
      <p>Stored encrypted on the server. Your source is sent to the selected provider. NoteFlow will not switch to its shared key if your personal key fails.</p>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)} required /><span>I authorize a connection test, AI generation, source reviews and bounded automatic retries using this key. My provider may charge for requests, including retries.</span></label>
      <div className="ai-settings-actions"><button className="primary" disabled={busy||!consent||!connection}>{busy?'Checking connection…':'Test and connect'}</button>
      {connection?.mode==='personal'&&<button className="secondary" type="button" disabled={busy} onClick={()=>void change(true)}>Remove key and use NoteFlow AI</button>}</div>
    </form>}
    {message&&<p role="status">{message}</p>}
    <p>Removing a key cancels its queued tasks. A request already sent to the provider may still finish. Revoke the key at your provider to invalidate it everywhere.</p>
  </section>;
}
