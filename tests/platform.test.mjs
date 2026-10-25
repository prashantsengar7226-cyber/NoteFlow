import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@libsql/client';
import { Database } from '../.test-runtime/platform.mjs';
import { readFile, readdir } from 'node:fs/promises';

test('Vercel libSQL adapter applies the application schema, binds values, returns rows and rolls back batches', async () => {
  const client = createClient({ url: ':memory:' });
  const db = new Database(client);
  try {
    for (const file of (await readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()) {
      for (const sql of (await readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint').filter(s=>s.trim())) await client.execute(sql);
    }
    const insert = db.prepare('INSERT INTO accounts(owner,created_at) VALUES(?,?)');
    await insert.bind('alice',1).run();
    assert.equal((await db.prepare('SELECT owner FROM accounts WHERE owner=?').bind('alice').first()).owner,'alice');
    assert.equal((await db.prepare('SELECT owner FROM accounts WHERE owner=?').bind('bob').first()),null);
    assert.equal((await db.prepare('SELECT * FROM accounts').all()).results.length,1);
    await assert.rejects(db.batch([insert.bind('bob',2),insert.bind('alice',3)]));
    assert.equal(await db.prepare('SELECT owner FROM accounts WHERE owner=?').bind('bob').first(),null);
    const rows = await db.batch([db.prepare('UPDATE accounts SET plan=? WHERE owner=? RETURNING owner').bind('free','alice')]);
    assert.equal(rows[0].results[0].owner,'alice');
    await db.prepare('INSERT INTO notes(id,owner,title,source,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('n1','alice','Title','text',1,1).run();
    await db.prepare('INSERT INTO artifacts(note_id,kind,content,created_at) VALUES(?,?,?,?)').bind('n1','insights','{}',1).run();
    await db.prepare('DELETE FROM notes WHERE id=?').bind('n1').run();
    assert.equal((await db.prepare('SELECT * FROM artifacts').all()).results.length,0);
  } finally { client.close(); }
});
