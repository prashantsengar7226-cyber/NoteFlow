CREATE TABLE IF NOT EXISTS ai_operations (
  owner TEXT NOT NULL,
  id TEXT NOT NULL,
  feature TEXT NOT NULL,
  week INTEGER NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('reserved','completed','released')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(owner,id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS ai_operations_week ON ai_operations(owner,week,state);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS vertex_budget (
  project TEXT PRIMARY KEY NOT NULL,
  day INTEGER NOT NULL,
  daily_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL
);
