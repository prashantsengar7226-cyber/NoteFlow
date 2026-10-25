import test from 'node:test';
import assert from 'node:assert/strict';
import { context } from '../.test-runtime/harness.mjs';
import { body, handleError, guard } from '../.test-runtime/server.mjs';
import * as notes from '../.test-runtime/notes.mjs';
import * as actions from '../.test-runtime/actions.mjs';
import * as account from '../.test-runtime/account.mjs';
import * as workspace from '../.test-runtime/workspace.mjs';
import * as diagnostics from '../.test-runtime/diagnostics.mjs';
import * as transcribe from '../.test-runtime/transcribe.mjs';
import * as exportOne from '../.test-runtime/export.mjs';
import * as exportBatch from '../.test-runtime/export-batch.mjs';
import * as billing from '../.test-runtime/billing-route.mjs';

const request = (method, value, headers = {}) => new Request('https://app.example/api/test', {
  method, headers: { origin: 'https://app.example', 'content-type': 'application/json', ...headers },
  ...(method !== 'GET' ? { body: JSON.stringify(value ?? {}) } : {}),
});
const call = (route, method, value, owner) => context.run(owner, () => route[method](request(method, value)));

test('every protected route and method rejects signed-out and forged identity headers', async () => {
  for (const [route, methods] of [[notes, ['GET','POST','PATCH','DELETE']], [actions,['POST']], [account,['GET']],
    [workspace,['GET']], [diagnostics,['POST']], [transcribe,['POST']], [exportOne,['POST']], [exportBatch,['POST']], [billing,['POST']]]) {
    for (const method of methods) {
      const response = await context.run(null, () => route[method](request(method, {}, {
        'oai-authenticated-user-id': 'forged-admin', 'x-user-id': 'forged-admin', authorization: 'Bearer forged',
      })));
      assert.equal(response.status, 401);
      assert.equal((await response.json()).code, 'SIGN_IN_REQUIRED');
    }
  }
});

test('two local users cannot read, edit, delete, generate or export each other’s notes', async () => {
  const created = await call(notes, 'POST', {kind:'text', title:'Private A', text:'Private evidence only account A may read. '.repeat(20)}, 'audit-a');
  assert.equal(created.status, 201);
  const {note} = await created.json();
  const foreignRead = await context.run('audit-b', () => notes.GET(new Request('https://app.example/api/notes?id='+note.id)));
  assert.equal(foreignRead.status,404);
  for (const [route, method, payload] of [[notes,'PATCH',{id:note.id,title:'stolen'}], [notes,'DELETE',{id:note.id}],
    [actions,'POST',{id:note.id,action:'basic'}], [exportOne,'POST',{id:note.id}], [exportBatch,'POST',{ids:[note.id]}]]) {
    const response = await call(route,method,payload,'audit-b');
    assert.equal(response.status,404);
    assert.ok(!(await response.text()).includes('Private evidence'));
  }
  const own = await context.run('audit-a', () => notes.GET(new Request('https://app.example/api/notes?id='+note.id)));
  assert.equal(own.status,200);
});

test('SQL injection is treated as data in titles and identifiers', async () => {
  const title = "'); DROP TABLE notes; --";
  const response = await call(notes,'POST',{kind:'text',title,text:'A safe text source. '.repeat(20)},'audit-sql');
  assert.equal(response.status,201);
  assert.equal((await response.json()).note.title,title);
  const attempt = await context.run('audit-sql', () => notes.GET(new Request('https://app.example/api/notes?id='+encodeURIComponent("' OR 1=1 --"))));
  assert.equal(attempt.status,404);
  assert.equal((await call(notes,'GET',null,'audit-sql')).status,200);
});

test('JSON body validation enforces media type, syntax and actual bytes without trusting content-length', async () => {
  await assert.rejects(body(new Request('https://app.example',{method:'POST',body:'{}',headers:{'content-type':'text/plain'}})),{code:'CONTENT_TYPE'});
  await assert.rejects(body(new Request('https://app.example',{method:'POST',body:'{bad',headers:{'content-type':'application/json'}})),{code:'INVALID_JSON'});
  await assert.rejects(body(new Request('https://app.example',{method:'POST',body:'x'.repeat(101),headers:{'content-type':'application/json','content-length':'1'}}),100),{code:'TOO_LARGE'});
});

test('server rejects oversized extracted text and multipart uploads', async () => {
  const oversized = await call(notes,'POST',{kind:'text',title:'Too large',text:'x'.repeat(300001)},'audit-size');
  assert.equal(oversized.status,400);
  const multipart = await context.run('audit-size', () => notes.POST(new Request('https://app.example/api/notes',{
    method:'POST',headers:{origin:'https://app.example','content-type':'multipart/form-data; boundary=test'},body:'test',
  })));
  assert.equal(multipart.status,415);
});

test('unexpected errors never return SQL, paths, secret values or stack traces', async () => {
  const original = console.error;
  const logs=[];
  console.error = value => logs.push(value);
  try {
    const response = handleError(new Error('SELECT secret FROM accounts; C:\\private\\secret.txt credential=SENSITIVE_FIXTURE'));
    assert.equal(response.status,500);
    const output=await response.text();
    for (const forbidden of ['SELECT','secret.txt','SENSITIVE_FIXTURE','Error:',' at ']) assert.ok(!output.includes(forbidden));
    assert.ok(!logs.join('').includes('SENSITIVE_FIXTURE'));
  } finally { console.error=original; }
});

test('write guard rejects null origins and cross-site requests', async () => {
  await assert.rejects(context.run('audit-origin',()=>guard(new Request('https://app.example/api/test',{method:'POST'}),true)),{code:'ORIGIN'});
  for (const headers of [{origin:'null'}, {origin:'https://evil.example'}, {'sec-fetch-site':'cross-site'}]) {
    await assert.rejects(context.run('audit-origin',()=>guard(request('POST',{},headers),true)),{code:'ORIGIN'});
  }
});
