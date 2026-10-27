import {createClient} from '@libsql/client';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
const owner=process.argv[2];
if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(owner||''))throw new Error('Usage: node scripts/bootstrap-superuser.mjs <confirmed Supabase UUID>');
const client=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
try {
  const now=Date.now(),id=crypto.randomUUID();
  const result=await client.batch([
    {sql:`INSERT INTO user_access(owner,role,suspended,revision,updated_by,updated_at) SELECT ?,'superuser',0,?,'operator-bootstrap',? WHERE NOT EXISTS(SELECT 1 FROM user_access WHERE role='superuser')
      ON CONFLICT(owner) DO UPDATE SET role='superuser',suspended=0,revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at RETURNING owner`,args:[owner,id,now]},
    {sql:`INSERT INTO admin_audit(id,actor,action,target,before_value,after_value,reason,created_at) SELECT ?,'operator-bootstrap','superuser.bootstrap',?,'unassigned','superuser','Initial owner approved during setup',? WHERE EXISTS(SELECT 1 FROM user_access WHERE owner=? AND revision=?)`,args:[id,owner,now,owner,id]},
  ],'write');
  if(!result[0].rows.length){const row=await client.execute({sql:"SELECT owner FROM user_access WHERE owner=? AND role='superuser' AND suspended=0",args:[owner]});if(!row.rows.length)throw new Error('A superuser already exists. Bootstrap cannot grant another one.');console.log('Confirmed existing superuser: '+owner);}
  else console.log('Initial superuser configured: '+owner);
}finally{client.close();}
