CREATE TABLE IF NOT EXISTS ai_credentials (
  owner TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  revision TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  detail TEXT NOT NULL,
  credential_revision TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  failures INTEGER NOT NULL DEFAULT 0,
  next_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  run_id TEXT,
  completed_parts INTEGER NOT NULL DEFAULT 0,
  total_parts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_active_note ON ai_jobs(note_id) WHERE state IN ('queued','running','retry');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_jobs_due ON ai_jobs(state,next_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS ai_owner_leases (
  owner TEXT PRIMARY KEY NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
