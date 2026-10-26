import { DatabaseSync } from 'node:sqlite';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync, readdirSync } from 'node:fs';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
for (const file of readdirSync('drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort())
  sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
class Statement {
  constructor(sql) {
    this.sql = sql;
    this.values = [];
  }
  bind(...values) {
    this.values = values;
    return this;
  }
  async first() {
    return sqlite.prepare(this.sql).get(...this.values) || null;
  }
  async all() {
    return { results: sqlite.prepare(this.sql).all(...this.values) };
  }
  async run() {
    return sqlite.prepare(this.sql).run(...this.values);
  }
}
export const env = {
  DB: {
    prepare(sql) {
      return new Statement(sql);
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const result = [];
        for (const s of statements)
          result.push(await (/\bRETURNING\b/i.test(s.sql) ? s.all() : s.run()));
        sqlite.exec('COMMIT');
        return result;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  },
};
export const context = new AsyncLocalStorage();
export async function getChatGPTUser() {
  const owner = context.getStore();
  return owner ? { userId: owner, email: owner + '@test.example' } : null;
}

export const afterTasks=[];
export function after(callback){afterTasks.push(callback);}
