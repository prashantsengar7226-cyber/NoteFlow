'use client';
import {useEffect,useState} from 'react';
import {queueRequest} from '@/lib/queue-client';
import type {AvailableModel} from '@/lib/ai-models';

type Connection={enabled:boolean;mode:string;provider?:string;model?:string;revision?:string};
export function AISettings({onUpdated}:{onUpdated:()=>void}) {
  const [connection,setConnection]=useState<Connection>();
  const [provider,setProvider]=useState('gemini');
  const [model,setModel]=useState('');
  const [key,setKey]=useState('');
  const [useSaved,setUseSaved]=useState(true);
  const [models,setModels]=useState<AvailableModel[]>();
  const [search,setSearch]=useState('');
  const [freeOnly,setFreeOnly]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [message,setMessage]=useState('');
  const saved=useSaved&&connection?.mode==='personal'&&connection.provider===provider&&!!connection.revision;
  const locked=busy||loading;
  const visible=(models??[]).filter(m=>(!freeOnly||m.free===true)&&`${m.name} ${m.id}`.toLowerCase().includes(search.toLowerCase()));
  const selected=models?.find(m=>m.id===model);
  useEffect(()=>{let active=true;queueRequest<Connection>('/api/ai-connection').then(c=>{if(active){setConnection(c);if(c.provider)setProvider(c.provider);}}).catch(()=>{if(active)setMessage('Could not load your AI connection. Refresh to try again.');});return()=>{active=false;};},[]);
  function resetCatalog(){setModels(undefined);setModel('');setSearch('');setFreeOnly(false);setMessage('');setConsent(false);}
  async function loadModels(){
    setLoading(true);setMessage('');setModels(undefined);setModel('');setSearch('');setFreeOnly(false);
    try{
      const result=await queueRequest<{models:AvailableModel[]}>('/api/ai-models','POST',{provider,...(saved?{revision:connection!.revision}:{key})});
      setModels(result.models);
      if(saved&&result.models.some(m=>m.id===connection?.model))setModel(connection!.model!);
    }catch(e){setMessage((e as Error).message);}
    finally{setLoading(false);}
  }
  async function change(remove=false) {
    setBusy(true);setMessage('');
    try {
      const result=await queueRequest<Connection>('/api/ai-connection',remove?'DELETE':'POST',remove?undefined:{provider,model,...(saved?{revision:connection!.revision}:{key}),consent});
      setConnection(result);setKey('');setConsent(false);setUseSaved(true);onUpdated();
      if(remove)resetCatalog();
      setMessage(remove?'Personal key removed. NoteFlow AI is active.':'Connection tested and saved. Your personal AI is active.');
    } catch(e) {setMessage((e as Error).message);if(!saved){setKey('');setModels(undefined);setModel('');}}
    finally {setBusy(false);}
  }
  return <section className="settings-panel personal-ai-settings" aria-labelledby="personal-ai-title">
    <h2 id="personal-ai-title">Choose your AI connection</h2>
    <p><strong>{connection?.mode==='personal'?`Personal AI · ${connection.provider} · ${connection.model}`:'NoteFlow AI · 20 operations per day'}</strong></p>
    <p>Connect your own key for no NoteFlow daily AI cap. Your provider’s limits and charges still apply. Request-rate, source-size and YouTube import limits remain in place. A personal key does not automatically improve accuracy.</p>
    {connection && !connection.enabled ? <p role="status">Personal connections will be available after the site owner completes secure key-storage setup.</p> : <form onSubmit={e=>{e.preventDefault();void change();}}>
      <label>Provider<select value={provider} disabled={locked||!connection} onChange={e=>{setProvider(e.target.value);setKey('');setUseSaved(true);resetCatalog();}}><option value="gemini">Gemini</option><option value="groq">Groq</option><option value="openrouter">OpenRouter</option></select></label>
      {connection?.mode==='personal'&&connection.provider===provider&&<label className="ai-consent"><input type="checkbox" checked={useSaved} disabled={locked} onChange={e=>{setUseSaved(e.target.checked);setKey('');resetCatalog();}}/><span>Use my saved API key</span></label>}
      {!saved&&<>
        <label>API key<input type="password" autoComplete="off" spellCheck={false} required minLength={20} maxLength={512} value={key} disabled={locked} onChange={e=>{setKey(e.target.value);resetCatalog();}} /></label>
        <p><a href={provider==='gemini'?'https://aistudio.google.com/apikey':provider==='groq'?'https://console.groq.com/keys':'https://openrouter.ai/settings/keys'} target="_blank" rel="noreferrer">Create a key with {provider}</a>.</p>
      </>}
      <div className="ai-settings-actions"><button type="button" className="secondary" disabled={locked||!connection||(!saved&&key.trim().length<20)} onClick={()=>void loadModels()}>{loading?'Loading models…':models?'Refresh models':'Load available models'}</button></div>
      <p id="model-catalog-help">Loads text-generation models from your provider using this key. Listing does not guarantee remaining quota or compatibility. We test your selection before saving.</p>
      {models!==undefined&&<>
        {models.length>0?<>
          <label>Search models<input type="search" value={search} disabled={locked} onChange={e=>{setSearch(e.target.value);setModel('');}} placeholder="Search by name or model ID" /></label>
          {provider==='openrouter'&&<label className="ai-consent"><input type="checkbox" checked={freeOnly} disabled={locked} onChange={e=>{setFreeOnly(e.target.checked);setModel('');}}/><span>Show models with free input and output pricing</span></label>}
          <label>Model<select aria-label="Model" value={model} required disabled={locked||visible.length===0} aria-describedby="model-catalog-help" onChange={e=>setModel(e.target.value)}><option value="">Choose a model</option>{visible.map(m=><option key={m.id} value={m.id}>{m.name===m.id?m.id:`${m.name} — ${m.id}`}{m.free===true?' · Free':m.free===false?' · Paid':''}</option>)}</select></label>
          <p role="status">{visible.length?`${visible.length} models listed.`:'No models match your filters. Clear the search or free-pricing filter.'}{selected?.contextWindow?` Selected model context: ${selected.contextWindow.toLocaleString()} tokens.`:''}</p>
        </>:<p role="status">Your provider returned no supported text-generation models. Check the key’s model permissions or choose another provider.</p>}
      </>}
      <p>Stored encrypted on the server. Your source is sent to the selected provider. NoteFlow will not switch to its shared key if your personal key fails.</p>
      <label className="ai-consent"><input type="checkbox" checked={consent} disabled={locked} onChange={e=>setConsent(e.target.checked)} required /><span>I authorize a connection test, AI generation, source reviews and bounded automatic retries using this key. My provider may charge for requests, including retries.</span></label>
      <div className="ai-settings-actions"><button className="primary" disabled={locked||!consent||!connection||!selected}>{busy?'Checking connection…':saved?'Test and save model':'Test and connect'}</button>
      {connection?.mode==='personal'&&<button className="secondary" type="button" disabled={locked} onClick={()=>void change(true)}>Remove key and use NoteFlow AI</button>}</div>
    </form>}
    {message&&<p role="status">{message}</p>}
    <p>Changing your model or key stops queued tasks using the old connection. Saved summary parts remain; resume the task to continue. A request already sent may finish. Revoke a key at your provider to invalidate it everywhere.</p>
  </section>;
}
