import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyBackup} from '../scripts/backup-database.mjs';
const initial='CREATE TABLE notes(id TEXT PRIMARY KEY, content TEXT);';
const checksum=createHash('sha256').update(initial).digest('hex');
const dump=`BEGIN; ${initial} CREATE TABLE _noteflow_migrations(name TEXT PRIMARY KEY, checksum TEXT); INSERT INTO _noteflow_migrations VALUES('0000.sql','${checksum}'); INSERT INTO notes VALUES('test','Private fixture'); COMMIT;`;
const migrations=[{name:'0000.sql',sql:initial},{name:'0001.sql',sql:'CREATE TABLE jobs(id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id));'}];
test('production backup rehearsal restores rows and applies only pending migrations in memory',()=>{
  const report=verifyBackup(dump,migrations);
  assert.equal(report.rowCounts.notes,1);assert.deepEqual(report.applied,['0000.sql']);assert.deepEqual(report.pending,['0001.sql']);assert.equal(report.migrationRehearsal,'passed');
});
test('backup verification rejects changed migrations, row loss and external file access',()=>{
  assert.throws(()=>verifyBackup(dump,[{name:'0000.sql',sql:initial+' -- changed'}]));
  assert.throws(()=>verifyBackup(dump,[...migrations,{name:'0002.sql',sql:'DELETE FROM notes;'}]),/row counts/);
  assert.throws(()=>verifyBackup(dump+" ATTACH DATABASE ':memory:' AS other;",migrations));
});
