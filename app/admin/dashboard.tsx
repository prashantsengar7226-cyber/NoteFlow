'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Activity, ArrowLeft, Coins, Database, FileClock, LayoutDashboard, ListChecks, Pause, Play, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import type { Role } from '@/lib/access';
import {AdminOverview} from './overview';
import {AdminCosts} from './costs';
import {SidebarToggle, useSidebarPreference} from '../sidebar-toggle';
type View='costs'|'overview'|'users'|'jobs'|'events'|'audit'|'database';
type Row=Record<string,string|number|null>;
type Payload={role:Role;accountId:string;refreshedAt:number;data:{rows?:Row[];totals?:Row;jobs?:Row[];days?:Row[];sources?:Row[];errors?:Row[];vertex?:Row[];lastScheduler?:Row;health?:Record<string,boolean>;window?:string;counts?:Row[];schema?:Row[];migrations?:Row[];policy?:string;retention?:string}};
const sections=[{id:'costs',label:'Vertex costs',icon:Coins},{id:'overview',label:'Overview',icon:LayoutDashboard},{id:'users',label:'People & roles',icon:Users},{id:'jobs',label:'Summary jobs',icon:ListChecks},{id:'events',label:'Live events',icon:Activity},{id:'audit',label:'Audit history',icon:FileClock},{id:'database',label:'Database',icon:Database}] as const;
const date=(v:unknown)=>typeof v==='number'&&v>0?new Date(v).toLocaleString():'Not recorded';
const value=(v:unknown)=>v===null||v===undefined?'—':String(v);
export default function AdminDashboard({role,owner}:{role:Role;owner:string}) {
  const sidebar = useSidebarPreference('admin');
  const [view,setView]=useState<View>('overview'),[search,setSearch]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(0);
  const [range,setRange]=useState('7');
  const [data,setData]=useState<Payload|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[live,setLive]=useState(true),[refresh,setRefresh]=useState(0);
  const [selected,setSelected]=useState<{row:Row;action:'access'|'retry'|'cancel'}|null>(null),[newRole,setNewRole]=useState('user'),[suspended,setSuspended]=useState(false),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[actionError,setActionError]=useState(''),[notice,setNotice]=useState('');
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const timer=setTimeout(()=>{setQuery(search);setPage(0);},300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{
    if(view==='costs'){setLoading(false);setError('');return;}
    const controller=new AbortController();let pending=false;
    const load=async()=>{
      if(pending||controller.signal.aborted)return;pending=true;setLoading(true);
      try {
        const r=await fetch(`/api/admin?${new URLSearchParams({view,page:String(page),search:query,days:range})}`,{signal:controller.signal,cache:'no-store'});
        const x=await r.json();if(!r.ok){if(r.status===401||r.status===403)setData(null);throw new Error(x.error||'Administration is unavailable.');}
        if(!controller.signal.aborted){setData(x);setError('');}
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Refresh failed.');}
      finally{pending=false;if(!controller.signal.aborted)setLoading(false);}
    };
    void load();const timer=setInterval(()=>{if(live&&!document.hidden&&!dialog.current?.open)void load();},10000);
    return()=>{controller.abort();clearInterval(timer);};
  },[view,page,query,live,refresh,range]);
  function navigate(next:View,term=''){setView(next);setPage(0);setSearch(term);setQuery(term);setData(null);setNotice('');}
  function edit(row:Row,action:'access'|'retry'|'cancel') {setSelected({row,action});setNewRole(String(row.role||'user'));setSuspended(!!row.suspended);setReason('');setActionError('');dialog.current?.showModal();}
  async function submit(e:React.FormEvent) {
    e.preventDefault();if(!selected||saving)return;setSaving(true);setActionError('');
    const payload=selected.action==='access'?{action:'access',owner:selected.row.owner,role:newRole,suspended,revision:selected.row.revision??null,reason}:{action:selected.action,jobId:selected.row.id,reason};
    try {const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const x=await r.json();if(!r.ok)throw new Error(x.error||'The action failed.');dialog.current?.close();setNotice('Change saved and recorded in the audit history.');setRefresh(n=>n+1);}
    catch(e){setActionError(e instanceof Error?e.message:'The action failed.');}finally{setSaving(false);}
  }
  function download() {const visible=data?{...data,data:{...data.data,...(data.data.rows?{rows:data.data.rows.slice(0,40)}:{})}}:{};const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),view,...visible},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`noteflow-${view}-visible-page.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const d=data?.data,rows=d?.rows?.slice(0,40)||[],title=sections.find(s=>s.id===view)!.label;
  return <div className={`admin-app ${sidebar.collapsed ? 'admin-sidebar-collapsed' : ''}`}>
    <a href="#admin-main" className="admin-skip">Skip to administration</a>
    <aside id="admin-navigation" className="admin-rail"><Link href="/" className="admin-brand">noteflow<span>.</span></Link><p className="admin-product-label">Administration</p><nav aria-label="Administration sections">{sections.filter(s=>s.id!=='database'||role==='superuser').map(s=><button key={s.id} aria-current={view===s.id?'page':undefined} onClick={()=>navigate(s.id)}><s.icon size={18}/>{s.label}</button>)}</nav><div className="admin-identity"><ShieldCheck size={20}/><strong>{role==='superuser'?'Superuser':'Administrator'}</strong><span>Signed-in account</span><code>{owner}</code><Link href="/"><ArrowLeft size={16}/>Back to workspace</Link></div></aside>
    <main id="admin-main" className="admin-main"><header className="admin-header"><div><h1>{title}</h1><p>{view==='costs'?'Understand model usage, estimated spend and reported Google charges.':view==='users'?'Know who has access and what they can do.':view==='jobs'?'Monitor saved work and recover interrupted tasks.':view==='events'?'Application activity, refreshed every 10 seconds.':view==='audit'?'An append-only record of administrative changes.':view==='database'?'Inspect storage structure and migration status.':'Your workspace operations at a glance.'}</p></div><div className="admin-live-controls"><SidebarToggle collapsed={sidebar.collapsed} toggle={sidebar.toggle} controls="admin-navigation"/><button aria-pressed={live} onClick={()=>setLive(v=>!v)}>{live?<Pause size={15}/>:<Play size={15}/>} {live?'Pause updates':'Resume updates'}</button><button disabled={loading} onClick={()=>setRefresh(n=>n+1)} aria-label="Refresh dashboard"><RefreshCw size={16}/></button></div></header>
      {view!=='costs'&&<div className="admin-status"><span className={error?'status-warn':'status-ready'}>{error?'Refresh unavailable':loading?'Refreshing…':live?'Auto refresh on':'Updates paused'}</span><span>Updated {data?date(data.refreshedAt):'—'}</span></div>}
      {error&&<div className="admin-alert" role="alert">{error} {data&&'Showing the last successful result.'}</div>}{notice&&<p className="admin-notice" role="status">{notice}</p>}
      {view!=='costs'&&!data&&!error?<p role="status" className="admin-loading">Loading administration…</p>:null}
      {view==='costs'&&<AdminCosts superuser={role==='superuser'} live={live} refresh={refresh}/>}
      {d&&view==='overview'&&<AdminOverview data={d} range={range} onRange={setRange} onView={navigate}/>}
      {d&&['users','jobs','events','audit'].includes(view)&&<>
        <div className="admin-toolbar"><label><Search size={17}/><span className="sr-only">Search administration</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={view==='users'?'Find by email or account ID…':view==='jobs'?'Find by state, job or account ID…':'Find by event, code or account ID…'}/></label><button onClick={download}>Export visible page</button></div>
        {view==='users'&&<p className="admin-help">{role==='superuser'?'Only you can appoint admins or suspend accounts. Superuser accounts are protected.':'Only a superuser can change roles or suspend accounts.'} Email addresses appear after the user next accesses the app.</p>}
        {view==='events'&&<p className="admin-help">{d.retention} Request acceptance does not mean processing completed.</p>}
        <div className="admin-table-wrap"><table>
          <thead><tr>{(view==='users'?['Account','Role','Status','Notes','Last active','Action']:view==='jobs'?['Task / account','State','Progress','Error','Updated','Action']:view==='events'?['Time','Event','Code / status','Account','Resource']:['Time','Actor','Action / target','Change','Reason']).map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rows.map(r=><tr key={value(r.id||r.owner)}>
            {view==='users'?<><td><strong>{value(r.email||'Email not recorded yet')}</strong><code>{value(r.owner)}</code></td><td><span className={`admin-role role-${r.role}`}>{value(r.role)}</span></td><td>{r.suspended?'Suspended':'Active'}</td><td>{value(r.notes)}</td><td>{date(r.last_seen)}</td><td>{role==='superuser'&&r.role!=='superuser'?<button onClick={()=>edit(r,'access')}>Manage access</button>:<span className="admin-muted">{r.role==='superuser'?'Protected':'View only'}</span>}</td></>:
            view==='jobs'?<><td><code>{value(r.id)}</code><small>{value(r.owner)}</small></td><td><span className={`admin-role state-${r.state}`}>{value(r.state)}</span></td><td><progress aria-label="Completed summary parts" value={Number(r.completed_parts||0)} max={Math.max(1,Number(r.total_parts||0))}/><small>{value(r.completed_parts)} / {value(r.total_parts)} parts</small></td><td><code>{value(r.error_code)}</code></td><td>{date(r.updated_at)}</td><td>{['failed','cancelled'].includes(String(r.state))?<button onClick={()=>edit(r,'retry')} disabled={Number(r.lease_until)>Date.now()}>Retry task</button>:['queued','retry','running'].includes(String(r.state))?<button onClick={()=>edit(r,'cancel')}>Cancel task</button>:<span className="admin-muted">Complete</span>}</td></>:
            view==='events'?<><td>{date(r.created_at)}</td><td>{value(r.event)}</td><td>{value(r.code)} {value(r.status)}</td><td><code>{value(r.actor)}</code></td><td><code>{value(r.resource)}</code></td></>:
            <><td>{date(r.created_at)}</td><td><code>{value(r.actor)}</code></td><td><strong>{value(r.action)}</strong><code>{value(r.target)}</code></td><td><details><summary>View change</summary><p>Before: {value(r.before_value)}</p><p>After: {value(r.after_value)}</p></details></td><td>{value(r.reason)}</td></>}
          </tr>)}{!rows.length&&<tr><td colSpan={6} className="admin-empty">{query?'No matches. Try another search.':'No records to show yet.'}</td></tr>}</tbody></table></div>
        <nav className="admin-pagination" aria-label="Administration pages"><button disabled={page===0} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page+1} · {rows.length} records</span><button disabled={(d.rows?.length||0)<=40} onClick={()=>setPage(n=>n+1)}>Next</button></nav>
      </>}
      {d&&view==='database'&&<><p className="admin-help">{d.policy}</p><section className="admin-section"><div className="admin-section-head"><h2>Table inventory</h2><button onClick={download}>Export schema report</button></div><div className="admin-table-wrap"><table><thead><tr><th>Table</th><th>Rows</th><th>Schema</th></tr></thead><tbody>{d.counts?.map(r=><tr key={value(r.table)}><td><code>{value(r.table)}</code></td><td>{value(r.count)}</td><td><details><summary>View structure</summary><pre>{value(d.schema?.find(s=>s.name===r.table)?.sql)}</pre></details></td></tr>)}</tbody></table></div></section><section className="admin-section"><h2>Applied migrations</h2>{d.migrations?.length?<ul>{d.migrations.map(r=><li key={value(r.name)}><code>{value(r.name)}</code></li>)}</ul>:<p>No migration ledger is recorded for this database.</p>}<p>Back up the database before applying migrations. Database exports and restore are handled through the secured operator CLI.</p></section></>}
    </main>
    <dialog ref={dialog} className="admin-dialog" onCancel={e=>{if(saving)e.preventDefault();}}><form onSubmit={submit}><div className="admin-section-head"><h2>{selected?.action==='access'?'Manage account access':selected?.action==='retry'?'Retry summary task':'Cancel summary task'}</h2><button type="button" disabled={saving} aria-label="Close action" onClick={()=>dialog.current?.close()}><X size={18}/></button></div><p>{selected?.action==='access'?'Changes take effect on subsequent server requests. Admin access includes paid Vertex use without NoteFlow usage allowances.':'Saved source material and completed summary parts are preserved. A retry uses the account’s current AI connection.'}</p><code>{value(selected?.row.owner)}{selected?.action!=='access'&&<><br/>{value(selected?.row.id)}</>}</code>{selected?.action==='access'&&<><label>Account role<select value={newRole} onChange={e=>setNewRole(e.target.value)}><option value="user">User</option><option value="admin">Administrator</option></select></label><label className="admin-checkbox"><input type="checkbox" checked={suspended} onChange={e=>setSuspended(e.target.checked)}/>Suspend this account</label></>}<label>Reason for this change<textarea required minLength={8} maxLength={300} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe why this change is needed"/></label>{actionError&&<p role="alert" className="admin-alert">{actionError}</p>}<div className="admin-dialog-actions"><button type="button" disabled={saving} onClick={()=>dialog.current?.close()}>Keep unchanged</button><button className="admin-primary" disabled={saving||reason.trim().length<8}>{saving?'Saving…':'Confirm change'}</button></div></form></dialog>
  </div>;
}
