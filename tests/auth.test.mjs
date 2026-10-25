import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function compile(path, transform = value => value) {
  const source = transform(await readFile(new URL(path, import.meta.url), 'utf8'));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(output).toString('base64'));
}
const { credentialsError } = await compile('../lib/auth-validation.ts');
let response, throws = false, available = true;
globalThis.__authValidationClient = async () => available ? { auth: { getUser: async () => {
  if (throws) throw new Error('PRIVATE_AUTH_DETAIL');
  return response;
} } } : null;
const { getChatGPTUser, requireChatGPTUser } = await compile('../app/chatgpt-auth.ts', source => source
  .replace("import { redirect } from 'next/navigation';", "const redirect = path => { throw new Error('redirect:' + path); };")
  .replace("import { authClient } from '@/lib/supabase-server';", 'const authClient = globalThis.__authValidationClient;'));
delete globalThis.__authValidationClient;

test('signup validates email, minimum password characters and exact confirmation', () => {
  for (const email of ['', ' ', 'missing-at', 'a@@example.com', 'a b@example.com', 'a'.repeat(255)+'@example.com'])
    assert.match(credentialsError(email, 'Password-42!', true, 'Password-42!'), /email/);
  for (const password of ['', '1234567', '😀😀😀😀'])
    assert.ok(credentialsError('test@example.com', password, true, password));
  assert.match(credentialsError('test@example.com', 'Password-42!', true, 'Password-42! '), /match/);
  assert.equal(credentialsError(' test+tag@example.com ', 'long passphrase with spaces', true, 'long passphrase with spaces'), null);
});

test('login preserves existing password semantics rather than applying signup rules', () => {
  assert.equal(credentialsError('test@example.com', 'short', false, ''), null);
  assert.equal(credentialsError('test@example.com', '  exact password  ', false, ''), null);
  assert.match(credentialsError('test@example.com', '', false, ''), /password/);
});

test('server identity rejects missing, provider-rejected and anonymous users', async () => {
  for (const user of [null, {}, { id: 'u' }, { email: 'test@example.com' }, { id: 'u', email: 'test@example.com', is_anonymous: true }]) {
    response = { data: { user }, error: null };
    assert.equal(await getChatGPTUser(), null);
  }
  response = { data: { user: { id: 'u', email: 'test@example.com' } }, error: { message: 'expired or revoked' } };
  assert.equal(await getChatGPTUser(), null);
  await assert.rejects(requireChatGPTUser('https://attacker.invalid'), /redirect:\/login/);
});

test('auth outages fail closed without provider error details', async () => {
  try {
    throws = true;
    assert.equal(await getChatGPTUser(), null);
    throws = false; available = false;
    assert.equal(await getChatGPTUser(), null);
  } finally { throws = false; available = true; }
});

test('server uses verified user ID and ignores metadata attempts to change ownership', async () => {
  response = { data: { user: { id: 'verified-id', email: 'test@example.com', user_metadata: {
    userId: 'victim-id', role: 'admin', full_name: { malicious: true },
  } } }, error: null };
  assert.deepEqual(await getChatGPTUser(), { userId: 'verified-id', email: 'test@example.com', displayName: 'test@example.com', fullName: null });
});
