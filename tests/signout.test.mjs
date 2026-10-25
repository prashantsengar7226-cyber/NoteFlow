import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

let signouts = 0;
let failure = null;
const source = (await readFile(new URL('../app/auth/signout/route.ts', import.meta.url), 'utf8'))
  .replace("import { authClient } from '@/lib/supabase-server';", 'const authClient = globalThis.__signoutTestClient;');
globalThis.__signoutTestClient = async () => ({ auth: { signOut: async () => {
  signouts++;
  if (failure === 'throw') throw new Error('SENSITIVE_PROVIDER_DETAIL');
  return {error: failure};
} } });
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { POST } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
delete globalThis.__signoutTestClient;

test('signout accepts the browser host when Next uses an internal hostname', async () => {
  const response = await POST(new Request('http://localhost:3000/auth/signout', {
    method: 'POST', headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'same-origin' },
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/login');
  assert.equal(signouts, 1);
});

test('signout errors never claim success or expose provider details', async () => {
  try {
    for (failure of [{message:'SENSITIVE_PROVIDER_DETAIL'}, 'throw']) {
      const r=await POST(new Request('http://localhost:3000/auth/signout',{
        method:'POST',headers:{origin:'http://localhost:3000'},
      }));
      assert.equal(r.status,503);
      assert.equal(r.headers.get('location'),null);
      assert.equal(r.headers.get('cache-control'),'no-store');
      const text=await r.text();
      assert.ok(text.includes('session may still be active'));
      assert.ok(!text.includes('SENSITIVE_PROVIDER_DETAIL'));
    }
  } finally {failure=null;}
});

test('signout rejects missing, null, foreign and cross-site origins before touching the session', async () => {
  const before = signouts;
  for (const extra of [{}, { origin: 'null' }, { origin: 'https://attacker.example' },
    { origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'cross-site' },
    { origin: 'https://127.0.0.1:3000' }]) {
    const response = await POST(new Request('http://localhost:3000/auth/signout', {
      method: 'POST', headers: { host: '127.0.0.1:3000', ...extra },
    }));
    assert.equal(response.status, 403);
  }
  assert.equal(signouts, before);
});
