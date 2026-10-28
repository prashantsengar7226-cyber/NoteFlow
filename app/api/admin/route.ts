export const runtime='nodejs';
export const dynamic='force-dynamic';
import { z } from 'zod';
import { guard, json, handleError, body, db, limited } from '@/lib/server';
import { requireAdmin, accessFor } from '@/lib/access';
import { vertexReady } from '@/lib/vertex';
import { schedulerConfigured } from '@/lib/ai-jobs';
import { AppError } from '@/lib/core';
import {freeGeminiCandidate} from '@/lib/free-ai';

const tables=['accounts','user_directory','user_access','notes','artifacts','messages','ai_jobs','ai_operations','vertex_budget','vertex_usage','cloud_cost_snapshots','cloud_cost_rows','billing_orders','billing_events','import_requests','admin_audit','operational_events'] as const;
const query=z.object({view:z.enum(['overview','users','jobs','events','audit','database']).default('overview'),page:z.coerce.number().int().min(0).max(10000).default(0),search:z.string().max(120).default(''),days:z.enum(['7','30']).default('7')});
const mutation=z.discriminatedUnion('action',[
  z.object({action:z.literal('access'),owner:z.string().uuid(),role:z.enum(['user','admin']),suspended:z.boolean(),revision:z.string().uuid().nullable(),reason:z.string().trim().min(8).max(300)}).strict(),
  z.object({action:z.enum(['retry','cancel']),jobId:z.string().uuid(),reason:z.string().trim().min(8).max(300)}).strict(),
]);
export async function GET(request:Request) {
  try {
    const owner=await guard(request); const access=await requireAdmin(owner);
    await limited('admin-read:'+owner,90);
    const {view,page,search,days:daysParam}=query.parse(Object.fromEntries(new URL(request.url).searchParams));
    const database=db(), offset=page*40, pattern=`%${search.replace(/[\\%_]/g,'\\$&')}%`;
    const all=async(sql:string,...args:unknown[])=>(await database.prepare(sql).bind(...args).all()).results;
    const one=async(sql:string,...args:unknown[])=>database.prepare(sql).bind(...args).first();
    let data:unknown;
    if(view==='overview') {
      const now=Date.now(),range=Number(daysParam),start=Math.floor(now/86400000)*86400000-(range-1)*86400000;
      const [totals,jobs,days,providers,lastScheduler,vertex,errors]=await Promise.all([
        one(`SELECT (SELECT COUNT(*) FROM (SELECT owner FROM accounts UNION SELECT owner FROM user_directory UNION SELECT owner FROM user_access)) AS users,
          (SELECT COUNT(*) FROM user_directory WHERE last_seen>?) AS active_users,
          (SELECT COUNT(*) FROM notes) AS notes,(SELECT COUNT(*) FROM ai_jobs WHERE state IN ('running','queued','retry')) AS active_jobs,
          (SELECT COUNT(*) FROM ai_jobs WHERE state='failed') AS failed_jobs,(SELECT COUNT(*) FROM user_access WHERE role IN ('admin','superuser') AND suspended=0) AS admins`,now-86400000),
        all('SELECT state,COUNT(*) AS count FROM ai_jobs GROUP BY state'),
        all("SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') AS day,COUNT(*) AS count FROM notes WHERE created_at>=? GROUP BY day ORDER BY day",start),
        all('SELECT source,COUNT(*) AS count FROM notes GROUP BY source'),
        one("SELECT MAX(created_at) AS last_seen FROM operational_events WHERE event='scheduler.accepted'"),
        all('SELECT project,day,daily_count,total_count FROM vertex_budget'),
        all('SELECT code,COUNT(*) AS count FROM operational_events WHERE created_at>? AND (status>=400 OR event=?) GROUP BY code ORDER BY count DESC LIMIT 8',now-86400000,'job.failed'),
      ]);
      const series=Array.from({length:range},(_,i)=>{const day=new Date(start+i*86400000).toISOString().slice(0,10);return {day,count:Number(days.find(row=>row.day===day)?.count||0)};});
      data={totals,jobs,days:series,sources:providers,lastScheduler,vertex,errors,health:{database:true,vertex:vertexReady(),scheduler:schedulerConfigured(),freeAI:!!freeGeminiCandidate(),transcripts:!!process.env.SUPADATA_API_KEY},window:`Activity: past 24 hours. Note trend: past ${range} calendar days (UTC), including today. Other totals are all-time. Vertex counts are provider attempts, not cost estimates.`};
    } else if(view==='users') {
      const union='(SELECT owner FROM accounts UNION SELECT owner FROM user_directory UNION SELECT owner FROM user_access)';
      data={rows:await all(`SELECT u.owner,d.email,d.display_name,d.first_seen,d.last_seen,COALESCE(a.role,'user') AS role,COALESCE(a.suspended,0) AS suspended,a.revision,
        (SELECT COUNT(*) FROM notes n WHERE n.owner=u.owner) AS notes FROM ${union} u LEFT JOIN user_directory d ON d.owner=u.owner LEFT JOIN user_access a ON a.owner=u.owner
        WHERE u.owner LIKE ? ESCAPE '\\' OR d.email LIKE ? ESCAPE '\\' ORDER BY COALESCE(d.last_seen,0) DESC,u.owner LIMIT 41 OFFSET ?`,pattern,pattern,offset)};
    } else if(view==='jobs') {
      data={rows:await all(`SELECT id,owner,state,completed_parts,total_parts,failures,error_code,created_at,updated_at,lease_until FROM ai_jobs WHERE owner LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' OR state LIKE ? ESCAPE '\\' ORDER BY created_at DESC,id LIMIT 41 OFFSET ?`,pattern,pattern,pattern,offset)};
    } else if(view==='events') {
      data={rows:await all(`SELECT id,actor,event,code,status,resource,created_at FROM operational_events WHERE event LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR actor LIKE ? ESCAPE '\\' ORDER BY created_at DESC,id LIMIT 41 OFFSET ?`,pattern,pattern,pattern,offset),retention:'30 days; recorded application events only. This is not a raw Vercel or Supabase log stream.'};
    } else if(view==='audit') {
      data={rows:await all(`SELECT id,actor,action,target,before_value,after_value,reason,created_at FROM admin_audit WHERE actor LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' ORDER BY created_at DESC,id LIMIT 41 OFFSET ?`,pattern,pattern,pattern,offset)};
    } else {
      await requireAdmin(owner,true);
      const counts=await Promise.all(tables.map(async table=>({table,...await one(`SELECT COUNT(*) AS count FROM ${table}`)})));
      const schema=await all("SELECT name,sql FROM sqlite_master WHERE type='table' AND name IN ("+tables.map(()=>'?').join(',')+") ORDER BY name",...tables);
      // Migration metadata may not exist in developer fixture databases.
      const migrationTable=await one("SELECT name FROM sqlite_master WHERE type='table' AND name='_noteflow_migrations'");
      data={counts,schema,migrations:migrationTable?await all('SELECT name FROM _noteflow_migrations ORDER BY name'):[],policy:'Read-only schema and counts. Sensitive credential tables and arbitrary SQL are not exposed. Migrations and backups run through the operator CLI.'};
    }
    return json({role:access.role,accountId:owner,view,page,data,refreshedAt:Date.now()});
  }catch(error){return handleError(error);}
}
export async function POST(request:Request) {
  try {
    const actor=await guard(request,true); await requireAdmin(actor);
    await limited('admin-write:'+actor,20);
    const input=mutation.parse(await body(request,2048));
    const database=db(),now=Date.now(),id=crypto.randomUUID();
    if(input.action==='access') {
      await requireAdmin(actor,true);
      if(input.owner===actor)throw new AppError(409,'PROTECTED_ACCOUNT','You cannot change your own access.');
      const known=await database.prepare('SELECT owner FROM user_directory WHERE owner=? UNION SELECT owner FROM accounts WHERE owner=? UNION SELECT owner FROM user_access WHERE owner=?').bind(input.owner,input.owner,input.owner).first();
      if(!known)return json({error:'This account has not joined the workspace yet.',code:'NOT_FOUND'},404);
      const before=await accessFor(input.owner);
      const changes=await database.batch([
        database.prepare(`INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at)
          SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE owner=? AND role='superuser' AND suspended=0)
          AND NOT EXISTS(SELECT 1 FROM user_access WHERE owner=? AND role='superuser')
          AND (SELECT revision FROM user_access WHERE owner=?) IS ?
          ON CONFLICT(owner) DO UPDATE SET role=excluded.role,suspended=excluded.suspended,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING owner`)
          .bind(input.owner,input.role,input.suspended?1:0,id,actor,now,actor,input.owner,input.owner,input.revision),
        database.prepare(`INSERT INTO admin_audit(id,actor,action,target,before_value,after_value,reason,created_at)
          SELECT ?,?,'access.changed',?,?,?,?,? WHERE EXISTS(SELECT 1 FROM user_access WHERE owner=? AND revision=?)`)
          .bind(id,actor,input.owner,JSON.stringify(before),JSON.stringify({role:input.role,suspended:input.suspended}),input.reason,now,input.owner,id),
      ]);
      if(!changes[0].results.length)return json({error:'Access changed or the account is protected. Refresh and try again.',code:'CONFLICT'},409);
    } else {
      const job=await database.prepare('SELECT id,owner,state,note_id FROM ai_jobs WHERE id=?').bind(input.jobId).first<{id:string;owner:string;state:string;note_id:string}>();
      if(!job)return json({error:'Task not found.',code:'NOT_FOUND'},404);
      // Atomic authorization and lease/state checks. An administrator cannot
      // overwrite an active worker or revive a task alongside a newer task.
      const auth="EXISTS(SELECT 1 FROM user_access WHERE owner=? AND role IN ('admin','superuser') AND suspended=0)";
      const state=input.action==='cancel'?'cancelled':'queued';
      const stmt=input.action==='cancel'
        ? database.prepare(`UPDATE ai_jobs SET state='cancelled',lease_token=NULL,lease_until=0,updated_at=? WHERE id=? AND state IN ('queued','retry','running') AND ${auth} RETURNING id`).bind(now,job.id,actor)
        : database.prepare(`UPDATE ai_jobs SET state='queued',failures=0,error_code=NULL,next_at=?,updated_at=?,lease_token=NULL,lease_until=0,
          credential_revision=COALESCE((SELECT revision FROM ai_credentials WHERE owner=ai_jobs.owner),'shared')
          WHERE id=? AND state IN ('failed','cancelled') AND lease_until<=? AND ${auth}
          AND NOT EXISTS(SELECT 1 FROM ai_jobs newer WHERE newer.note_id=? AND newer.state IN ('queued','retry','running'))
          AND NOT EXISTS(SELECT 1 FROM user_access WHERE owner=ai_jobs.owner AND suspended=1) RETURNING id`).bind(now,now,job.id,now,actor,job.note_id);
      const changed=await database.batch([stmt,
        database.prepare(`INSERT INTO admin_audit(id,actor,action,target,before_value,after_value,reason,created_at)
          SELECT ?,?,?,?,?,?,?,? WHERE changes()>0`).bind(id,actor,'job.'+input.action,job.id,job.state,state,input.reason,now),
        database.prepare("UPDATE ai_operations SET state='released' WHERE owner=? AND id=? AND state='reserved' AND EXISTS(SELECT 1 FROM ai_jobs WHERE id=? AND state='cancelled')").bind(job.owner,job.id,job.id),
      ]);
      if(!changed[0].results.length)return json({error:'The task is running, already changed, or cannot be retried. Refresh its state.',code:'CONFLICT'},409);
    }
    return json({ok:true});
  }catch(error){return handleError(error);}
}
