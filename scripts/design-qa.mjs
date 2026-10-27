import assert from 'node:assert/strict';

// Runs only against the isolated QA server started by workspace-qa.mjs.
export async function checkPublicDesign(browser, base, results) {
  assert.equal(base, 'http://127.0.0.1:3100');
  const context = await browser.newContext({ viewport: {width:1440,height:1000}, reducedMotion:'reduce', serviceWorkers:'block' });
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror', error=>errors.push({message:error.message,stack:error.stack,url:page.url()}));
  try {
    for(const route of ['/', '/welcome', '/tools/youtube', '/tools/pdf', '/tools/text', '/tools/flashcards', '/tools/quiz', '/tools/mindmap', '/tools/slides', '/access', '/help', '/login']) {
      assert.equal((await page.goto(base+route)).status(),200,route);
      await page.locator('h1').waitFor();
      assert.equal(await page.locator('h1').count(),1,route);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route);
      if(['/welcome','/tools/pdf','/access','/help','/login'].includes(route)) await page.screenshot({path:`audit/design-${route.replaceAll('/','-')}-1440.png`,fullPage:true});
    }
    assert.equal((await page.goto(base+'/tools/unsupported')).status(),404);
    await page.getByRole('heading',{name:'This page isn’t in the library.'}).waitFor();
    await page.goto(base+'/welcome');
    await page.getByRole('tab',{name:'YouTube',exact:true}).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab',{name:'PDF & documents',exact:true}).getAttribute('aria-selected'),'true');
    await page.keyboard.press('End');
    assert.equal(await page.getByRole('tab',{name:'Paste text',exact:true}).getAttribute('aria-selected'),'true');
    await page.getByRole('tab',{name:'Flashcards',exact:true}).click();
    await page.getByRole('button',{name:'Reveal flashcard answer'}).click();
    await page.getByText('Recalling information without looking at the answer.',{exact:true}).waitFor();
    await page.getByRole('tab',{name:'Quiz',exact:true}).click();
    await page.getByRole('button',{name:'B Answering before checking your notes'}).click();
    assert.match(await page.getByRole('status').innerText(),/Correct/);
    await page.getByLabel('Text or transcript',{exact:true}).fill('A safe study handoff fixture.');
    await page.getByRole('button',{name:'Create study notes',exact:true}).click();
    await page.waitForURL(base+'/login?tool=text');
    const handoff=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('noteflow.source-handoff.v1')));
    assert.equal(handoff.text,'A safe study handoff fixture.');
    assert.equal(handoff.source,'text');
    assert.ok(!page.url().includes('fixture'));
    results.push({check:'12 public/account routes render; invalid tool is 404; source tabs, demo flashcard/quiz and private handoff work',pass:true});
    for(const width of [768,390]) {
      await page.setViewportSize({width,height:844});
      for(const route of ['/welcome','/tools/pdf','/access','/help','/login']) {
        await page.goto(base+route);await page.locator('h1').waitFor();
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} ${width}`);
        await page.screenshot({path:`audit/design-${route.replaceAll('/','-')}-${width}.png`,fullPage:true});
      }
    }
    await page.goto(base+'/welcome');
    await page.getByRole('button',{name:'Open navigation',exact:true}).click();
    await page.getByRole('navigation',{name:'Study tools'}).getByRole('link',{name:'YouTube notes'}).waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('button',{name:'Open navigation',exact:true}).getAttribute('aria-expanded'),'false');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Open navigation');
    await page.goto(base+'/help');
    await page.locator('summary').filter({hasText:'What happens when AI is busy?'}).click();
    assert.equal(await page.locator('details[open]').count(),1);
    if(errors.length) console.log('PUBLIC_BROWSER_ERRORS',JSON.stringify(errors));
    results.push({check:'public tablet/phone pages fit; mobile drawer restores focus; FAQ opens',pass:true});
    results.push({check:'no public browser exceptions',pass:errors.length===0,errors});
    assert.deepEqual(errors,[]);
  } finally { await context.close(); }
}
