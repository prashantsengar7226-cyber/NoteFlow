import { createClient } from '@libsql/client';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.TURSO_DATABASE_URL) throw new Error('Set TURSO_DATABASE_URL in .env.local or your environment.');
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
try {
  await client.execute('CREATE TABLE IF NOT EXISTS _noteflow_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
  for (const name of (await readdir('drizzle')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = await readFile('drizzle/' + name, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existing = await client.execute({ sql: 'SELECT checksum FROM _noteflow_migrations WHERE name=?', args: [name] });
    if (existing.rows.length) {
      if (existing.rows[0].checksum !== checksum) throw new Error('Previously applied migration changed: ' + name);
      continue;
    }
    const statements = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
    await client.batch([...statements, { sql: 'INSERT INTO _noteflow_migrations(name,checksum) VALUES(?,?)', args: [name, checksum] }], 'write');
    console.log('Applied ' + name);
  }
  console.log('Database migrations complete.');
} finally { client.close(); }
