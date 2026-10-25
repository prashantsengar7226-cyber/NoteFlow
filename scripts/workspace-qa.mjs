import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
await mkdir('audit',{recursive:true});
const dbPath=path.resolve('audit',`workspace-qa-${Date.now()}.db`);
const dbUrl='file:'+dbPath.replaceAll('\\','/');
const client=createClient({url:dbUrl});
for(const name of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()) {
  const sql=await readFile('drizzle/'+name,'utf8');
  await client.batch(sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean),'write');
}
client.close();
const env={...process.env,NOTEFLOW_LOCAL_QA:'isolated-fixtures',TURSO_DATABASE_URL:dbUrl,TURSO_AUTH_TOKEN:'',AI_PROVIDER:'router',GEMINI_API_KEY:'',GROQ_API_KEY:'',OPENROUTER_API_KEY:'',SUPADATA_API_KEY:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:'',BILLING_ENABLED:'false',MONETIZATION_MODE:'free_launch'};
const server=spawn(process.execPath,['--import','./scripts/qa-auth-preload.mjs','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
const base='http://127.0.0.1:3100';
const results=[];
let browser;
try {
  for(let i=0;i<40;i++) {try {const r=await fetch(base+'/login');if(r.ok)break;}catch{} await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true});
  const sessions=[];
  for(let index=0;index<2;index++) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage();
    const id=`00000000-0000-4000-8000-00000000000${index+1}`;
    const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})+'.local-qa-signature';
    await page.route('https://**.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:token,refresh_token:'local-fixture-refresh',token_type:'bearer',expires_in:3600,user:{id,email:`audit-${index}@example.invalid`,app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01T00:00:00Z'}})}));
    await page.goto(base+'/login');
    await page.getByLabel('Email address').fill(`audit-${index}@example.invalid`);
    await page.getByLabel('Password',{exact:true}).fill('Synthetic-Password-42!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL(base+'/');
    await page.locator('form[action="/auth/signout"]').waitFor();
    sessions.push({context,page});
  }
  results.push({check:'two synthetic accounts reach real workspace via fixture auth',pass:true});
  const [a,b]=sessions;
  const api=async(page,route,method='GET',payload)=>page.evaluate(async({route,method,payload})=>{
    const r=await fetch(route,{method,headers:{'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:r.status,data:await r.json()};
  },{route,method,payload});
  const malicious='<img src=x onerror="window.__auditXss=1">';
  const created=await api(a.page,'/api/notes','POST',{kind:'text',title:malicious,text:'Learning is more effective when practice is spaced over time. Recall improves retention. '.repeat(20)});
  assert.equal(created.status,201);const id=created.data.note.id;
  assert.equal((await api(a.page,'/api/actions','POST',{id,action:'basic'})).status,200);
  assert.equal((await api(a.page,'/api/notes','PATCH',{id,annotations:malicious,starred:true})).status,200);
  assert.equal((await api(a.page,'/api/export','POST',{id,scope:'summary'})).status,200);
  assert.equal((await api(b.page,'/api/notes?id='+id)).status,404);
  assert.equal((await api(b.page,'/api/notes','PATCH',{id,title:'stolen'})).status,404);
  assert.equal((await api(b.page,'/api/export','POST',{id})).status,404);
  assert.equal((await api(b.page,'/api/notes','DELETE',{id})).status,404);
  assert.equal((await api(b.page,'/api/notes')).data.notes.length,0);
  results.push({check:'real HTTP cookie-authenticated CRUD, basic summary, private export and two-user isolation',pass:true});
  await a.page.reload();
  await a.page.getByRole('heading',{name:malicious,exact:true}).waitFor();
  assert.equal(await a.page.evaluate(()=>window.__auditXss),undefined);
  assert.equal(await a.page.locator('img[onerror]').count(),0);
  await a.page.screenshot({path:'audit/workspace-desktop.png',fullPage:true});
  await a.page.setViewportSize({width:390,height:844});
  await a.page.waitForTimeout(400);
  await a.page.screenshot({path:'audit/workspace-mobile.png',fullPage:true});
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  results.push({check:'stored HTML title is rendered as text; desktop/mobile workspace has no horizontal overflow',pass:true});
  const fixtureDb=createClient({url:dbUrl});
  const part={title:'Saved part',overview:'Spaced practice improves recall.',keyPoints:[{text:'Practice over time.',segmentIds:[0]}],chapters:[]};
  await fixtureDb.execute({sql:'INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?)',args:[id,'__summary_progress',JSON.stringify({runId:'fixture-resume',language:'Hindi',detail:'balanced',parts:[part],totalParts:2,lockUntil:0,error:'This video could not be transcribed. Use a public, completed video, or paste its transcript.'}),Date.now()]});
  fixtureDb.close();
  await a.page.setViewportSize({width:1280,height:580});
  await a.page.reload();
  await a.page.getByRole('heading',{name:malicious,exact:true}).click();
  await a.page.getByLabel('Summary progress').getByRole('button',{name:'Resume summary',exact:true}).waitFor();
  assert.match(await a.page.locator('.summary-error').innerText(),/AI model was unavailable/);
  assert.ok(!(await a.page.locator('.summary-error').innerText()).includes('video'));
  const nav=await a.page.locator('.sidebar nav').evaluate(el=>({height:el.clientHeight,scrollHeight:el.scrollHeight}));
  assert.ok(nav.height>=nav.scrollHeight-1,'navigation must not collapse to a one-row scroll area');
  await a.page.screenshot({path:'audit/summary-paused-short-desktop.png',fullPage:true});
  await a.page.route('**/api/actions',async route=>{
    const request=route.request().postDataJSON();
    assert.equal(request.id,id);assert.equal(request.action,'summary');assert.equal(request.language,'Hindi');
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({runId:'fixture-resume',completedParts:2,totalParts:2,progress:null,result:{...part,overview:'Completed fixture summary.',engine:'ai',language:'Hindi',models:['fixture-model']}})});
  });
  await a.page.getByLabel('Summary progress').getByRole('button',{name:'Resume summary',exact:true}).click();
  await a.page.getByText('Completed fixture summary.',{exact:true}).waitFor();
  assert.equal(await a.page.locator('.summary-error').count(),0);
  assert.equal(await a.page.getByRole('button',{name:'Resume summary',exact:true}).count(),0);
  await a.page.unroute('**/api/actions');
  results.push({check:'legacy paused error corrected; short-screen navigation usable; mocked resume clears error and completes summary',pass:true});
  assert.equal((await api(a.page,'/api/notes','DELETE',{id})).status,200);
  assert.equal((await api(a.page,'/api/notes?id='+id)).status,404);
  await a.page.setViewportSize({width:1440,height:1000});
  await a.page.goto(base+'/');
  await a.page.getByRole('button',{name:'PDF & documents',exact:true}).click();
  const fileInput=a.page.getByLabel('Choose a source file');
  const goodFile={name:'valid.txt',mimeType:'text/plain',buffer:Buffer.from('SAFE PREVIOUS DOCUMENT. '.repeat(20))};
  for(const rejectedFile of [
    {name:'not-allowed.html',mimeType:'text/html',buffer:Buffer.from('<h1>Unexpected file</h1>')},
    {name:'too-large.txt',mimeType:'text/plain',buffer:Buffer.alloc(20*1024*1024+1,120)},
  ]) {
    await fileInput.setInputFiles(goodFile);
    await a.page.getByRole('button',{name:'Create note',exact:true}).waitFor();
    await fileInput.setInputFiles(rejectedFile);
    await a.page.locator('.inline-error').getByText(rejectedFile.name.endsWith('.html')?'Choose a PDF, text, Markdown, SRT or VTT file.':'Choose a file under 20 MB.',{exact:true}).waitFor();
    const sent=a.page.waitForRequest(r=>r.url().endsWith('/api/notes')&&r.method()==='POST');
    await a.page.getByRole('button',{name:'Create note',exact:true}).click();
    const submitted=await sent;
    assert.equal(submitted.postDataJSON().text,'','rejected replacement must clear previous source');
    await a.page.locator('.inline-error').waitFor();
    assert.equal((await api(a.page,'/api/notes')).data.notes.length,0);
  }
  results.push({check:'unsupported/oversized file replacements clear prior source and cannot import it',pass:true});
  await a.page.goto(base+'/');
  await a.page.locator('form[action="/auth/signout"] button').click();
  await a.page.waitForURL(base+'/login');
  assert.equal((await api(a.page,'/api/notes')).status,401);
  results.push({check:'signout clears browser session and protected APIs reject subsequent requests',pass:true});
  const authCookies=(await b.context.cookies()).filter(cookie=>cookie.name.includes('-auth-token'));
  assert.ok(authCookies.length>0);
  await b.context.addCookies(authCookies.map(cookie=>({...cookie,value:'invalid-cookie-fixture'})));
  assert.equal((await api(b.page,'/api/notes')).status,401);
  results.push({check:'malformed session cookie fails closed without exposing private records',pass:true});
  console.log(JSON.stringify(results,null,2));
} finally {
  await browser?.close();
  server.kill();
  await writeFile('audit/workspace-qa.json',JSON.stringify({results,database:path.basename(dbPath),scope:'Real Next routes and temporary libSQL database; Supabase identity mocked; external network blocked in fixture server.'},null,2));
  await writeFile('audit/workspace-qa-server.log',serverLog);
}
