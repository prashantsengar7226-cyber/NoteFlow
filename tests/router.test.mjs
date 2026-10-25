import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { routedGenerate, providerJson, providerFetch } from '../.test-runtime/provider.mjs';
import { ai, schemas, config, summarySchema, availableAIProviders } from '../.test-runtime/server.mjs';
import { env } from '../.test-runtime/harness.mjs';
beforeEach(async()=>{await env.DB.prepare("DELETE FROM limits WHERE owner LIKE 'provider:cooldown:%'").run();});
const candidates=[{provider:'groq',key:'PRIVATE_GROQ_FIXTURE',model:'groq-fixture'},
  {provider:'openrouter',key:'PRIVATE_ROUTER_FIXTURE',model:'openrouter/free'}];
const payload={answer:'Source answer',segmentIds:[0]};
const completion=(model='vendor/actual-model')=>Response.json({model,choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}]});
async function mock(fetcher, run) {
  const previous=globalThis.fetch;
  globalThis.fetch=fetcher;
  try {await run();} finally {globalThis.fetch=previous;}
}

test('router fallback handles quota, server, network and timeout failures with provider-scoped credentials',async()=>{
  for (const failure of [429,502,503,504,'network','timeout']) {
    const requests=[];
    await mock(async(url,init)=>{
      requests.push({url,init});
      assert.equal(init.redirect,'manual');
      assert.ok(init.signal instanceof AbortSignal);
      if(requests.length===1) {
        assert.equal(init.headers.Authorization,'Bearer PRIVATE_GROQ_FIXTURE');
        if(failure==='network')throw new Error('private-network-details');
        if(failure==='timeout')throw new DOMException('private-timeout-details','TimeoutError');
        return new Response('private-provider-body',{status:failure});
      }
      assert.equal(init.headers.Authorization,'Bearer PRIVATE_ROUTER_FIXTURE');
      return completion();
    },async()=>{
      const result=await routedGenerate(candidates,'system','source',{},5000);
      assert.equal(result.provider,'openrouter');
      assert.equal(requests.length,2);
      assert.equal(new URL(requests[0].url).hostname,'api.groq.com');
      assert.equal(new URL(requests[1].url).hostname,'openrouter.ai');
    });
  }
});

test('router never falls through on authentication, invalid requests or redirects',async()=>{
  for(const status of [400,401,403,422,302]) {
    let calls=0;
    await mock(async()=>{calls++;return new Response('SENSITIVE_PROVIDER_DETAIL',{status,headers:{location:'https://attacker.example'}});},async()=>{
      await assert.rejects(routedGenerate(candidates,'system','source',{},5000),e=>!e.message.includes('SENSITIVE_PROVIDER_DETAIL'));
      assert.equal(calls,1);
    });
  }
});

test('AI model 404 falls through to the next provider instead of blaming the video',async()=>{
  let calls=0;
  await mock(async()=>++calls===1?new Response('private',{status:404}):completion(),async()=>{
    const result=await routedGenerate(candidates,'system','source',{},5000);
    assert.equal(result.provider,'openrouter');
    assert.equal(calls,2);
  });
});

test('AI errors and transcription errors have separate classifications',async()=>{
  for(const name of ['Gemini','Groq','OpenRouter','Transcription']) {
    for(const status of [400,404,422]) {
      await mock(async()=>new Response('PRIVATE_PROVIDER_BODY',{status}),async()=>{
        await assert.rejects(providerFetch('https://fixture.invalid',{},name),error=>{
          assert.equal(error.code,name==='Transcription'?'SOURCE_UNAVAILABLE':status===404?'MODEL_UNAVAILABLE':'PROVIDER_REQUEST');
          assert.equal(error.message.includes('video'),name==='Transcription');
          assert.ok(!error.message.includes('PRIVATE_PROVIDER_BODY'));
          return true;
        });
      });
    }
  }
});

test('a genuinely timed-out first provider leaves time for fallback',async()=>{
  let calls=0;
  await mock(async(_url,init)=>{
    if(++calls===2) return completion();
    return new Promise((resolve,reject)=>{
      const keepAlive=setTimeout(()=>reject(new Error('Fallback budget was not enforced')),5000);
      init.signal.addEventListener('abort',()=>{clearTimeout(keepAlive);reject(init.signal.reason);},{once:true});
    });
  },async()=>{
    const result=await routedGenerate(candidates,'system','source',{},3000);
    assert.equal(result.provider,'openrouter');
    assert.equal(calls,2);
  });
});

test('router does not start a request when the deadline has no useful time left',async()=>{
  await mock(async()=>{throw new Error('must not fetch');},async()=>{
    await assert.rejects(routedGenerate(candidates,'system','source',{},999),{code:'TIMEOUT'});
    await assert.rejects(routedGenerate([],'system','source',{},5000),{code:'AI_NOT_CONFIGURED'});
  });
});

test('router logs omit credentials, source, instructions and provider response bodies',async()=>{
  const info=console.info,warn=console.warn,logs=[];
  console.info=console.warn=value=>logs.push(value);
  let calls=0;
  try {
    await mock(async()=>++calls===1?new Response('PRIVATE_RESPONSE_BODY',{status:429}):completion(),async()=>{
      await routedGenerate(candidates,'PRIVATE_INSTRUCTIONS','PRIVATE_SOURCE',{},5000);
    });
    for(const secret of ['PRIVATE_GROQ_FIXTURE','PRIVATE_ROUTER_FIXTURE','PRIVATE_INSTRUCTIONS','PRIVATE_SOURCE','PRIVATE_RESPONSE_BODY']) assert.ok(!logs.join('').includes(secret));
  } finally {console.info=info;console.warn=warn;}
});

test('bounded provider response parsing rejects oversized, malformed and non-object JSON',async()=>{
  await assert.rejects(providerJson(new Response('x'.repeat(101)),100),{code:'PROVIDER_RESPONSE_LIMIT'});
  for(const value of ['{bad','[]','null','"hello"']) await assert.rejects(providerJson(new Response(value)),{code:'PROVIDER_RESPONSE'});
});

test('OpenRouter records returned model only after schema and citation validation',async()=>{
  env.OPENROUTER_API_KEY='PRIVATE_ROUTER_FIXTURE';env.AI_PROVIDER='openrouter';
  try {
    for(const [reported,expected] of [['vendor/actual-model','vendor/actual-model'],['<script>bad</script>','openrouter/free'],['x'.repeat(201),'openrouter/free']]) {
      let model;
      await mock(async()=>completion(reported),async()=>{
        await ai('instruction','source',schemas.chat,[{id:0,text:'Source answer',start:null}],5000,m=>model=m);
        assert.equal(model,'openrouter:'+expected);
      });
    }
    let model;
    await mock(async()=>Response.json({model:'vendor/actual-model',choices:[{message:{content:JSON.stringify({answer:'invented',segmentIds:[99]})}}]}),async()=>{
      await assert.rejects(ai('instruction','source',schemas.chat,[{id:0,text:'Source answer',start:null}],5000,m=>model=m),{code:'INVALID_CITATION'});
      assert.equal(model,undefined);
    });
  } finally {delete env.OPENROUTER_API_KEY;delete env.AI_PROVIDER;}
});

test('configuration excludes unconfigured providers and respects explicit selection',()=>{
  env.GROQ_API_KEY='fixture';env.AI_PROVIDER_ORDER='gemini,groq,openrouter';
  try {
    assert.deepEqual(config().candidates.map(c=>c.provider),['groq']);
    env.AI_PROVIDER='gemini';assert.deepEqual(config().candidates,[]);
    env.AI_PROVIDER='unknown';assert.throws(()=>config(),{code:'AI_CONFIG'});
  } finally {delete env.GROQ_API_KEY;delete env.AI_PROVIDER;delete env.AI_PROVIDER_ORDER;}
});

test('Groq and OpenRouter receive full strict schemas with required nested fields and bounds',async()=>{
  const saved={...env};
  try {
    for(const provider of ['groq','openrouter']) {
      env.AI_PROVIDER=provider;env.GROQ_API_KEY='fixture';env.OPENROUTER_API_KEY='fixture';env.GROQ_MODEL='openai/gpt-oss-120b';
      await mock(async(_url,init)=>{
        const body=JSON.parse(init.body),format=body.response_format;
        assert.equal(format.type,'json_schema');assert.equal(format.json_schema.strict,true);
        const schema=format.json_schema.schema;
        assert.equal(schema.additionalProperties,false);
        assert.ok(schema.required.includes('chapters'));
        assert.equal(schema.properties.keyPoints.maxItems,32);
        assert.equal(schema.properties.keyPoints.items.additionalProperties,false);
        assert.equal(schema.properties.keyPoints.items.properties.segmentIds.items.type,'integer');
        assert.match(body.messages[0].content,/Required JSON Schema/);
        if(provider==='openrouter') assert.equal(body.provider.require_parameters,true);
        return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({title:'Safe title',overview:'Safe overview',keyPoints:[{text:'Safe fact',segmentIds:[7]}],chapters:[]})}}]});
      },async()=>assert.equal((await ai('Summarize','[7] Safe fact',summarySchema,[{id:7,text:'Safe fact',start:null}])).title,'Safe title'));
    }
  } finally {for(const key of Object.keys(env))if(key!=='DB')delete env[key];Object.assign(env,saved);}
});

test('format, bounds, truncated output and invented citations fall through before reporting success',async()=>{
  env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='groq,openrouter';env.GROQ_API_KEY='fixture';env.OPENROUTER_API_KEY='fixture';
  try {
    for(const bad of [
      {choices:[{message:{content:'not JSON'}}]},
      {choices:[{message:{content:JSON.stringify({answer:'missing references'})}}]},
      {choices:[{message:{content:JSON.stringify({answer:'x'.repeat(6001),segmentIds:[0]})}}]},
      {choices:[{message:{content:JSON.stringify({answer:'invented reference',segmentIds:[999]})}}]},
      {choices:[{finish_reason:'length',message:{content:'{unfinished'}}]},
    ]) {
      let calls=0,model;const logs=[],previous=console.info;console.info=value=>logs.push(value);
      try {
        await mock(async()=>++calls===1?Response.json(bad):completion(),async()=>{
          const result=await ai('Answer','[0] Source answer',schemas.chat,[{id:0,text:'Source answer',start:null}],5000,value=>model=value);
          assert.equal(result.answer,'Source answer');assert.equal(calls,2);
          assert.equal(model,'openrouter:vendor/actual-model');
        });
        assert.equal(logs.filter(line=>line.includes('ai_router_success')).length,1);
        assert.ok(logs.every(line=>!line.includes('"provider":"groq"')));
      } finally {console.info=previous;}
    }
  } finally {for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GROQ_API_KEY','OPENROUTER_API_KEY'])delete env[key];}
});

test('provider refusals stop without retrying another provider or recording a model',async()=>{
  env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='groq,openrouter';env.GROQ_API_KEY='fixture';env.OPENROUTER_API_KEY='fixture';
  try {
    for(const choice of [{message:{refusal:'PRIVATE_REFUSAL',content:null}},{finish_reason:'content_filter',message:{content:''}}]) {
      let calls=0,models=0;
      await mock(async()=>{calls++;return Response.json({choices:[choice]});},async()=>{
        await assert.rejects(ai('Answer','source',schemas.chat,[],5000,()=>models++),error=>error.code==='AI_BLOCKED'&&!error.message.includes('PRIVATE_REFUSAL'));
        assert.equal(calls,1);assert.equal(models,0);
      });
    }
  } finally {for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GROQ_API_KEY','OPENROUTER_API_KEY'])delete env[key];}
});

test('all invalid providers remain rejected and schema checks never silently coerce or save output',async()=>{
  env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='groq,openrouter';env.GROQ_API_KEY='fixture';env.OPENROUTER_API_KEY='fixture';
  let models=0,calls=0;
  try {
    await mock(async()=>{calls++;return Response.json({choices:[{message:{content:JSON.stringify({answer:'Answer',segmentIds:['0']})}}]});},async()=>{
      await assert.rejects(ai('Answer','source',schemas.chat,[{id:0,text:'source',start:null}],5000,()=>models++),{code:'INVALID_AI_OUTPUT'});
      assert.equal(calls,2);assert.equal(models,0);
    });
  } finally {for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GROQ_API_KEY','OPENROUTER_API_KEY'])delete env[key];}
});


test('provider cooldown persists across calls, skips quota-limited providers and isolates rotated keys',async()=>{
  env.AI_PROVIDER='router';env.AI_PROVIDER_ORDER='groq,openrouter';env.GROQ_API_KEY='cooldown-private-fixture';env.OPENROUTER_API_KEY='router-private-fixture';
  const urls=[];
  try {
    await mock(async(url)=>{urls.push(url);return url.includes('groq')?new Response('{}',{status:429,headers:{'retry-after':'120'}}):completion();},async()=>{
      for(let i=0;i<2;i++)await ai('Answer','source',schemas.chat,[{id:0,text:'Source answer',start:null}]);
    });
    assert.equal(urls.filter(url=>url.includes('groq')).length,1);
    assert.equal(urls.filter(url=>url.includes('openrouter')).length,2);
    const rows=(await env.DB.prepare("SELECT owner,count FROM limits WHERE owner LIKE 'provider:cooldown:%'").all()).results;
    assert.equal(rows.length,1);assert.ok(rows[0].count>Date.now()+100000);
    assert.ok(!rows[0].owner.includes('cooldown-private-fixture'));
    env.AI_PROVIDER='groq';
    await assert.rejects(availableAIProviders(),error=>error.code==='PROVIDER_COOLDOWN'&&error.retryAfterSeconds>60);
    env.GROQ_API_KEY='rotated-private-fixture';assert.equal((await availableAIProviders()).length,1);
    env.GROQ_API_KEY='cooldown-private-fixture';
    await env.DB.prepare("UPDATE limits SET count=0 WHERE owner LIKE 'provider:cooldown:%'").run();
    assert.equal((await availableAIProviders()).length,1);
  } finally {for(const key of ['AI_PROVIDER','AI_PROVIDER_ORDER','GROQ_API_KEY','OPENROUTER_API_KEY'])delete env[key];}
});


test('Groq json_validate_failed HTTP 400 falls through while true bad requests remain terminal',async()=>{
 let calls=0;
 await mock(async()=>++calls===1?Response.json({error:{code:'json_validate_failed',failed_generation:'PRIVATE_OUTPUT'}},{status:400}):completion(),async()=>{
  const result=await routedGenerate(candidates,'system','source',{},5000);
  assert.equal(result.provider,'openrouter');assert.equal(calls,2);
 });
 calls=0;
 await mock(async()=>{calls++;return Response.json({error:{code:'invalid_parameter'}},{status:400});},async()=>{
  await assert.rejects(routedGenerate(candidates,'system','source',{},5000),{code:'PROVIDER_REQUEST'});assert.equal(calls,1);
 });
});
