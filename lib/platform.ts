import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';
import { AppError } from './core';

const result = (value: ResultSet) => ({ results: value.rows.map(row => ({ ...row })), success: true, meta: { changes: value.rowsAffected } });
export class Statement {
  constructor(readonly client: Client, readonly sql: string, readonly args: InValue[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.client, this.sql, values as InValue[]); }
  async first<T = Record<string, unknown>>() { const value = await this.client.execute({ sql: this.sql, args: this.args }); return (value.rows[0] ? { ...value.rows[0] } : null) as T | null; }
  async all<T = Record<string, unknown>>() { return result(await this.client.execute({ sql: this.sql, args: this.args })) as { results: T[]; success: boolean; meta: { changes: number } }; }
  async run() { return result(await this.client.execute({ sql: this.sql, args: this.args })); }
}
export class Database {
  constructor(readonly client: Client) {}
  prepare(sql: string) { return new Statement(this.client, sql); }
  async batch(statements: Statement[]) {
    // libSQL executes the whole batch in one write transaction, with rollback on failure.
    return (await this.client.batch(statements.map(s => ({ sql: s.sql, args: s.args })), 'write')).map(result);
  }
}
let database: Database | undefined;
function getDatabase() {
  if (database) return database;
  const url = process.env.TURSO_DATABASE_URL;
  if (!url || (process.env.VERCEL && (!/^libsql:\/\//.test(url) || !process.env.TURSO_AUTH_TOKEN)))
    throw new AppError(503, 'DATABASE_UNAVAILABLE', 'Workspace storage is not configured.');
  database = new Database(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' }));
  return database;
}
export const env = new Proxy({} as { DB: Database }, {
  get(_target, key: string) { return key === 'DB' ? getDatabase() : process.env[key]; },
});
