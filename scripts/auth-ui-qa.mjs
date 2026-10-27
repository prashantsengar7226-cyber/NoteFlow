import assert from 'node:assert/strict';
export async function checkAuthForms(browser,base,results){
 assert.equal(base,'http://127.0.0.1:3100');
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
 const requests=[];let allowSignIn=false;
 const user={id:'00000000-0000-4000-8000-000000000001',email:'audit-0@example.invalid',email_confirmed_at:'2026-01-01T00:00:00Z',aud:'authenticated',app_metadata:{},user_metadata:{}};
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const token=enc({alg:'HS256',typ:'JWT'})+'.'+enc({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)})+'.local-qa-signature';
 await page.route('https://**.supabase.co/**',route=>{
  const url=new URL(route.request().url());requests.push({path:url.pathname,data:route.request().postDataJSON()});
  if(allowSignIn&&url.pathname.endsWith('/token'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user,access_token:token,refresh_token:'local-reset-fixture',token_type:'bearer',expires_in:3600})});
  if(allowSignIn&&url.pathname.endsWith('/user'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});
  if(allowSignIn&&url.pathname.endsWith('/logout'))return route.fulfill({status:204,body:''});
  if(url.pathname.endsWith('/signup'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({user:{id:'00000000-0000-4000-8000-000000000003',email:'signup@example.invalid',identities:[]},session:null})});
  if(url.pathname.endsWith('/recover')||url.pathname.endsWith('/resend'))return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({code:'invalid_credentials',message:'Invalid login credentials'})});
 });
 try{
  await page.goto(base+'/login');await page.getByRole('button',{name:'New to NoteFlow? Create an account'}).click();
  await page.getByLabel('Your name',{exact:true}).fill('Local test learner');
  await page.getByLabel('Email address').fill('signup@example.invalid');
  await page.getByLabel('Password',{exact:true}).fill('short');
  await page.getByLabel('Confirm password').fill('short');
  await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('alert').filter({hasText:'12 characters'}).waitFor();assert.equal(requests.length,0);
  await page.getByLabel('Password',{exact:true}).fill('a long unique passphrase');await page.getByLabel('Confirm password').fill('different passphrase');
  await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();assert.equal(requests.length,0);
  await page.getByLabel('Confirm password').fill('a long unique passphrase');await page.getByRole('alert').filter({hasText:'do not match'}).waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Show password',exact:true}).click();assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');await page.getByRole('button',{name:'Hide password',exact:true}).click();
  await page.screenshot({path:'audit/auth-signup-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'audit/auth-signup-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Create account',exact:true}).click();await page.getByRole('heading',{name:'Check your inbox'}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/signup')).length,1);assert.equal(requests.find(r=>r.path.endsWith('/signup')).data.data.full_name,'Local test learner');
  assert.ok(await page.getByRole('button',{name:/Send again in/}).isDisabled());assert.equal(new URL(page.url()).pathname,'/login');
  await page.screenshot({path:'audit/auth-confirm-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Already have an account? Sign in'}).click();await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  // Fresh page resets the UI cooldown; server limits remain authoritative.
  await page.reload();await page.getByRole('button',{name:'Forgot password?',exact:true}).click();await page.getByLabel('Email address').fill('signup@example.invalid');await page.getByRole('button',{name:'Send reset link',exact:true}).click();await page.getByRole('status').filter({hasText:'eligible account'}).waitFor();
  assert.equal(requests.filter(r=>r.path.endsWith('/recover')).length,1);
  await page.goto(base+'/auth/reset-password');await page.getByText('This reset session is missing or has expired.',{exact:false}).waitFor();assert.equal(await page.getByRole('button',{name:'Update password'}).count(),0);
  const response=await context.request.get(base+'/auth/callback?code=invalid&next=https://evil.invalid',{maxRedirects:0});assert.equal(response.status(),303);assert.equal(response.headers().location,'/login?auth=invalid-link');
  await page.screenshot({path:'audit/auth-reset-expired-mobile.png',fullPage:true});
  allowSignIn=true;await page.goto(base+'/login');await page.getByLabel('Email address').fill(user.email);await page.getByLabel('Password',{exact:true}).fill('Synthetic-Password-42!');await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.waitForURL(base+'/');
  await page.goto(base+'/auth/reset-password');await page.getByLabel('New password',{exact:true}).fill('new secure passphrase');await page.getByLabel('Confirm new password').fill('mismatch');await page.getByRole('button',{name:'Update password'}).click();await page.getByRole('alert').filter({hasText:'do not match'}).waitFor();
  await page.getByLabel('Confirm new password').fill('new secure passphrase');await page.getByRole('alert').filter({hasText:'do not match'}).waitFor({state:'hidden'});await page.screenshot({path:'audit/auth-reset-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Update password'}).click();await page.getByRole('heading',{name:'Password updated'}).waitFor();assert.ok(requests.some(r=>r.path.endsWith('/user')&&r.data?.password==='new secure passphrase'));await page.waitForTimeout(100);assert.ok(requests.some(r=>r.path.endsWith('/logout')));
  results.push({check:'signup validation, password visibility, confirmation inbox, resend cooldown, neutral reset request, missing reset session, authenticated password update, global sign-out and invalid callback pass without sending email',pass:true});
 }finally{await context.close();}
}
