import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const results=[];
await mkdir('audit',{recursive:true});
try {
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
    const context=await browser.newContext({viewport,serviceWorkers:'block'});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    let mode='invalid', calls=0, releaseRequest;
    const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
    const fakeToken=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:'00000000-0000-4000-8000-000000000001',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})+'.synthetic-signature';
    // Synthetic responses only. Never send credentials to the live service.
    await page.route('https://**.supabase.co/**',async route=>{
      calls++;
      if(mode==='slow') await new Promise(resolve=>{releaseRequest=resolve;});
      if(mode==='weak') return route.fulfill({status:422,headers:{'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'X-Supabase-Api-Version'},contentType:'application/json',body:JSON.stringify({code:'weak_password',msg:'PRIVATE_PROVIDER_DETAIL'})});
      if(mode==='success') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:fakeToken,refresh_token:'synthetic-refresh-token',expires_in:3600,token_type:'bearer',user:{id:'00000000-0000-4000-8000-000000000001',email:'audit-user@example.invalid',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:new Date().toISOString()}})});
      if(mode==='network') return route.abort('failed');
      if(mode==='pending') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'fixture-user',identities:[]},session:null})});
      return route.fulfill({status:mode==='rate'?429:400,contentType:'application/json',body:JSON.stringify({code:mode==='rate'?'over_request_rate_limit':'invalid_credentials',msg:'Invalid login credentials'})});
    });
    await page.goto('http://127.0.0.1:3000/login');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    assert.equal(calls,0);
    await page.getByLabel('Email address').fill('invalid-email');
    await page.getByLabel('Password',{exact:true}).fill('Synthetic-Test-Password-Only-42!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    assert.equal(calls,0);
    results.push({viewport:viewport.width,check:'empty and malformed credentials blocked without auth request',pass:true});
    await page.getByLabel('Email address').fill('audit-user@example.invalid');
    await page.getByLabel('Password',{exact:true}).fill('Synthetic-Test-Password-Only-42!');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Could not sign in'}).waitFor();
    results.push({viewport:viewport.width,check:'invalid login displays actionable error',pass:true});
    mode='rate';
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Too many attempts'}).waitFor();
    results.push({viewport:viewport.width,check:'rate limit response shown',pass:true});
    mode='network';
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Could not sign in'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).isEnabled(),true);
    results.push({viewport:viewport.width,check:'network failure releases busy state and allows retry',pass:true});
    await page.getByRole('button',{name:'New to NoteFlow? Create an account'}).click();
    await page.getByLabel('Password',{exact:true}).fill('short');
    await page.getByLabel('Confirm password').fill('short');
    const beforeShort=calls;
    // Bypass browser constraint validation to exercise the submit handler itself.
    await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    await page.getByRole('status').filter({hasText:'Use at least 8 characters'}).waitFor();
    assert.equal(calls,beforeShort);
    results.push({viewport:viewport.width,check:'signup minimum enforced even when native form validation is bypassed',pass:true});
    await page.getByLabel('Password',{exact:true}).fill('Synthetic-Test-Password-Only-42!');
    await page.getByLabel('Confirm password').fill('Different-Synthetic-Password-42!');
    const before=calls;
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Passwords do not match'}).waitFor();
    assert.equal(calls,before);
    results.push({viewport:viewport.width,check:'mismatched passwords never sent',pass:true});
    await page.getByLabel('Confirm password').fill('Synthetic-Test-Password-Only-42!');
    mode='weak';
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByRole('status').filter({hasText:'Choose a stronger password'}).waitFor();
    assert.ok(!(await page.locator('body').innerText()).includes('PRIVATE_PROVIDER_DETAIL'));
    results.push({viewport:viewport.width,check:'server weak-password rejection gives safe actionable feedback',pass:true});
    mode='slow';
    const beforeDuplicate=calls;
    await page.locator('form').evaluate(form=>{
      for(let i=0;i<10;i++) form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    });
    await page.waitForFunction(()=>document.querySelector('form').getAttribute('aria-busy')==='true');
    await assertEventually(()=>typeof releaseRequest==='function');
    assert.equal(calls,beforeDuplicate+1);
    assert.equal(await page.getByLabel('Email address').isDisabled(),true);
    releaseRequest();
    await page.getByRole('status').filter({hasText:'Could not create an account'}).waitFor();
    results.push({viewport:viewport.width,check:'ten simultaneous submits create only one auth request and release after failure',pass:true});
    mode='pending';
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByRole('status').filter({hasText:'did not return a sign-in session'}).waitFor();
    assert.ok(page.url().endsWith('/login'));
    results.push({viewport:viewport.width,check:'no-session signup stays on login with explanation',pass:true});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`audit/login-${viewport.width}.png`,fullPage:true});
    results.push({viewport:viewport.width,check:'no horizontal overflow or uncaught browser exceptions',pass:true});
    // Intercept the destination so the synthetic token is never sent to the app server.
    await page.route('http://127.0.0.1:3000/',route=>route.fulfill({status:200,contentType:'text/html',body:'<h1>Mock workspace destination</h1>'}));
    mode='success';
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.getByRole('heading',{name:'Mock workspace destination'}).waitFor();
    results.push({viewport:viewport.width,check:'successful signup navigates to workspace (mocked session and destination)',pass:true});
    await context.close();
  }
} finally {
  await browser.close();
  await writeFile('audit/browser-qa.json',JSON.stringify(results,null,2));
}
console.log(JSON.stringify(results,null,2));

async function assertEventually(predicate) {
  const end=Date.now()+5000;
  while(!predicate() && Date.now()<end) await new Promise(resolve=>setTimeout(resolve,20));
  assert.ok(predicate());
}
