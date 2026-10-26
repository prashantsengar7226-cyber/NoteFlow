// Read-only Turso export. Restore and migration rehearsal run in memory, never remotely.
import nextEnv from '@next/env';
import {DatabaseSync,constants} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const hash=value=>createHash('sha256').update(value).digest('hex');
const identifier=value=>'"'+value.replaceAll('"','""')+'"';

export function verifyBackup(sql,migrations){
  const db=new DatabaseSync(':memory:');
  // A downloaded SQL dump may describe data/schema, but cannot access other files.
  db.setAuthorizer((action,_first,second)=>
    [constants.SQLITE_ATTACH,constants.SQLITE_DETACH].includes(action)||
    (action===constants.SQLITE_FUNCTION&&second?.toLowerCase()==='load_extension')
      ?constants.SQLITE_DENY:constants.SQLITE_OK);
  try{
    db.exec(sql);
    if(db.isTransaction)throw new Error('Snapshot contains an unfinished transaction.');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Snapshot integrity check failed.');
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>r.name);
    if(!tables.includes('notes')||!tables.includes('_noteflow_migrations'))throw new Error('Not a migrated NoteFlow database.');
    const counts=Object.fromEntries(tables.map(name=>[name,db.prepare(`SELECT count(*) AS count FROM ${identifier(name)}`).get().count]));
    const applied=db.prepare('SELECT name,checksum FROM _noteflow_migrations ORDER BY name').all();
    if(applied.some(row=>!migrations.some(m=>m.name===row.name&&hash(m.sql)===row.checksum)))throw new Error('Applied migration checksum mismatch.');
    const pending=migrations.filter(m=>!applied.some(a=>a.name===m.name));
    for(const migration of pending){
      db.exec('BEGIN');
      db.exec(migration.sql);
      db.prepare('INSERT INTO _noteflow_migrations(name,checksum) VALUES(?,?)').run(migration.name,hash(migration.sql));
      db.exec('COMMIT');
    }
    for(const [name,count] of Object.entries(counts))
      if(name!=='_noteflow_migrations'&&db.prepare(`SELECT count(*) AS count FROM ${identifier(name)}`).get().count!==count)
        throw new Error('Migration rehearsal changed existing row counts.');
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').all().length)
      throw new Error('Migration rehearsal integrity check failed.');
    return {restored:true,integrity:'ok',foreignKeys:'ok',rowCounts:counts,applied:applied.map(r=>r.name),pending:pending.map(m=>m.name),migrationRehearsal:'passed'};
  }finally{db.close();}
}

async function main(){
  nextEnv.loadEnvConfig(process.cwd());
  const target=new URL(process.env.TURSO_DATABASE_URL);
  if(target.protocol!=='libsql:'||!target.hostname.endsWith('.turso.io')||target.username||target.password||target.port||target.search||target.hash||target.pathname&&target.pathname!=='/')
    throw new Error('Expected the configured Turso database URL.');
  if(!process.env.TURSO_AUTH_TOKEN)throw new Error('Database credentials missing.');
  const response=await fetch(`https://${target.hostname}/dump`,{headers:{authorization:`Bearer ${process.env.TURSO_AUTH_TOKEN}`},redirect:'manual',signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw new Error('Database export request failed.');
  const reader=response.body.getReader(),chunks=[];let bytes=0;
  while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>32*1024*1024){await reader.cancel();throw new Error('Snapshot exceeds bounded export size.');}chunks.push(value);}
  const sql=Buffer.concat(chunks).toString('utf8');
  const migrations=await Promise.all((await readdir('drizzle')).filter(n=>n.endsWith('.sql')).sort().map(async name=>({name,sql:await readFile('drizzle/'+name,'utf8')})));
  const stamp=new Date().toISOString().replaceAll(':','-').replaceAll('.','-');
  const path=`audit/production/database-${stamp}.sql`;
  await mkdir('audit/production',{recursive:true});
  await writeFile(path,sql,{flag:'wx',mode:0o600});
  const verification=verifyBackup(sql,migrations);
  const report={createdAt:new Date().toISOString(),databaseFingerprint:hash(target.hostname),backup:path,sha256:hash(sql),bytes,...verification,remoteChanges:false};
  await writeFile(path+'.json',JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify(report,null,2));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)
  main().catch(error=>{console.error(JSON.stringify({event:'database_backup_failed',code:error.code??'BACKUP_VALIDATION_FAILED',remoteChanges:false}));process.exitCode=1;});
