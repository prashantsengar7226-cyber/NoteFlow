'use client';
import {useEffect,useState} from 'react';
import {Download,RefreshCw,ExternalLink} from 'lucide-react';
type Row=Record<string,string|number|null>;
type Report={scope:'all'|'own';month:string;totals:Row;lifetime:Row;daily:Row[];people:Row[];models:Row[];policy:string;
  billing:{configured:boolean;snapshot:Row|null;rows:Row[]}};
const money=(v:unknown,currency='USD')=>new Intl.NumberFormat(undefined,{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:6}).format(Number(v||0));
const count=(v:unknown)=>Number(v||0).toLocaleString();
const when=(v:unknown)=>typeof v==='number'?new Date(v).toLocaleString():'Not recorded';
function currencyTotals(rows:Row[]){
  const totals=new Map<string,{currency:string;cost:number;credits:number}>();
  for(const r of rows){const currency=String(r.currency),v=totals.get(currency)||{currency,cost:0,credits:0};v.cost+=Number(r.cost);v.credits+=Number(r.credits);totals.set(currency,v);}
  return [...totals.values()];
}
export function AdminCosts({superuser,live,refresh=0}:{superuser:boolean;live:boolean;refresh?:number}){
  const [month,setMonth]=useState(new Date().toISOString().slice(0,7)),[report,setReport]=useState<Report|null>(null);
  const [error,setError]=useState(''),[syncing,setSyncing]=useState(false),[message,setMessage]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))return;
    const controller=new AbortController();let pending=false;
    const load=async()=>{if(pending)return;pending=true;try{
      const r=await fetch('/api/admin/costs?'+new URLSearchParams({month}),{signal:controller.signal,cache:'no-store'});
      const data=await r.json();if(!r.ok){if(r.status===401||r.status===403)setReport(null);throw new Error(data.error||'Cost data is unavailable.');}
      if(!controller.signal.aborted){setReport(data);setError('');}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Refresh failed.');}finally{pending=false;}};
    void load();const interval=setInterval(()=>{if(live&&!document.hidden)void load();},10000);
    return()=>{controller.abort();clearInterval(interval);};
  },[month,revision,live,refresh]);
  async function sync(){
    setSyncing(true);setMessage('');try{
      const r=await fetch('/api/admin/costs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({month})});
      const data=await r.json();if(!r.ok)throw new Error(data.error||'Billing sync failed.');
      setMessage('Billing export refreshed. Google may still be processing recent usage.');setRevision(v=>v+1);
    }catch(e){setMessage(e instanceof Error?e.message:'Billing sync failed.');}finally{setSyncing(false);}
  }
  function download(){if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`noteflow-vertex-costs-${report.month}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const totals=report?.totals,days=report?.daily||[],max=Math.max(.000001,...days.map(r=>Number(r.estimated_usd)));
  const actual=currencyTotals(report?.billing.rows||[]),hasSnapshot=!!report?.billing.snapshot;
  const byAdmin=new Map<string,Row[]>();for(const row of report?.billing.rows||[]){const key=String(row.owner||'unattributed');byAdmin.set(key,[...(byAdmin.get(key)||[]),row]);}
  return <div className="admin-costs">
    <div className="admin-cost-toolbar"><label className="admin-range">Usage month (UTC)<input type="month" value={month} onChange={e=>{setMonth(e.target.value);setReport(null);setMessage('');}} min="2020-01" max="2099-12"/></label><button onClick={()=>setRevision(v=>v+1)} aria-label="Refresh cost data"><RefreshCw size={16}/>Refresh</button><button onClick={download} disabled={!report}><Download size={16}/>Export cost report</button></div>
    <p className="admin-help">{superuser?'All recorded Vertex spending, with individual account attribution.':'Only your own Vertex usage and attributed charges are shown.'} Administrator usage remains uncapped.</p>
    {error&&<p className="admin-alert" role="alert">{error}</p>}
    {!report&&!error&&<p role="status">Loading cost records…</p>}
    {report&&<>
      <section className="admin-section"><div className="admin-section-head"><div><h2>Recorded Vertex usage</h2><p>Selected month · Estimates before credits and taxes</p></div><span className="admin-role">USD estimate</span></div>
        <dl className="admin-cost-metrics"><div><dt>Estimated model cost</dt><dd>{money(totals?.estimated_usd)}</dd></div><div><dt>Provider requests</dt><dd>{count(totals?.attempts)}</dd></div><div><dt>Requests with unknown cost</dt><dd>{count(totals?.unpriced)}</dd></div></dl>
        {!!Number(totals?.unpriced)&&<p className="admin-alert">The estimate excludes {count(totals?.unpriced)} requests with missing usage, an unknown outcome or an unsupported price. Their cost is unknown, not zero. {count(totals?.pending)} are pending.</p>}
        <div className="admin-cost-token-line"><span>Input: <strong>{count(totals?.input_tokens)}</strong> tokens</span><span>Output: <strong>{count(totals?.output_tokens)}</strong></span><span>Thinking: <strong>{count(totals?.thinking_tokens)}</strong></span></div>
        <p>Since tracking began: <strong>{money(report.lifetime.estimated_usd)}</strong> estimated across {count(report.lifetime.attempts)} requests; {count(report.lifetime.unpriced)} unpriced. Started {when(report.lifetime.tracked_since)}. Earlier requests cannot be reconstructed from attempt counts.</p>
      </section>
      <div className="admin-columns"><section className="admin-section"><h2>Daily estimated spend</h2><p>Recorded days in {month} · USD</p>
        {days.length?<><svg className="admin-cost-chart" viewBox="0 0 600 200" role="img" aria-label={`Daily estimated Vertex spend for ${month}; exact values follow in the table`}><title>Daily estimated Vertex cost</title><line x1="10" y1="166" x2="590" y2="166" stroke="#dce3ed"/>{days.map((r,i)=>{const w=560/days.length,h=Number(r.estimated_usd)/max*130;return <g key={String(r.day)}><rect x={20+i*w} y={166-h} width={Math.max(2,w-6)} height={h} fill="#245cf5" rx="2"><title>{String(r.day)}: {money(r.estimated_usd)}</title></rect>{(i===0||i===days.length-1)&&<text x={20+i*w} y="190">{String(r.day).slice(5)}</text>}</g>;})}</svg><details className="admin-chart-data"><summary>View daily costs and requests</summary><table><thead><tr><th>Date</th><th>Estimate (USD)</th><th>Requests</th><th>Unpriced</th></tr></thead><tbody>{days.map(r=><tr key={String(r.day)}><td>{r.day}</td><td>{money(r.estimated_usd)}</td><td>{count(r.attempts)}</td><td>{count(r.unpriced)}</td></tr>)}</tbody></table></details></>:<p className="admin-empty-state">No metered Vertex requests in this month.</p>}
      </section><section className="admin-section"><h2>Models used</h2><p>Standard text generation, including source reviews</p><div className="admin-table-wrap"><table><thead><tr><th>Model</th><th>Requests</th><th>Estimate (USD)</th></tr></thead><tbody>{report.models.map(r=><tr key={String(r.model)}><td><code>{r.model}</code></td><td>{count(r.attempts)}</td><td>{money(r.estimated_usd)}</td></tr>)}{!report.models.length&&<tr><td colSpan={3}>No usage recorded.</td></tr>}</tbody></table></div></section></div>
      {superuser&&<section className="admin-section"><h2>Spending by administrator</h2><p>Includes historical usage from accounts whose roles later changed.</p><div className="admin-table-wrap"><table><thead><tr><th>Account</th><th>Requests</th><th>Input / output tokens</th><th>Estimate (USD)</th><th>Unpriced</th></tr></thead><tbody>{report.people.map(r=><tr key={String(r.owner)}><td><strong>{r.email||'Email not recorded'}</strong><code>{r.owner}</code></td><td>{count(r.attempts)}</td><td>{count(r.input_tokens)} / {count(Number(r.output_tokens)+Number(r.thinking_tokens))}</td><td>{money(r.estimated_usd)}</td><td>{count(r.unpriced)}</td></tr>)}{!report.people.length&&<tr><td colSpan={5}>Individual spending appears after the first metered request.</td></tr>}</tbody></table></div></section>}
      <section className="admin-section"><div className="admin-section-head"><div><h2>Google Cloud charges</h2><p>Billing export · Separate from the estimates above</p></div>{superuser&&<button disabled={syncing||!report.billing.configured} onClick={sync}><RefreshCw size={16}/>{syncing?'Syncing…':'Sync billing export'}</button>}</div>
        {!report.billing.configured?<div className="admin-setup-note"><strong>Billing export is not connected</strong><p>{hasSnapshot?'Previously synced charges are shown below. Refreshing billing charges is unavailable until the export is connected.':'Actual charges are unavailable.'} {superuser?'Enable the standard usage-cost export in Google Cloud Billing, then connect its BigQuery table using the setup guide.':'Ask the superuser to connect the billing export.'}</p>{superuser&&<a href="https://console.cloud.google.com/billing" target="_blank" rel="noreferrer">Open Google Cloud Billing <ExternalLink size={14}/></a>}</div>:null}
        {!hasSnapshot?<p>No billing snapshot for this month. {superuser?'Sync the export to load reported charges.':'The superuser can sync the export.'}</p>:<>
          <p>Last synced {when(report.billing.snapshot?.synced_at)}. Latest exported record: {String(report.billing.snapshot?.export_through||'No records in this period')}. Values can change as Google reports usage and adjustments.</p>
          <div className="admin-table-wrap"><table><thead><tr><th>Currency</th><th>Gross charges</th><th>Credits</th><th>Net reported cost</th></tr></thead><tbody>{actual.map(r=><tr key={r.currency}><td>{r.currency}</td><td>{money(r.cost,r.currency)}</td><td>{money(r.credits,r.currency)}</td><td><strong>{money(r.cost+r.credits,r.currency)}</strong></td></tr>)}{!actual.length&&<tr><td colSpan={4}>No attributed billing records returned. This does not prove recent usage was free.</td></tr>}</tbody></table></div>
          {superuser&&<><h3>Reported charges by account</h3><div className="admin-table-wrap"><table><thead><tr><th>Account attribution</th><th>Currency</th><th>Gross</th><th>Credits</th><th>Net</th></tr></thead><tbody>{[...byAdmin].flatMap(([owner,rows])=>currencyTotals(rows).map(r=><tr key={owner+r.currency}><td>{owner==='unattributed'?'Unattributed / older project usage':<code>{owner}</code>}</td><td>{r.currency}</td><td>{money(r.cost,r.currency)}</td><td>{money(r.credits,r.currency)}</td><td>{money(r.cost+r.credits,r.currency)}</td></tr>))}</tbody></table></div></>}
        </>}{message&&<p role="status" className="admin-setup-note">{message}</p>}
        <p className="admin-help">{report.policy} Exported charges cover Vertex in the configured project and usage month, not the entire billing account or a final invoice. Taxes and unrelated Google services are excluded. Estimates and reported charges must not be added together.</p>
      </section>
    </>}
  </div>;
}
