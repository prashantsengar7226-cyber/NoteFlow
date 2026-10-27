import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import nextEnv from '@next/env';
import { checkPublicDesign } from './design-qa.mjs';
import { checkAdministration } from './admin-qa.mjs';
import { checkAuthForms } from './auth-ui-qa.mjs';
nextEnv.loadEnvConfig(process.cwd());
await mkdir('audit',{recursive:true});
const dbPath=path.resolve('audit',`workspace-qa-${Date.now()}.db`);
const dbUrl='file:'+dbPath.replaceAll('\\','/');
const client=createClient({url:dbUrl});
await client.execute('PRAGMA journal_mode=WAL');
await client.execute('PRAGMA busy_timeout=5000');
for(const name of (await readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()) {
  const sql=await readFile('drizzle/'+name,'utf8');
  await client.batch(sql.split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean),'write');
}
client.close();
const env={...process.env,NOTEFLOW_LOCAL_QA:'isolated-fixtures',TURSO_DATABASE_URL:dbUrl,TURSO_AUTH_TOKEN:'',AI_PROVIDER:'router',GEMINI_API_KEY:'',GROQ_API_KEY:'',OPENROUTER_API_KEY:'',SUPADATA_API_KEY:'',RAZORPAY_KEY_ID:'',RAZORPAY_KEY_SECRET:'',RAZORPAY_WEBHOOK_SECRET:'',BILLING_ENABLED:'false',MONETIZATION_MODE:'free_launch'};
env.BYOK_ENCRYPTION_KEY=randomBytes(32).toString('base64');
env.QUEUE_WORKER_SECRET=randomBytes(32).toString('hex');
env.QUEUE_SCHEDULER_ENABLED='false';
env.NOTEFLOW_QA_AI_TEST='synthetic-only';
const server=spawn(process.execPath,['--import','./scripts/qa-auth-preload.mjs','node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3100'],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let serverLog='';server.stdout.on('data',d=>serverLog+=d);server.stderr.on('data',d=>serverLog+=d);
const base='http://127.0.0.1:3100';
const results=[];
let browser;
try {
  for(let i=0;i<40;i++) {try {const r=await fetch(base+'/login');if(r.ok)break;}catch{} await new Promise(r=>setTimeout(r,250));}
  browser=await chromium.launch({channel:'msedge',headless:true});
  await checkPublicDesign(browser,base,results);
  await checkAuthForms(browser,base,results);
  const sessions=[];
  for(let index=0;index<2;index++) {
    const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'});
    const page=await context.newPage();
    const id=`00000000-0000-4000-8000-00000000000${index+1}`;
    const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
    const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})+'.local-qa-signature';
    await page.route('https://**.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:token,refresh_token:'local-fixture-refresh',token_type:'bearer',expires_in:3600,user:{id,email:`audit-${index}@example.invalid`,app_metadata:{},user_metadata:{},email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',created_at:'2026-01-01T00:00:00Z'}})}));
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
  // Preserve draft only in this tab and consume it once after authenticated entry.
  await a.page.goto(base+'/welcome');
  await a.page.getByRole('tab',{name:'Paste text',exact:true}).click();
  await a.page.getByLabel('Text or transcript',{exact:true}).fill('Authenticated draft handoff fixture.');
  await a.page.getByRole('button',{name:'Create study notes',exact:true}).click();
  await a.page.waitForURL(base+'/login?tool=text');
  await a.page.getByLabel('Email address').fill('audit-0@example.invalid');
  await a.page.getByLabel('Password',{exact:true}).fill('Synthetic-Password-42!');
  await a.page.getByRole('button',{name:'Sign in',exact:true}).click();
  await a.page.locator('[aria-labelledby="import-title"]').waitFor();
  assert.equal(await a.page.locator('[aria-labelledby="import-title"] textarea').inputValue(),'Authenticated draft handoff fixture.');
  assert.equal(await a.page.evaluate(()=>sessionStorage.getItem('noteflow.source-handoff.v1')),null);
  await a.page.goto(base+'/');
  await a.page.screenshot({path:'audit/design-workspace-1440.png',fullPage:true});
  await a.page.setViewportSize({width:390,height:844});
  await a.page.screenshot({path:'audit/design-workspace-390.png',fullPage:true});
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await a.page.setViewportSize({width:1440,height:1000});
  results.push({check:'authenticated handoff fills importer once, clears storage and workspace fits mobile',pass:true});
  await a.page.locator('.settings-nav').click();
  await a.page.getByRole('heading',{name:'Choose your AI connection'}).waitFor();
  await a.page.getByLabel('API key',{exact:true}).fill('synthetic-browser-key-for-local-qa');
  const catalogResponse=a.page.waitForResponse(r=>r.url().endsWith('/api/ai-models'));
  await a.page.getByRole('button',{name:'Load available models',exact:true}).click();
  const catalog=await catalogResponse;
  assert.equal(catalog.status(),200,await catalog.text());
  assert.equal((await catalog.json()).models.length,2);
  await a.page.getByLabel('Model',{exact:true}).selectOption('test-model');
  await a.page.getByLabel('I authorize a connection test',{exact:false}).check();
  await a.page.getByRole('button',{name:'Test and connect',exact:true}).click();
  await a.page.getByText('Connection tested and saved. Your personal AI is active.').waitFor();
  assert.equal(await a.page.getByLabel('API key',{exact:true}).count(),0);
  await a.page.getByRole('button',{name:'Refresh models',exact:true}).click();
  await a.page.getByLabel('Model',{exact:true}).selectOption('test-model-2');
  await a.page.getByLabel('I authorize a connection test',{exact:false}).check();
  await a.page.getByRole('button',{name:'Test and save model',exact:true}).click();
  await a.page.getByText('Personal AI · gemini · test-model-2',{exact:true}).waitFor();
  for(const width of [1440,390]){
    await a.page.setViewportSize({width,height:1000});
    await a.page.locator('.personal-ai-settings').screenshot({path:`audit/personal-ai-settings-${width}.png`});
    const overflow=await a.page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,cls:e.className,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right})).filter(e=>e.right>innerWidth+2&&e.x>=0).slice(-15)}));
    assert.ok(overflow.scroll<=overflow.width,JSON.stringify(overflow));
  }
  await a.page.setViewportSize({width:1440,height:1000});
  results.push({check:'personal key connects through real authenticated API, clears password field and fits desktop/mobile',pass:true});
  const api=async(page,route,method='GET',payload)=>page.evaluate(async({route,method,payload})=>{
    const r=await fetch(route,{method,headers:{'content-type':'application/json'},...(payload?{body:JSON.stringify(payload)}:{})});
    return {status:r.status,data:await r.json()};
  },{route,method,payload});
  const malicious='<img src=x onerror="window.__auditXss=1">';
  const queueNote=await api(a.page,'/api/notes','POST',{kind:'text',title:'Queue fixture',text:'The square is blue. '.repeat(10)});
  const queued=await api(a.page,'/api/ai-jobs','POST',{id:queueNote.data.note.id,language:'English',detail:'balanced'});
  assert.equal(queued.status,202);
  await a.page.goto(base+'/');
  await a.page.getByRole('heading',{name:'Summary tasks',exact:true}).waitFor();
  await a.page.locator('.summary-queue').screenshot({path:'audit/summary-queue-desktop.png'});
  await a.page.setViewportSize({width:390,height:844});
  await a.page.locator('.summary-queue').screenshot({path:'audit/summary-queue-mobile.png'});
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  // Drive the protected worker independently of a browser, as an external cron would.
  await a.page.goto('about:blank');
  for(let attempt=0;attempt<12;attempt++){
    const tick=await fetch(base+'/api/queue-worker',{method:'POST',headers:{authorization:`Bearer ${env.QUEUE_WORKER_SECRET}`}});
    assert.equal(tick.status,202);
    const state=await (await a.context.request.get(base+'/api/ai-jobs?id='+queued.data.job.id)).json();
    if(state.job.state==='completed')break;
    await new Promise(resolve=>setTimeout(resolve,3000));
  }
  const finished=await (await a.context.request.get(base+'/api/ai-jobs?id='+queued.data.job.id)).json();
  assert.equal(finished.job.state,'completed');
  await a.page.goto(base+'/');
  assert.equal((await api(a.page,'/api/notes?id='+queueNote.data.note.id)).data.note.summary.sourceChecks.checkedParts,1);
  assert.equal((await api(b.page,'/api/ai-jobs?id='+queued.data.job.id)).status,404);
  await api(a.page,'/api/notes','DELETE',{id:queueNote.data.note.id});
  await api(a.page,'/api/ai-connection','DELETE');
  results.push({check:'durable queue completes draft and source review through authenticated external ticks with browser away; other account denied',pass:true});
  // No shared provider keys exist in this isolated process. The real worker
  // must produce labelled source notes without bypassing provider/auth checks.
  const fallbackNote=await api(a.page,'/api/notes','POST',{kind:'text',title:'Source fallback fixture',text:'The square is blue. '.repeat(20)});
  const fallbackId=fallbackNote.data.note.id;
  await api(a.page,'/api/ai-jobs','POST',{id:fallbackId,language:'Hindi',detail:'balanced'});
  await a.page.goto(base+'/');
  await a.page.getByRole('heading',{name:'Source fallback fixture',exact:true}).click();
  await a.page.getByRole('heading',{name:'AI summary is not ready yet',exact:true}).waitFor();
  assert.equal(await a.page.getByRole('heading',{name:'Overview',exact:true}).count(),0);
  assert.equal(await a.page.locator('.takeaways').count(),0);
  assert.equal((await api(b.page,'/api/notes?id='+fallbackId)).status,404);
  assert.equal((await api(a.page,'/api/export-batch','POST',{ids:[fallbackId]})).status,200);
  for(const width of [1440,390]){
    await a.page.setViewportSize({width,height:1000});
    await a.page.getByLabel('AI summary not ready').scrollIntoViewIfNeeded();
    await a.page.screenshot({path:`audit/source-fallback-${width}.png`});
    assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await a.page.getByRole('button',{name:'View source transcript',exact:true}).click();
  await a.page.getByRole('heading',{name:'Source transcript',exact:true}).waitFor();
  await a.page.locator('.source-excerpts summary').click();
  assert.ok((await a.page.locator('.source-excerpts .takeaways').innerText()).includes('The square is blue.'));
  const partialDb=createClient({url:dbUrl});
  await partialDb.execute('PRAGMA busy_timeout=5000');
  const checked={title:'Checked result',overview:'Checked AI fixture.',keyPoints:[{text:'The square is blue.',segmentIds:[0]}],chapters:[],model:'fixture',sourceChecked:true};
  await partialDb.execute({sql:'INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?) ON CONFLICT(note_id,kind) DO UPDATE SET content=excluded.content',args:[fallbackId,'__summary_progress',JSON.stringify({runId:crypto.randomUUID(),language:'Hindi',detail:'balanced',parts:[checked],totalParts:2,chunkVersion:3,lockUntil:0}),Date.now()]});
  partialDb.close();
  await a.page.reload();
  await a.page.getByRole('heading',{name:'Source fallback fixture',exact:true}).click();
  await a.page.getByRole('heading',{name:'Your revision guide',exact:true}).waitFor();
  await a.page.locator('.revision-overview summary').click();
  await a.page.getByText('Checked AI fixture.',{exact:true}).waitFor();
  for(const width of [1440,390]){
    await a.page.setViewportSize({width,height:1000});
    await a.page.locator('.revision-guide').scrollIntoViewIfNeeded();
    await a.page.screenshot({path:`audit/revision-guide-${width}.png`});
    assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await a.page.getByLabel('Find a topic or fact').fill('no matching topic');
  await a.page.getByText('No topics match',{exact:false}).waitFor();
  await a.page.getByLabel('Find a topic or fact').fill('');
  await a.page.getByRole('button',{name:'Practise recall',exact:true}).click();
  assert.equal(await a.page.locator('.revision-topic details').getAttribute('open'),null);
  await a.page.locator('.revision-topic summary').click();
  await a.page.locator('.revision-facts').getByText('The square is blue.',{exact:true}).waitFor();
  await a.page.getByRole('button',{name:'Read notes',exact:true}).click();
  await a.page.getByText('Partial AI summary',{exact:true}).waitFor();
  assert.equal(await a.page.locator('.source-excerpts').count(),0);
  await api(a.page,'/api/notes','DELETE',{id:fallbackId});
  results.push({check:'unavailable AI shows no false result; excerpts live only in Transcript; checked partial AI overrides fallback on desktop/mobile',pass:true});
  await a.page.setViewportSize({width:1440,height:1000});
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
  await fixtureDb.execute('PRAGMA busy_timeout=5000');
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
  await a.page.route('**/api/ai-jobs',async route=>{
    if(route.request().method()!=='POST')return route.continue();
    const request=route.request().postDataJSON();
    assert.equal(request.id,id);assert.equal(request.language,'Hindi');
    const resumed=createClient({url:dbUrl});
  await resumed.execute('PRAGMA busy_timeout=5000');
    await resumed.batch([
      {sql:'UPDATE notes SET summary=? WHERE id=?',args:[JSON.stringify({...part,overview:'Completed fixture summary.',engine:'ai',language:'Hindi',models:['fixture-model']}),id]},
      {sql:"DELETE FROM artifacts WHERE note_id=? AND kind='__summary_progress'",args:[id]},
    ],'write');
    resumed.close();
    await route.fulfill({status:202,contentType:'application/json',body:JSON.stringify({job:{id:crypto.randomUUID(),noteId:id,state:'completed',nextAt:0,completedParts:2,totalParts:2,errorCode:null,background:false}})});
  });
  await a.page.getByLabel('Summary progress').getByRole('button',{name:'Resume summary',exact:true}).click();
  await a.page.locator('.revision-overview summary').click();
  await a.page.getByText('Completed fixture summary.',{exact:true}).waitFor();
  assert.equal(await a.page.locator('.summary-error').count(),0);
  assert.equal(await a.page.getByRole('button',{name:'Resume summary',exact:true}).count(),0);
  await a.page.unroute('**/api/ai-jobs');
  results.push({check:'legacy paused error corrected; short-screen navigation usable; mocked resume clears error and completes summary',pass:true});
  const toolNames=['Summary','AI Chat','Transcript','My notes','Insights','Mind map','Flashcards','Quiz','Slides','Translate'];
  for(const label of toolNames) {
    const tab=a.page.getByRole('tab',{name:label,exact:true});
    await tab.click();assert.equal(await tab.getAttribute('aria-selected'),'true');
    assert.ok((await a.page.getByRole('tabpanel').innerText()).trim().length>0);
    await a.page.getByRole('tabpanel').evaluate(el=>el.scrollTop=0);
    await a.page.screenshot({path:`audit/reader-tool-${label.replaceAll(' ','-')}.png`});
  }
  await a.page.getByRole('tab',{name:'Summary',exact:true}).click();
  await a.page.setViewportSize({width:1440,height:1000});
  await a.page.screenshot({path:'audit/study-reader-desktop.png',fullPage:true});
  await a.page.setViewportSize({width:390,height:844});
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await a.page.screenshot({path:'audit/study-reader-mobile.png',fullPage:true});
  results.push({check:'all ten study tabs including AI Chat remain reachable with rendered panels; reader fits desktop and mobile',pass:true});
  const longSegments=Array.from({length:204},(_,i)=>({id:i,start:i*30,text:`परीक्षण स्रोत ${i+1}: यह अभ्यास सामग्री पढ़ने, याद करने और स्रोत की जाँच करने के लिए है। महत्वपूर्ण जानकारी को अपने शब्दों में लिखें और मूल पाठ से मिलाएँ।`}));
  const subjects=['अंतरराष्ट्रीय संगठन और उनकी भूमिका','विज्ञान और प्रौद्योगिकी','इतिहास और संस्कृति','पर्यावरण और संरक्षण','शिक्षा और अध्ययन की विधियाँ','खेल और महत्वपूर्ण तथ्य'];
  const longSummary={engine:'ai',language:'Hindi',overview:'यह केवल स्थानीय इंटरफ़ेस परीक्षण के लिए तैयार किया गया उदाहरण है। इसमें 68 विषय और 166 मुख्य बिंदु हैं।',keyPoints:Array.from({length:166},(_,i)=>({text:`अभ्यास बिंदु ${i+1}: विषय की मुख्य जानकारी समझें, स्रोत पढ़ें और अपने शब्दों में दोहराएँ। यह परीक्षण सामग्री है।`,segmentIds:[Math.min(203,Math.floor(i/166*204))]})),chapters:Array.from({length:68},(_,i)=>({title:`${subjects[i%subjects.length]} — भाग ${i+1}`,summary:`इस भाग में ${subjects[i%subjects.length]} का अध्ययन करें। प्रमुख शब्दों और उनके संदर्भ को समझना जरूरी है। अपनी समझ की जाँच के लिए नीचे दिए गए अभ्यास बिंदु पढ़ें।`,segmentId:i*3})),models:['local-ui-fixture']};
  const longDb=createClient({url:dbUrl});
  await longDb.execute('PRAGMA busy_timeout=5000');
  await longDb.execute({sql:'UPDATE notes SET title=?,transcript=?,summary=? WHERE id=?',args:['68 विषयों की पुनरावृत्ति · UI test',JSON.stringify(longSegments),JSON.stringify(longSummary),id]});
  longDb.close();
  await a.page.setViewportSize({width:1440,height:1000});
  await a.page.goto(base+'/');
  await a.page.getByRole('heading',{name:'68 विषयों की पुनरावृत्ति · UI test',exact:true}).click();
  await a.page.getByRole('heading',{name:'Your revision guide',exact:true}).waitFor();
  assert.equal(await a.page.locator('.revision-topic').count(),6);
  assert.equal(await a.page.locator('.revision-index').count(),0);
  assert.equal(await a.page.locator('.source-passage').count(),204);
  await a.page.screenshot({path:'audit/reader-68-topics-desktop.png',fullPage:true});
  // Exercise the actual video iframe layout without external playback or provider requests.
  await a.page.route('https://www.youtube-nocookie.com/embed/**',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#16243b;color:white;font:16px system-ui"><div>Video preview · local UI fixture</div></body></html>'}));
  const videoDb=createClient({url:dbUrl});
  await videoDb.execute('PRAGMA busy_timeout=5000');
  await videoDb.execute({sql:'UPDATE notes SET source=?,video_id=? WHERE id=?',args:['YouTube','M7lc1UVf-VE',id]});
  videoDb.close();
  await a.page.goto(base+'/');
  await a.page.getByRole('heading',{name:'68 विषयों की पुनरावृत्ति · UI test',exact:true}).click();
  await a.page.locator('.study-source iframe').waitFor();
  await a.page.getByRole('heading',{name:'Your revision guide',exact:true}).waitFor();
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await a.page.screenshot({path:'audit/reader-video-desktop.png',fullPage:true});
  await a.page.getByRole('button',{name:'Next',exact:true}).click();
  assert.match(await a.page.locator('.revision-page-info').innerText(),/Topics 7–12 of 68/);
  await a.page.getByRole('button',{name:/Contents 68 topics/}).click();
  assert.equal(await a.page.locator('.revision-index>button').count(),68);
  const contentsSize=await a.page.locator('.revision-index').evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight}));
  assert.ok(contentsSize.height<=280&&contentsSize.scroll>contentsSize.height);
  await a.page.locator('.revision-index>button').last().click();
  assert.match(await a.page.locator('.revision-page-info').innerText(),/Topics 67–68 of 68/);
  await a.page.getByLabel('Find a topic or fact').fill('भाग 68');
  assert.equal(await a.page.locator('.revision-topic').count(),1);
  await a.page.getByLabel('Find a topic or fact').fill('');
  await a.page.getByRole('button',{name:'Read all topics',exact:true}).click();
  assert.equal(await a.page.locator('.revision-topic').count(),68);
  assert.equal(await a.page.locator('.revision-facts>li').count(),166);
  await a.page.getByRole('button',{name:'Read in pages',exact:true}).click();
  await a.page.setViewportSize({width:390,height:844});
  assert.equal(await a.page.locator('.study-source').getAttribute('open'),null);
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await a.page.evaluate(()=>scrollTo(0,0));
  await a.page.screenshot({path:'audit/reader-68-topics-mobile.png',fullPage:true});
  await a.page.screenshot({path:'audit/reader-mobile-viewport.png'});
  await a.page.locator('.study-source-heading').click();
  await a.page.getByLabel('Find in source',{exact:true}).fill('परीक्षण स्रोत 204:');
  assert.equal(await a.page.locator('.source-passage').count(),1);
  await a.page.getByRole('tab',{name:'AI Chat',exact:true}).click();
  await a.page.getByRole('button',{name:'What are the main ideas?',exact:false}).click();
  assert.equal(await a.page.getByLabel('Ask a question about this source').inputValue(),'What are the main ideas?');
  await a.page.screenshot({path:'audit/reader-chat-mobile.png',fullPage:true});
  results.push({check:'68 Hindi topics/166 facts/204 source passages: six-topic pages, bounded contents, final-topic jump, search, read-all preservation, mobile source expansion and chat prompt work',pass:true});
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
  // Commit a real local import, then deliberately truncate only its HTTP response.
  // The browser must recover the saved note and continue its summary with one POST.
  await fileInput.setInputFiles(goodFile);
  await a.page.locator('[aria-labelledby="import-title"]').getByLabel('Summary mode').selectOption('basic');
  let importPosts=0;
  const lostConfirmation=async route=>{
    if(route.request().method()!=='POST')return route.continue();
    importPosts++;
    const saved=await route.fetch();
    assert.equal(saved.status(),201);
    await route.fulfill({status:201,contentType:'application/json',body:'{"note":'});
  };
  await a.page.route('**/api/notes',lostConfirmation);
  await a.page.getByRole('button',{name:'Create note',exact:true}).click();
  await a.page.getByRole('tab',{name:'Summary',exact:true}).waitFor();
  await a.page.waitForFunction(async()=>{
    const list=await (await fetch('/api/notes')).json();
    if(list.notes.length!==1)return false;
    const view=await (await fetch('/api/notes?id='+list.notes[0].id)).json();
    return !!view.note.summary;
  });
  assert.equal(importPosts,1);
  assert.equal(await a.page.getByRole('button',{name:'Create note',exact:true}).count(),0);
  await a.page.unroute('**/api/notes',lostConfirmation);
  results.push({check:'truncated import success recovers the saved note and generates basic summary without duplicate import',pass:true});
  await checkAdministration(a.page,b.page,base,dbUrl,results);
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
