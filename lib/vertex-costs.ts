import {createHash} from 'node:crypto';
import {env} from './platform';
import {AppError} from './core';
import {requireAdmin} from './access';
import {googleAccessToken} from './google-auth';
import {providerFetch,providerJson} from './provider';

const vars=()=>env as unknown as Record<string,string|undefined>;
export const costOwnerLabel=(owner:string)=>createHash('sha256').update('noteflow:'+owner).digest('hex').slice(0,24);
const tokenCount=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0?v:null;
/** Standard text generation list-price estimate; invoices/credits remain separate.
 * Unknown models or missing metadata stay unknown rather than becoming $0. */
export function vertexEstimate(model:string,location:string,metadata:unknown,at=Date.now()) {
  const m=metadata as Record<string,unknown>|undefined;
  const input=tokenCount(m?.promptTokenCount),output=tokenCount(m?.candidatesTokenCount);
  const cached=m?.cachedContentTokenCount===undefined?0:tokenCount(m.cachedContentTokenCount);
  const thinking=m?.thoughtsTokenCount===undefined?0:tokenCount(m.thoughtsTokenCount);
  let rates:number[]|undefined;
  if(model==='gemini-3.5-flash')rates=[1.5,9,.15];
  if(model==='gemini-3.5-flash-lite')rates=[.3,2.5,.03];
  if(model==='gemini-3.1-flash-lite')rates=[.25,1.5,.025];
  if(/^gemini-3\.[678]-flash$/.test(model))rates=at<Date.UTC(2027,0,1)?[.75,3.75,.075]:[1.5,7.5,.15];
  const known=input!==null&&output!==null&&cached!==null&&thinking!==null&&cached<=input&&rates;
  const usd=known&&rates?((input-cached)*rates[0]+cached*rates[2]+(output+thinking)*rates[1])*(location==='global'?1:1.1)/1e6:null;
  return {input,output,cached,thinking,usd,version:usd===null?null:'google-standard-text-2026-10-28'};
}
export async function startVertexUsage(input:{owner:string;project:string;model:string;location:string;feature:string;operationId?:string}) {
  const id=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare(`INSERT INTO vertex_usage(id,owner,owner_label,project,model,location,feature,operation_id,state,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,'pending',?,?)`).bind(id,input.owner,costOwnerLabel(input.owner),input.project,input.model,input.location,input.feature,input.operationId??null,now,now).run();
  return id;
}
export async function finishVertexUsage(id:string,model:string,location:string,metadata:unknown,state='responded') {
  const usage=vertexEstimate(model,location,metadata);
  await env.DB.prepare(`UPDATE vertex_usage SET state=?,input_tokens=?,cached_tokens=?,output_tokens=?,thinking_tokens=?,estimated_usd=?,pricing_version=?,updated_at=? WHERE id=?`)
    .bind(state,usage.input,usage.cached,usage.output,usage.thinking,usage.usd,usage.version,Date.now(),id).run();
}
export function costMonth(month:string) {
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw new AppError(400,'INVALID_MONTH','Choose a valid month.');
  const [year,m]=month.split('-').map(Number);
  return {start:Date.UTC(year,m-1,1),end:Date.UTC(year,m,1)};
}
export function billingExportConfig() {
  const v=vars(),table=v.CLOUD_BILLING_EXPORT_TABLE||'',project=v.VERTEX_PROJECT_ID||'',location=v.CLOUD_BILLING_EXPORT_LOCATION||'';
  if(!/^[a-z][a-z0-9-]{4,61}[a-z0-9]\.[A-Za-z_][A-Za-z0-9_]{0,1023}\.gcp_billing_export_v1_[A-Za-z0-9_]+$/.test(table)||
    !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)||!/^([A-Z]{2}|[a-z]+-[a-z]+[0-9])$/.test(location))return null;
  return {table,project,location,queryProject:table.split('.')[0]};
}
/** Authorization is repeated here so internal callers cannot broaden an admin's scope. */
export async function vertexCostReport(owner:string,month:string) {
  const access=await requireAdmin(owner),superuser=access.role==='superuser';
  const {start,end}=costMonth(month),filter=superuser?'':' AND u.owner=?',args=superuser?[]:[owner];
  const all=async(sql:string,...a:unknown[])=>(await env.DB.prepare(sql).bind(...a).all()).results;
  const aggregation=`COUNT(*) AS attempts,SUM(CASE WHEN estimated_usd IS NULL THEN 1 ELSE 0 END) AS unpriced,
    SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) AS pending,
    COALESCE(SUM(estimated_usd),0) AS estimated_usd,COALESCE(SUM(input_tokens),0) AS input_tokens,
    COALESCE(SUM(output_tokens),0) AS output_tokens,COALESCE(SUM(thinking_tokens),0) AS thinking_tokens`;
  const [totals,lifetime,daily,people,models,snapshots,billed]=await Promise.all([
    all(`SELECT ${aggregation} FROM vertex_usage u WHERE created_at>=? AND created_at<?${filter}`,start,end,...args),
    all(`SELECT ${aggregation},MIN(created_at) AS tracked_since FROM vertex_usage u WHERE 1=1${filter}`,...args),
    all(`SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') AS day,${aggregation} FROM vertex_usage u WHERE created_at>=? AND created_at<?${filter} GROUP BY day ORDER BY day`,start,end,...args),
    all(`SELECT u.owner,MAX(d.email) AS email,${aggregation} FROM vertex_usage u LEFT JOIN user_directory d ON d.owner=u.owner WHERE u.created_at>=? AND u.created_at<?${filter} GROUP BY u.owner ORDER BY estimated_usd DESC`,start,end,...args),
    all(`SELECT model,${aggregation} FROM vertex_usage u WHERE created_at>=? AND created_at<?${filter} GROUP BY model ORDER BY estimated_usd DESC`,start,end,...args),
    all('SELECT project,synced_at,export_through FROM cloud_cost_snapshots WHERE month=? AND project=?',month,vars().VERTEX_PROJECT_ID||''),
    all(`SELECT day,owner_label,currency,cost,credits FROM cloud_cost_rows WHERE month=? AND project=?${superuser?'':' AND owner_label=?'} ORDER BY day`,month,vars().VERTEX_PROJECT_ID||'',...(superuser?[]:[costOwnerLabel(owner)])),
  ]);
  // Label attribution survives role changes. Do not infer older unlabeled spend.
  const identities=superuser?await all('SELECT DISTINCT owner,owner_label FROM vertex_usage'): [{owner,owner_label:costOwnerLabel(owner)}];
  return {scope:superuser?'all':'own',month,totals:totals[0],lifetime:lifetime[0],daily,people,models,
    billing:{configured:!!billingExportConfig(),snapshot:snapshots[0]??null,rows:billed.map(r=>({...r,owner:identities.find(i=>i.owner_label===r.owner_label)?.owner??null}))},
    policy:'No administrator usage caps. Estimates are USD list prices before credits and taxes. Unknown usage is excluded from estimated totals. Google billing exports are delayed and may be adjusted.'};
}
export async function syncCloudCosts(owner:string,month:string) {
  await requireAdmin(owner,true);
  const c=billingExportConfig();if(!c)throw new AppError(503,'BILLING_EXPORT_SETUP','Connect the Google Cloud standard billing export before syncing actual charges.');
  const {start,end}=costMonth(month);
  const token=await googleAccessToken(true);
  // The table identifier is operator-configured and validated; all values are parameters.
  const sql=`SELECT FORMAT_DATE('%F',DATE(usage_start_time)) AS day,
    COALESCE((SELECT value FROM UNNEST(labels) WHERE key='noteflow_owner' LIMIT 1),'') AS owner_label,
    currency,SUM(cost) AS cost,SUM(IFNULL((SELECT SUM(amount) FROM UNNEST(credits)),0)) AS credits,
    MAX(CAST(export_time AS STRING)) AS export_through
    FROM \`${c.table}\` WHERE project.id=@project AND service.id='C7E2-9256-1C43'
      AND usage_start_time>=TIMESTAMP(@start) AND usage_start_time<TIMESTAMP(@end)
    GROUP BY day,owner_label,currency ORDER BY day,owner_label,currency`;
  const response=await providerFetch(`https://bigquery.googleapis.com/bigquery/v2/projects/${c.queryProject}/queries`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({query:sql,useLegacySql:false,location:c.location,timeoutMs:10000,maxResults:10000,
      maximumBytesBilled:'1000000000',requestId:crypto.randomUUID(),parameterMode:'NAMED',
      queryParameters:[['project',c.project],['start',new Date(start).toISOString()],['end',new Date(end).toISOString()]].map(([name,value])=>({name,parameterType:{type:'STRING'},parameterValue:{value}}))}),
  },'Cloud billing',20000).catch(error=>{
    if(error instanceof AppError && error.code==='MODEL_UNAVAILABLE')throw new AppError(503,'BILLING_EXPORT_PENDING','Google has not made the billing export table available yet. Initial export can take several hours. Existing charges are unchanged.');
    throw new AppError(503,'BILLING_SYNC_UNAVAILABLE','Billing export could not be read. Check export configuration and query permissions, then retry. Existing charges are unchanged.');
  });
  const data=await providerJson(response,2000000) as {jobComplete?:boolean;pageToken?:string;errors?:unknown[];rows?:{f:{v:unknown}[]}[];totalRows?:string};
  if(!data.jobComplete||data.pageToken||data.errors?.length||Number(data.totalRows||0)>10000)throw new AppError(503,'BILLING_SYNC_INCOMPLETE','The billing query did not return a complete result. Existing charges are unchanged. Check the export and try again.');
  const rows=(data.rows||[]).map(r=>{
    const [day,label,currency,gross,credit,through]=r.f.map(f=>f.v);
    if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day)||day.slice(0,7)!==month||typeof label!=='string'||
      !/^[a-z0-9_-]{0,63}$/.test(label)||typeof currency!=='string'||!/^[A-Z]{3}$/.test(currency)||
      gross===null||credit===null||!Number.isFinite(Number(gross))||!Number.isFinite(Number(credit)))throw new AppError(502,'BILLING_DATA_INVALID','Billing data could not be verified. Existing charges are unchanged.');
    return {day,label,currency,gross:Number(gross),credit:Number(credit),through:typeof through==='string'?through:null};
  });
  const now=Date.now(),exportThrough=rows.map(r=>r.through).filter((x):x is string=>!!x).sort().at(-1)??null;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM cloud_cost_rows WHERE project=? AND month=?').bind(c.project,month),
    ...rows.map(r=>env.DB.prepare('INSERT INTO cloud_cost_rows(project,month,day,owner_label,currency,cost,credits) VALUES(?,?,?,?,?,?,?)').bind(c.project,month,r.day,r.label,r.currency,r.gross,r.credit)),
    env.DB.prepare('INSERT INTO cloud_cost_snapshots(project,month,synced_at,export_through) VALUES(?,?,?,?) ON CONFLICT(project,month) DO UPDATE SET synced_at=excluded.synced_at,export_through=excluded.export_through').bind(c.project,month,now,exportThrough),
    env.DB.prepare("INSERT INTO admin_audit(id,actor,action,target,before_value,after_value,reason,created_at) VALUES(?,?,'costs.sync',?,'previous snapshot',?,'Refresh Google Cloud billing export',?)").bind(crypto.randomUUID(),owner,month,JSON.stringify({rows:rows.length}),now),
  ]);
  return {ok:true,rows:rows.length,syncedAt:now};
}
